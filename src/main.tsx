import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/space-grotesk/wght.css'
import './index.css'
import './game.css'
import { App } from './App'

const OnlineScreen = lazy(() => import('./screens/OnlineScreen'))
const LiveAuctionScreen = lazy(() => import('./screens/LiveAuctionScreen'))
const ReplayStudio = lazy(() => import('./screens/ReplayStudio'))
const url = new URL(window.location.href)
const online = url.pathname === '/online'
const live = url.pathname === '/live'
const replay = url.pathname === '/replay'
const entryRoom = online ? url.searchParams.get('room') : null
const inviteFromLink = online ? new URLSearchParams(url.hash.slice(1)).get('invite') : null
const pendingInvite = online ? window.history.state as { roomId: string; invite: string } | null : null
const invite = entryRoom ? inviteFromLink ?? (pendingInvite?.roomId === entryRoom ? pendingInvite.invite : null) : null
if (online && url.hash) {
  window.history.replaceState(invite ? { roomId: entryRoom, invite } : null, '', `${url.pathname}${url.search}`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {online || live || replay ? <Suspense fallback={<p className="page-width game-notice" role="status">{online ? 'Opening online rooms…' : replay ? 'Opening Replay Studio…' : 'Opening Live Auction…'}</p>}>
      {online ? <OnlineScreen entryRoom={entryRoom} initialInvite={invite} /> : replay ? <ReplayStudio /> : <LiveAuctionScreen />}
    </Suspense> : <App />}
  </StrictMode>,
)
