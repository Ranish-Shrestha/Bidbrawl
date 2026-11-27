import { categories } from '../../src/data/categories.js'
import type { LocalVote, PlayerId } from '../../src/game/types.js'
import { digest, equalDigest, randomToken } from './auth.js'
import { createOnlineDraft, getOnlineSnapshot, updateOnlineDraft } from './draft.js'
import type { OnlineDraft } from './draft.js'
import type { OnlineRequest } from './protocol.js'
import { databaseTime } from './sql.js'
import type { Sql } from './sql.js'

const minute = 60_000
const lobbyLifetime = 30 * minute
const activeLifetime = 60 * minute
const finishedLifetime = 24 * activeLifetime
const voteLifetime = 15 * minute

type Room = {
  id: string
  host_session: string
  guest_session: string | null
  host_name: string
  guest_name: string | null
  category_id: string
  invite_digest: string | null
  revision: number
  expires_at_ms: number
  vote_expires_at_ms: number | null
  p1_vote: LocalVote | null
  p2_vote: LocalVote | null
  draft: OnlineDraft | null
}

type RoomCommand = Exclude<OnlineRequest, { type: 'create' | 'session' | 'join' | 'subscribe' }>
export type ApiResult = {
  code: number
  body: Record<string, unknown>
  changed?: { roomId: string; revision: number }
}

export function result(code: number, status: string): ApiResult {
  return { code, body: { status } }
}

function view(room: Room, seat: PlayerId, now: number) {
  const { id, revision, category_id, host_name, guest_name, draft, vote_expires_at_ms, p1_vote, p2_vote } = room
  return {
    id,
    revision,
    categoryId: category_id,
    seat,
    players: { p1: host_name, p2: guest_name },
    draft: draft ? getOnlineSnapshot(draft, seat) : null,
    voting: vote_expires_at_ms === null ? null : {
      expiresAt: vote_expires_at_ms,
      open: now < vote_expires_at_ms,
      ownVote: seat === 'p1' ? p1_vote : p2_vote,
      tally: {
        p1: Number(p1_vote === 'p1') + Number(p2_vote === 'p1'),
        p2: Number(p1_vote === 'p2') + Number(p2_vote === 'p2'),
        tie: Number(p1_vote === 'tie') + Number(p2_vote === 'tie'),
      },
    },
    serverTime: now,
  }
}

export type RoomView = ReturnType<typeof view>

function roomResult(room: Room, seat: PlayerId, now: number, status = 'ok', code = 200, invite?: string): ApiResult {
  return { code, body: { status, room: view(room, seat, now), ...(invite ? { invite } : {}) } }
}

function seatFor(room: Room, session: string): PlayerId | null {
  return room.host_session === session ? 'p1' : room.guest_session === session ? 'p2' : null
}

async function findRoom(sql: Sql, id: string, lock = false): Promise<Room | null> {
  const { rows } = await sql.query<Room>(`SELECT * FROM draft_rooms WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id])
  return rows[0] ?? null
}

async function saveRoom(sql: Sql, room: Room) {
  await sql.query(
    `UPDATE draft_rooms SET guest_session=$2, guest_name=$3, invite_digest=$4, revision=$5,
      expires_at_ms=$6, vote_expires_at_ms=$7, p1_vote=$8, p2_vote=$9, draft=$10::jsonb WHERE id=$1`,
    [room.id, room.guest_session, room.guest_name, room.invite_digest, room.revision, room.expires_at_ms,
      room.vote_expires_at_ms, room.p1_vote, room.p2_vote, room.draft ? JSON.stringify(room.draft) : null],
  )
}

export async function readRoom(sql: Sql, roomId: string, session: string): Promise<ApiResult> {
  const room = await findRoom(sql, roomId)
  const seat = room && seatFor(room, session)
  if (!room || !seat) return result(404, 'room_unavailable')
  const now = await databaseTime(sql)
  return room.expires_at_ms > now ? roomResult(room, seat, now) : result(404, 'room_unavailable')
}

export async function createRoom(sql: Sql, command: Extract<OnlineRequest, { type: 'create' }>, session: string, pepper: string): Promise<ApiResult> {
  if (!categories.some((category) => category.id === command.categoryId)) return result(400, 'invalid_category')
  await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [session])
  const now = await databaseTime(sql)
  const existing = (await sql.query<Room>('SELECT * FROM draft_rooms WHERE host_session=$1 AND creation_key=$2', [session, command.requestId])).rows[0]
  if (existing) {
    if (existing.category_id !== command.categoryId || existing.host_name !== command.name) return result(409, 'request_conflict')
    return existing.expires_at_ms > now ? roomResult(existing, 'p1', now, 'replayed') : result(404, 'room_unavailable')
  }
  const active = await sql.query<{ count: number }>(
    'SELECT count(*)::integer AS count FROM draft_rooms WHERE host_session=$1 AND expires_at_ms>$2 AND vote_expires_at_ms IS NULL',
    [session, now],
  )
  if ((active.rows[0]?.count ?? 0) >= 3) return result(429, 'room_limit')

  const id = randomToken(16)
  const invite = randomToken()
  const { rows } = await sql.query<Room>(
    `INSERT INTO draft_rooms (id,host_session,host_name,category_id,creation_key,invite_digest,expires_at_ms)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, session, command.name, command.categoryId, command.requestId, digest(pepper, 'invite', invite), now + lobbyLifetime],
  )
  return roomResult(rows[0]!, 'p1', now, 'created', 201, invite)
}

export async function joinRoom(sql: Sql, command: Extract<OnlineRequest, { type: 'join' }>, session: string, pepper: string): Promise<ApiResult> {
  const room = await findRoom(sql, command.roomId, true)
  const now = await databaseTime(sql)
  if (!room || room.expires_at_ms <= now) return result(404, 'room_unavailable')
  if (room.guest_session === session) return roomResult(room, 'p2', now, 'replayed')
  if (room.host_session === session || !room.invite_digest || !equalDigest(room.invite_digest, digest(pepper, 'invite', command.invite))) {
    return result(404, 'room_unavailable')
  }
  room.guest_session = session
  room.guest_name = command.name
  room.invite_digest = null
  room.revision += 1
  await saveRoom(sql, room)
  return { ...roomResult(room, 'p2', now, 'joined'), changed: { roomId: room.id, revision: room.revision } }
}

export async function mutateRoom(sql: Sql, command: RoomCommand, session: string, pepper: string): Promise<ApiResult> {
  const room = await findRoom(sql, command.roomId, true)
  const seat = room && seatFor(room, session)
  if (!room || !seat) return result(404, 'room_unavailable')
  // Sample time after acquiring the room lock so a queued bid cannot use a stale clock.
  const now = await databaseTime(sql)
  if (room.expires_at_ms <= now) return result(404, 'room_unavailable')

  const fingerprint = digest(pepper, 'request', JSON.stringify(command))
  const requestKey = [room.id, seat, command.requestId]
  const previous = await sql.query<{ fingerprint: string }>(
    'SELECT fingerprint FROM draft_requests WHERE room_id=$1 AND seat=$2 AND request_id=$3', requestKey,
  )
  if (previous.rows[0]) {
    return previous.rows[0].fingerprint === fingerprint ? roomResult(room, seat, now, 'replayed') : result(409, 'request_conflict')
  }
  if (command.revision !== room.revision) return roomResult(room, seat, now, 'stale', 409)

  const initialRevision = room.revision
  let invite: string | undefined
  let status = 'applied'
  let code = 200
  switch (command.type) {
    case 'rotateInvite':
    case 'start': {
      if (seat !== 'p1') return result(403, 'forbidden')
      if (room.draft) return roomResult(room, seat, now, 'closed', 409)
      if (command.type === 'rotateInvite') {
        if (room.guest_session) return roomResult(room, seat, now, 'closed', 409)
        invite = randomToken()
        room.invite_digest = digest(pepper, 'invite', invite)
        room.revision += 1
        break
      }
      if (!room.guest_name) return roomResult(room, seat, now, 'waiting_for_player', 409)
      const category = categories.find(({ id }) => id === room.category_id)
      const draft = category && createOnlineDraft({
        matchId: randomToken(16), category, names: { p1: room.host_name, p2: room.guest_name }, now,
      })
      if (!draft) throw new Error('Could not initialize authoritative draft')
      room.revision += 1
      room.draft = { ...draft, revision: room.revision }
      room.expires_at_ms = now + activeLifetime
      break
    }
    case 'vote': {
      if (room.vote_expires_at_ms === null || room.vote_expires_at_ms <= now || !room.draft) {
        return roomResult(room, seat, now, 'voting_closed', 409)
      }
      const field = seat === 'p1' ? 'p1_vote' : 'p2_vote'
      if (room[field] !== null) return roomResult(room, seat, now, 'already_voted', 409)
      room[field] = command.vote
      room.revision += 1
      room.draft = { ...room.draft, revision: room.revision }
      break
    }
    default: {
      if (!room.draft) return roomResult(room, seat, now, 'closed', 409)
      const round = { matchId: command.matchId, roundNumber: command.roundNumber, revision: command.revision }
      const action = command.type === 'bid' ? { ...round, type: 'BID' as const, seat, amount: command.amount }
        : { ...round, type: command.type === 'next' ? 'NEXT' as const : 'CHECK_DEADLINE' as const }
      const update = updateOnlineDraft(room.draft, action, now)
      status = update.status
      code = status === 'invalid_bid' ? 422 : status === 'applied' || status === 'waiting' ? 200 : 409
      if (update.draft === room.draft) return roomResult(room, seat, now, status, code)

      room.draft = update.draft
      room.revision = update.draft.revision
      if (update.draft.match.stage === 'finished') {
        room.vote_expires_at_ms = now + voteLifetime
        room.expires_at_ms = now + finishedLifetime
      } else room.expires_at_ms = now + activeLifetime
      break
    }
  }

  await saveRoom(sql, room)
  await sql.query('INSERT INTO draft_requests (room_id,seat,request_id,fingerprint) VALUES ($1,$2,$3,$4)', [...requestKey, fingerprint])
  const reply = roomResult(room, seat, now, status, code, invite)
  if (room.revision !== initialRevision) reply.changed = { roomId: room.id, revision: room.revision }
  return reply
}
