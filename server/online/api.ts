import { digest, equalDigest, mintSession, readSession } from './auth.js'
import { readCommand, roomIdPattern } from './protocol.js'
import { createRoom, joinRoom, mutateRoom, readRoom, result } from './rooms.js'
import type { ApiResult } from './rooms.js'
import type { Realtime } from './realtime.js'
import { databaseTime } from './sql.js'
import type { Database, Sql } from './sql.js'

type Options = { database: Database; pepper: string; origin: string; cronSecret?: string; realtime?: Realtime }
const minute = 60_000
const rates = {
  session: { window: 10 * minute, device: 20, address: 90 },
  create: { window: 10 * minute, device: 8, address: 30 },
  join: { window: 10 * minute, device: 15, address: 60 },
  read: { window: minute, device: 120, address: 600 },
  subscribe: { window: minute, device: 20, address: 120 },
  mutate: { window: minute, device: 60, address: 300 },
} as const
type Operation = keyof typeof rates

function json(reply: ApiResult, headers?: Record<string, string>): Response {
  return Response.json(reply.body, { status: reply.code, headers: { 'Cache-Control': 'no-store', ...headers } })
}

async function take(sql: Sql, subject: string, operation: Operation, bucket: number, limit: number) {
  const { rows } = await sql.query(
    `INSERT INTO draft_rate_buckets (subject,operation,window_start_ms) VALUES ($1,$2,$3)
    ON CONFLICT (subject,operation,window_start_ms) DO UPDATE SET attempts=draft_rate_buckets.attempts+1
    WHERE draft_rate_buckets.attempts<$4 RETURNING attempts`,
    [subject, operation, bucket, limit],
  )
  return rows.length > 0
}

async function rateLimit(database: Database, operation: Operation, address: string, session: string | null) {
  const rule = rates[operation]
  return database.transaction(async (sql) => {
    const bucket = Math.floor(await databaseTime(sql) / rule.window) * rule.window
    if (!await take(sql, address, operation, bucket, rule.address)) return false
    return !session || await take(sql, session, operation, bucket, rule.device)
  })
}

async function cleanup(sql: Sql) {
  const now = await databaseTime(sql)
  await sql.query(`DELETE FROM draft_rooms WHERE id IN (
    SELECT id FROM draft_rooms WHERE expires_at_ms <= $1 ORDER BY expires_at_ms LIMIT 500 FOR UPDATE SKIP LOCKED)`, [now])
  await sql.query(`DELETE FROM draft_rate_buckets WHERE (subject,operation,window_start_ms) IN (
    SELECT subject,operation,window_start_ms FROM draft_rate_buckets WHERE window_start_ms < $1
    ORDER BY window_start_ms LIMIT 5000 FOR UPDATE SKIP LOCKED)`, [now - 24 * 60 * minute])
}

export function createOnlineApi({ database, pepper, origin, cronSecret, realtime }: Options) {
  return async function fetchOnline(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.searchParams.has('cleanup')) {
        if (!cronSecret || !equalDigest(request.headers.get('authorization') ?? '', `Bearer ${cronSecret}`)) {
          return json(result(404, 'not_found'))
        }
        await database.transaction(cleanup)
        return json(result(200, 'cleaned'))
      }
      if (request.method !== 'GET' && request.method !== 'POST') return json(result(405, 'method_not_allowed'), { Allow: 'GET, POST' })
      if (request.method === 'POST' && request.headers.get('origin') !== origin) return json(result(403, 'invalid_origin'))

      const roomId = url.searchParams.get('room')
      if (request.method === 'GET' && roomId === null) {
        return json({ code: 200, body: { status: 'available', realtime: realtime ? { key: realtime.key, cluster: realtime.cluster } : null } })
      }

      const command = request.method === 'POST' ? await readCommand(request) : null
      if (request.method === 'POST' && !command) return json(result(400, 'invalid_request'))
      const session = readSession(request, pepper)
      if (command?.type !== 'session' && !session) return json(result(401, 'session_required'))
      const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim().slice(0, 64) || 'unknown'
      const address = digest(pepper, 'rate-address', ip)
      const type = command?.type
      const operation = !type ? 'read' : type === 'session' || type === 'create' || type === 'join' || type === 'subscribe' ? type : 'mutate'
      if (!await rateLimit(database, operation, address, session)) {
        return json(result(429, 'rate_limited'), { 'Retry-After': String(rates[operation].window / 1_000) })
      }
      if (type === 'session') return json(result(200, 'session'), session ? undefined : { 'Set-Cookie': mintSession(pepper) })

      const reply = await database.transaction(async (sql) => {
        if (!command) return roomId && roomIdPattern.test(roomId) ? readRoom(sql, roomId, session!) : result(404, 'room_unavailable')
        if (command.type === 'create') return createRoom(sql, command, session!, pepper)
        if (command.type === 'join') return joinRoom(sql, command, session!, pepper)
        if (command.type === 'subscribe') {
          const access = await readRoom(sql, command.roomId, session!)
          if (access.code !== 200) return access
          if (!realtime) return result(503, 'realtime_unavailable')
          return { code: 200, body: realtime.authorize(command.roomId, command.socketId) }
        }
        return mutateRoom(sql, command, session!, pepper)
      })
      if (reply.changed && realtime) {
        try { await realtime.notify(reply.changed) } catch { /* The authenticated polling path recovers the committed revision. */ }
      }
      return json(reply)
    } catch {
      return json(result(503, 'online_unavailable'))
    }
  }
}
