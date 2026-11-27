// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createOnlineApi } from './api'
import type { RoomView } from './rooms'
import type { Database } from './sql'

const origin = 'https://draft.example'
const url = `${origin}/api/online`
const pepper = 'integration-tests-need-no-real-service-secrets'
const database = new PGlite()
const notifications: Array<{ roomId: string; revision: number }> = []
let failRequestInsert = false
const store: Database = {
  transaction: (work) => database.transaction((tx) => work({
    query: (statement, values) => {
      if (failRequestInsert && statement.startsWith('INSERT INTO draft_requests')) {
        failRequestInsert = false
        throw new Error('Injected transaction failure')
      }
      return tx.query(statement, values)
    },
  })),
}

const api = createOnlineApi({
  database: store, origin, pepper, cronSecret: 'integration-cleanup',
  realtime: {
    key: 'test-key', cluster: 'test-cluster', authorize: (roomId, socketId) => ({ auth: `${roomId}:${socketId}` }),
    async notify(change) {
      const persisted = await database.query<{ revision: number }>('SELECT revision FROM draft_rooms WHERE id=$1', [change.roomId])
      expect(persisted.rows[0]?.revision).toBe(change.revision)
      notifications.push(change)
    },
  },
})

beforeAll(async () => {
  await database.exec(await readFile(new URL('./migrations/001_rooms.sql', import.meta.url), 'utf8'))
}, 30_000)
beforeEach(async () => {
  notifications.length = 0
  failRequestInsert = false
  await database.exec('TRUNCATE draft_rooms, draft_requests, draft_rate_buckets')
})
afterAll(() => database.close())

type Reply = { status: string; room?: RoomView; invite?: string; auth?: string }

async function post(data: unknown, cookie = '', requestOrigin = origin) {
  const response = await api(new Request(url, {
    method: 'POST', body: JSON.stringify(data), headers: { 'content-type': 'application/json', cookie, origin: requestOrigin },
  }))
  return { response, data: await response.json() as Reply }
}

async function get(roomId: string, cookie: string) {
  const response = await api(new Request(`${url}?room=${roomId}`, { headers: { cookie } }))
  return { response, data: await response.json() as Reply }
}

async function session() {
  const { response } = await post({ type: 'session' })
  expect(response.status).toBe(200)
  const cookie = response.headers.get('set-cookie')!
  expect(cookie).toMatch(/; Secure; HttpOnly; SameSite=Lax$/)
  return cookie.split(';')[0]!
}

function startCommand(room: RoomView) {
  return { roomId: room.id, revision: room.revision, requestId: randomUUID(), type: 'start' }
}

function roundCommand(room: RoomView) {
  return {
    roomId: room.id, revision: room.revision, requestId: randomUUID(),
    matchId: room.draft!.matchId, roundNumber: room.draft!.roundNumber,
  }
}

async function lobby() {
  const host = await session()
  const guest = await session()
  const create = { type: 'create', requestId: randomUUID(), categoryId: 'dream-vacation', name: 'Alex' }
  const response = await post(create, host)
  expect(response.response.status).toBe(201)
  return { host, guest, room: response.data.room!, invite: response.data.invite!, create }
}

async function start() {
  const { host, guest, room, invite } = await lobby()
  const joined = await post({ type: 'join', roomId: room.id, invite, name: 'Sam' }, guest)
  expect(joined.response.status).toBe(200)
  const started = await post(startCommand(joined.data.room!), host)
  expect(started.response.status).toBe(200)
  return { host, guest, room: started.data.room! }
}

describe('online API with PostgreSQL', () => {
  it('authenticates seats, makes invites single-use, and authorizes one private room', async () => {
    const { host, guest, room, invite, create } = await lobby()
    const outsider = await session()
    expect((await post(create, host)).data).toMatchObject({ status: 'replayed', room: { id: room.id } })
    expect((await post({ ...create, name: 'Changed' }, host)).response.status).toBe(409)
    expect((await get(room.id, '')).response.status).toBe(401)
    expect((await get(room.id, outsider)).response.status).toBe(404)
    expect((await get(room.id, `${host}a`)).response.status).toBe(401)
    expect((await post(startCommand(room), host)).data.status).toBe('waiting_for_player')
    expect((await post(startCommand(room), host, 'https://other.example')).response.status).toBe(403)
    expect((await post({ type: 'subscribe', roomId: room.id, socketId: '12.34' }, outsider)).response.status).toBe(404)

    const rotated = await post({ ...startCommand(room), type: 'rotateInvite' }, host)
    const join = { type: 'join', roomId: room.id, invite: rotated.data.invite, name: 'Sam' }
    expect((await post({ ...join, invite }, guest)).response.status).toBe(404)
    const attempts = await Promise.all([post(join, guest), post(join, outsider)])
    expect(attempts.map(({ response }) => response.status).sort()).toEqual([200, 404])
    const joinedIndex = attempts.findIndex(({ response }) => response.ok)
    const winner = joinedIndex === 0 ? guest : outsider
    const joined = attempts[joinedIndex]!.data.room!
    expect((await post(join, winner)).data.status).toBe('replayed')
    expect((await post(startCommand(joined), winner)).response.status).toBe(403)
    const subscription = await post({ type: 'subscribe', roomId: room.id, socketId: '12.34', channel: 'other-room' }, winner)
    expect(subscription.data.auth).toBe(`${room.id}:12.34`)
    expect(subscription.response.headers.get('cache-control')).toBe('no-store')
  })

  it('keeps the opposing snapshot identical until resolution and retries without a second charge', async () => {
    const { host, guest, room } = await start()
    expect(notifications).toHaveLength(2)
    const before = (await get(room.id, guest)).data.room!.draft
    const first = { ...roundCommand(room), type: 'bid', amount: 5, seat: 'p2' }
    const locked = await post(first, host)
    expect(locked.data.room?.draft?.ownBid).toMatchObject({ seat: 'p1', locked: true })
    expect(locked.data.room?.revision).toBe(room.revision)
    expect((await get(room.id, guest)).data.room?.draft).toEqual(before)
    expect(notifications).toHaveLength(2)
    expect((await post(first, host)).data.status).toBe('replayed')
    expect((await post({ ...first, amount: 4 }, host)).data.status).toBe('request_conflict')

    const second = { ...roundCommand(room), type: 'bid', amount: 3 }
    const resolved = await post(second, guest)
    expect(resolved.data.room?.draft?.currentOutcome).toMatchObject({ p1Bid: 5, p2Bid: 3, winner: 'p1', paid: 5 })
    expect((await post(second, guest)).data.status).toBe('replayed')
    expect((await get(room.id, host)).data.room?.draft?.players[0]?.budgetRemaining).toBe(15)
    expect(notifications).toHaveLength(3)
  })

  it('rolls back a failed write and resolves concurrent submissions once', async () => {
    const { room, host, guest } = await start()
    const first = { ...roundCommand(room), type: 'bid', amount: 8 }
    failRequestInsert = true
    expect((await post(first, host)).response.status).toBe(503)
    expect((await get(room.id, host)).data.room?.draft?.ownBid?.locked).toBe(false)
    const second = { ...roundCommand(room), type: 'bid', amount: 8 }
    const bids = await Promise.all([post(first, host), post(second, guest)])
    expect(bids.every(({ response }) => response.ok)).toBe(true)
    const read = await get(room.id, guest)
    expect(read.data.room?.revision).toBe(room.revision + 1)
    expect(read.data.room?.draft?.currentOutcome).toMatchObject({ kind: 'won', tied: true, winner: 'p1' })
    expect(read.data.room?.draft?.players[0]?.budgetRemaining).toBe(12)
  })

  it('settles timeouts, restricts voting to one ballot per seat, and cleans expired rooms', async () => {
    const { room, host, guest } = await start()
    let latest = room
    for (let round = 1; round <= 12; round++) {
      await database.query("UPDATE draft_rooms SET draft=jsonb_set(draft,'{deadlineAt}','0'::jsonb) WHERE id=$1", [room.id])
      const timedOut = await post({ ...roundCommand(latest), type: 'deadline' }, guest)
      expect(timedOut.data.room?.draft?.currentOutcome?.kind).toBe(round <= 2 ? 'discarded' : 'mandatory')
      latest = (await post({ ...roundCommand(timedOut.data.room!), type: 'next' }, guest)).data.room!
    }
    expect(latest.draft?.stage).toBe('finished')
    expect(latest.voting?.open).toBe(true)
    const ballot = { ...startCommand(latest), type: 'vote', vote: 'tie' }
    const voted = await post(ballot, host)
    expect(voted.data.room?.voting).toMatchObject({ ownVote: 'tie', tally: { tie: 1 } })
    expect((await post(ballot, host)).data.status).toBe('replayed')
    expect((await post({ ...ballot, revision: voted.data.room!.revision, requestId: randomUUID() }, host)).data.status).toBe('already_voted')
    await database.query('UPDATE draft_rooms SET vote_expires_at_ms=0 WHERE id=$1', [room.id])
    expect((await post({ ...ballot, revision: voted.data.room!.revision }, guest)).data.status).toBe('voting_closed')

    await database.query('UPDATE draft_rooms SET expires_at_ms=0 WHERE id=$1', [room.id])
    expect((await get(room.id, host)).response.status).toBe(404)
    expect((await api(new Request(`${url}?cleanup=1`))).status).toBe(404)
    const cleanup = await api(new Request(`${url}?cleanup=1`, { headers: { authorization: 'Bearer integration-cleanup' } }))
    expect(cleanup.status).toBe(200)
    expect((await database.query('SELECT id FROM draft_rooms')).rows).toHaveLength(0)
    expect((await database.query('SELECT room_id FROM draft_requests')).rows).toHaveLength(0)
  }, 15_000)
})
