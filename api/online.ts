import { createOnlineApi } from '../server/online/api'
import { withPusher } from '../server/online/realtime'
import { withNeon } from '../server/online/sql'

export default {
  async fetch(request: Request) {
    const { DATABASE_URL, ONLINE_SESSION_PEPPER, ONLINE_ORIGIN, CRON_SECRET,
      PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env
    if (!DATABASE_URL || !ONLINE_SESSION_PEPPER || ONLINE_SESSION_PEPPER.length < 32 || !ONLINE_ORIGIN) {
      return Response.json({ status: 'online_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
    const database = withNeon(DATABASE_URL)
    try {
      const realtime = PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET && PUSHER_CLUSTER
        ? withPusher(PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER) : undefined
      return await createOnlineApi({
        database, origin: ONLINE_ORIGIN, pepper: ONLINE_SESSION_PEPPER,
        ...(CRON_SECRET ? { cronSecret: CRON_SECRET } : {}), ...(realtime ? { realtime } : {}),
      })(request)
    } catch {
      return Response.json({ status: 'online_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    } finally {
      await database.close().catch(() => undefined)
    }
  },
}
