import Pusher from 'pusher'

export type Realtime = {
  key: string
  cluster: string
  authorize: (roomId: string, socketId: string) => Record<string, unknown>
  notify: (change: { roomId: string; revision: number }) => Promise<void>
}

export function withPusher(appId: string, key: string, secret: string, cluster: string): Realtime {
  const pusher = new Pusher({ appId, key, secret, cluster, useTLS: true, timeout: 2_000 })
  const channel = (roomId: string) => `private-draft-${roomId}`
  return {
    key,
    cluster,
    authorize: (roomId, socketId) => ({ ...pusher.authorizeChannel(socketId, channel(roomId)) }),
    async notify({ roomId, revision }) {
      await pusher.trigger(channel(roomId), 'revision', { revision })
    },
  }
}
