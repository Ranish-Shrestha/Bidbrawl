import type { RoomView } from '../../server/online/rooms'
import type { OnlineRequest } from '../../server/online/protocol'

type Bootstrap = { key: string; cluster: string }
export type OnlineReply = { status: string; room?: RoomView; invite?: string; auth?: string; realtime?: Bootstrap | null }

async function request(path: string, options?: RequestInit): Promise<OnlineReply> {
  const response = await fetch(`/api/online${path}`, { ...options, cache: 'no-store', signal: AbortSignal.timeout(8_000) })
  const reply: OnlineReply = await response.json()
  if (typeof reply.status !== 'string' && typeof reply.auth !== 'string') throw new Error('Invalid online response')
  return reply
}

export const readOnline = (roomId?: string) => request(roomId ? `?room=${encodeURIComponent(roomId)}` : '')
export const sendOnline = (command: OnlineRequest) => request('', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
})

export function roundRequest(room: RoomView) {
  if (!room.draft) throw new Error('Round unavailable')
  return { ...roomRequest(room), matchId: room.draft.matchId, roundNumber: room.draft.roundNumber }
}

export function roomRequest(room: RoomView) {
  return { roomId: room.id, revision: room.revision, requestId: crypto.randomUUID() }
}

export async function watchRevisions(roomId: string, realtime: Bootstrap, refresh: () => void, signal: AbortSignal) {
  const { default: Pusher } = await import('pusher-js')
  if (signal.aborted) return
  const channelName = `private-draft-${roomId}`
  const client = new Pusher(realtime.key, {
    cluster: realtime.cluster, forceTLS: true, enableStats: false,
    channelAuthorization: { customHandler: (params, callback) => {
      if (params.channelName !== channelName) { callback(new Error('Room authorization rejected'), null); return }
      void sendOnline({ type: 'subscribe', roomId, socketId: params.socketId })
        .then((reply) => reply.auth ? callback(null, { auth: reply.auth }) : callback(new Error('Room authorization rejected'), null))
        .catch(() => callback(new Error('Room authorization unavailable'), null))
    } },
  })
  signal.addEventListener('abort', () => client.disconnect(), { once: true })
  const channel = client.subscribe(channelName)
  channel.bind('revision', refresh)
  channel.bind('pusher:subscription_succeeded', refresh)
}
