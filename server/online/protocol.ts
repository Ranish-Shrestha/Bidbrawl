import { normalizePlayerName } from '../../src/game/names'
import type { LocalVote } from '../../src/game/types'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const roomIdPattern = /^[A-Za-z0-9_-]{22}$/
const invitePattern = /^[A-Za-z0-9_-]{43}$/

type RoomAction = { roomId: string; requestId: string; revision: number }
type RoundAction = RoomAction & { matchId: string; roundNumber: number }
export type OnlineRequest =
  | { type: 'session' }
  | { type: 'create'; categoryId: string; name: string; requestId: string }
  | { type: 'join'; roomId: string; invite: string; name: string }
  | { type: 'subscribe'; roomId: string; socketId: string }
  | (RoomAction & { type: 'start' | 'rotateInvite' })
  | (RoomAction & { type: 'vote'; vote: LocalVote })
  | (RoundAction & { type: 'bid'; amount: number })
  | (RoundAction & { type: 'deadline' | 'next' })

const bodyLimit = 2048

export async function readCommand(request: Request): Promise<OnlineRequest | null> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return null
  if (!request.body || Number(request.headers.get('content-length')) > bodyLimit) return null
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    let bytes = 0
    let text = ''
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > bodyLimit) {
        void reader.cancel().catch(() => undefined)
        return null
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    const value: unknown = JSON.parse(text + decoder.decode())
    return parseCommand(value)
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

function parseCommand(value: unknown): OnlineRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const command = value as Record<string, unknown>
  const { type, requestId, roomId, revision, name, categoryId, invite, vote, matchId, roundNumber, amount, socketId } = command
  if (type === 'session') return { type }
  if (type === 'create') {
    const normalized = typeof name === 'string' ? normalizePlayerName(name) : null
    return typeof categoryId === 'string' && typeof requestId === 'string' && uuid.test(requestId) && normalized
      ? { type, categoryId, requestId: requestId.toLowerCase(), name: normalized } : null
  }
  if (typeof roomId !== 'string' || !roomIdPattern.test(roomId)) return null
  if (type === 'subscribe') return typeof socketId === 'string' && /^\d{1,20}\.\d{1,20}$/.test(socketId) ? { type, roomId, socketId } : null
  if (type === 'join') {
    const normalized = typeof name === 'string' ? normalizePlayerName(name) : null
    return typeof invite === 'string' && invitePattern.test(invite) && normalized ? { type, roomId, invite, name: normalized } : null
  }
  if (typeof requestId !== 'string' || !uuid.test(requestId) || typeof revision !== 'number' ||
      !Number.isSafeInteger(revision) || revision < 1) return null
  const room = { roomId, requestId: requestId.toLowerCase(), revision }
  if (type === 'start' || type === 'rotateInvite') return { ...room, type }
  if (type === 'vote') return vote === 'p1' || vote === 'p2' || vote === 'tie' ? { ...room, type, vote } : null
  if (typeof matchId !== 'string' || !roomIdPattern.test(matchId) || typeof roundNumber !== 'number' ||
      !Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 12) return null
  const round = { ...room, matchId, roundNumber }
  if (type === 'next' || type === 'deadline') return { ...round, type }
  return type === 'bid' && typeof amount === 'number' && Number.isInteger(amount) && amount >= 0 && amount <= 20
    ? { ...round, type, amount } : null
}
