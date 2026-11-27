import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AppShell } from '../components/AppShell'
import { BidControl } from '../components/BidControl'
import { PlayerStatus } from '../components/PlayerStatus'
import { RoundOutcome } from '../components/RoundOutcome'
import { ScreenHeading } from '../components/ScreenHeading'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Dialog } from '../components/ui/Dialog'
import { categories } from '../data/categories'
import { normalizePlayerName } from '../game/names'
import { showdownFromRosters } from '../game/showdown'
import { ROSTER_SIZE } from '../game/types'
import type { PlayerState } from '../game/types'
import { readOnline, roomRequest, roundRequest, sendOnline, watchRevisions } from '../online/client'
import type { OnlineReply } from '../online/client'
import type { OnlineRequest } from '../../server/online/protocol'
import type { RoomView } from '../../server/online/rooms'
import { HowToPlay } from './HowToPlay'
import { ResultsScreen } from './ResultsScreen'

const notices: Record<string, string> = {
  room_unavailable: 'This room has expired or you do not have a seat. Open a new invite or create a room.',
  online_unavailable: 'Online rooms are unavailable. You can still play locally.',
  session_required: 'Your online session expired. Open the invite again or create a room.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  room_limit: 'You already have three active rooms. Try again after one expires.',
  invalid_bid: 'That bid exceeds your available budget.',
  stale: 'The room changed. The latest round is shown below.',
  waiting_for_player: 'Wait for the other player to join.',
  already_locked: 'Your bid is already locked.',
  already_voted: 'Your vote was already counted.',
  voting_closed: 'Voting has closed.',
  closed: 'That action is no longer available.',
}

function inviteLink(roomId: string, invite: string) {
  const url = new URL('/online', window.location.origin)
  url.searchParams.set('room', roomId)
  url.hash = new URLSearchParams({ invite }).toString()
  return url.href
}

function applyRoomUrl(roomId: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('room', roomId)
  window.history.replaceState(null, '', url)
}

function Clock({ deadline, serverTime }: { deadline: number; serverTime: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((deadline - serverTime) / 1000)))
  useEffect(() => {
    const started = performance.now()
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline - serverTime - performance.now() + started) / 1000))), 200)
    return () => window.clearInterval(timer)
  }, [deadline, serverTime])
  return <p className="mode-label" aria-label="Time remaining">{remaining}s remaining</p>
}

export default function OnlineScreen({ entryRoom, initialInvite }: { entryRoom: string | null; initialInvite: string | null }) {
  const [invite, setInvite] = useState(initialInvite)
  const [room, setRoom] = useState<RoomView | null>(null)
  const roomRef = useRef<RoomView | null>(null)
  const [service, setService] = useState<'loading' | 'available' | 'unavailable'>('loading')
  const [realtime, setRealtime] = useState<OnlineReply['realtime']>(null)
  const [name, setName] = useState('')
  const [categoryId, setCategory] = useState(categories[0]!.id)
  const [link, setLink] = useState('')
  const [feedback, setFeedback] = useState('')
  const [networkError, setNetworkError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState<OnlineRequest | null>(null)
  const [panel, setPanel] = useState<'rules' | 'privacy' | null>(null)
  const [check, setCheck] = useState(0)
  const formBusy = useRef(false)

  const accept = useCallback((next: RoomView) => {
    const previous = roomRef.current
    if (previous?.id === next.id) {
      if (next.revision < previous.revision) return
      if (next.revision === previous.revision && (next.serverTime < previous.serverTime ||
        (previous.draft?.ownBid?.locked && !next.draft?.ownBid?.locked))) return
    }
    roomRef.current = next
    setRoom(next)
    setNetworkError(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function discover() {
      try {
        const bootstrap = await readOnline()
        if (cancelled) return
        if (bootstrap.status !== 'available') { setService('unavailable'); return }
        setRealtime(bootstrap.realtime)
        setService('available')
        if (!entryRoom) return
        const resumed = await readOnline(entryRoom)
        if (cancelled) return
        if (resumed.room) {
          accept(resumed.room)
          applyRoomUrl(resumed.room.id)
          setInvite(null)
        } else if (!initialInvite) setFeedback(notices[resumed.status] ?? 'This room could not be opened.')
      } catch {
        if (!cancelled) setService('unavailable')
      }
    }
    void discover()
    return () => { cancelled = true }
  }, [accept, check, entryRoom, initialInvite])

  const activeRoomId = room?.id
  useEffect(() => {
    if (!activeRoomId) return
    const abort = new AbortController()
    let inFlight = false
    async function sync() {
      if (inFlight || document.hidden || abort.signal.aborted) return
      inFlight = true
      try {
        const refreshed = await readOnline(activeRoomId)
        if (abort.signal.aborted) return
        if (!refreshed.room) {
          setNetworkError(true)
          if (refreshed.status === 'room_unavailable' || refreshed.status === 'session_required') {
            setFeedback(notices[refreshed.status] ?? 'The room could not be refreshed.')
            roomRef.current = null
            setRoom(null)
          }
          return
        }
        accept(refreshed.room)
        const current = roomRef.current
        const deadline = current?.draft?.deadlineAt
        if (current && typeof deadline === 'number' && deadline <= current.serverTime) {
          const settled = await sendOnline({ type: 'deadline', ...roundRequest(current) })
          if (!abort.signal.aborted && settled.room) accept(settled.room)
        }
      } catch {
        if (!abort.signal.aborted) setNetworkError(true)
      } finally { inFlight = false }
    }
    const interval = window.setInterval(sync, 2_000)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('online', sync)
    if (realtime) void watchRevisions(activeRoomId, realtime, sync, abort.signal).catch(() => undefined)
    return () => {
      abort.abort()
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('online', sync)
    }
  }, [accept, activeRoomId, realtime])

  async function submit(command: OnlineRequest) {
    if (formBusy.current) return
    formBusy.current = true
    setBusy(true)
    setFeedback('')
    setRetry(null)
    try {
      if (!room && (command.type === 'create' || command.type === 'join')) {
        const session = await sendOnline({ type: 'session' })
        if (session.status !== 'session') { setFeedback(notices[session.status] ?? 'Could not open a guest session.'); return }
      }
      const response = await sendOnline(command)
      if (response.room) {
        accept(response.room)
        applyRoomUrl(response.room.id)
        if (command.type === 'join') setInvite(null)
      }
      if (response.invite && response.room) setLink(inviteLink(response.room.id, response.invite))
      if (response.status === 'online_unavailable') setRetry(command)
      setFeedback(notices[response.status] ?? (response.room ? '' : 'That request could not be completed.'))
    } catch {
      setFeedback('Connection interrupted. Retry the last action when you’re back online.')
      setRetry(command)
    } finally {
      formBusy.current = false
      setBusy(false)
    }
  }

  function enterRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!normalizePlayerName(name)) return
    void submit(entryRoom && invite
      ? { type: 'join', roomId: entryRoom, invite, name }
      : { type: 'create', requestId: crypto.randomUUID(), categoryId, name })
  }

  const category = categories.find(({ id }) => id === room?.categoryId)
  const draft = room?.draft
  const first = draft?.players[0]
  const second = draft?.players[1]
  const goHome = () => window.location.assign('/')

  return (
    <>
      <AppShell onHome={goHome} onShowRules={() => setPanel('rules')} onShowPrivacy={() => setPanel('privacy')} gamePage>
        <section className="game-page online-page" aria-label="Online Secret Bid">
          {feedback && <p className="game-notice" role="status">{feedback}</p>}
          {networkError && room && <p className="game-notice" role="status">Reconnecting to the room…</p>}
          {retry && <Button variant="secondary" disabled={busy} onClick={() => void submit(retry)}>Retry last action</Button>}
          {service !== 'available' ? (
            <Card className="online-panel">
              <ScreenHeading className="stage-heading">Online Secret Bid</ScreenHeading>
              <p role="status">{service === 'loading' ? 'Connecting…' : notices.online_unavailable}</p>
              {service === 'unavailable' && <Button variant="secondary" onClick={() => { setService('loading'); setCheck(check + 1) }}>Try again</Button>}
            </Card>
          ) : !room ? (
            <Card className="online-panel">
              <ScreenHeading className="stage-heading">{entryRoom && invite ? 'Join private room' : 'Create a private room'}</ScreenHeading>
              <p>Two devices. Secret bids. Fifteen seconds per mystery card.</p>
              <form className="online-form" onSubmit={enterRoom}>
                <label className="setup-field">Your display name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" /></label>
                {!(entryRoom && invite) && <label className="setup-field">Category<select value={categoryId} onChange={(event) => setCategory(event.target.value)}>
                  {categories.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
                </select></label>}
                <Button type="submit" disabled={!normalizePlayerName(name) || busy}>{entryRoom && invite ? 'Join Room' : 'Create Room'}</Button>
              </form>
            </Card>
          ) : !draft ? (
            <Card className="online-panel">
              <ScreenHeading className="stage-heading">{category?.title ?? 'Private room'}</ScreenHeading>
              <p>{room.players.p1} · {room.players.p2 ?? 'Waiting for Player 2'}</p>
              {room.seat === 'p1' && !room.players.p2 && (
                <div className="online-form">
                  {link && <label className="setup-field">Invite link<input value={link} readOnly onFocus={(event) => event.target.select()} /></label>}
                  {link && <Button variant="secondary" onClick={() => {
                    if (!navigator.clipboard) { setFeedback('Select and copy the invite link.'); return }
                    void navigator.clipboard.writeText(link).then(() => setFeedback('Invite link copied.')).catch(() => setFeedback('Select and copy the invite link.'))
                  }}>Copy Invite</Button>}
                  <Button variant="secondary" disabled={busy} onClick={() => void submit({ type: 'rotateInvite', ...roomRequest(room) })}>Generate New Invite</Button>
                </div>
              )}
              {room.seat === 'p1' ? <Button disabled={busy || !room.players.p2} onClick={() => void submit({ type: 'start', ...roomRequest(room) })}>Start Match</Button>
                : <p role="status">Waiting for the host to start.</p>}
            </Card>
          ) : category && first && second ? (
            <OnlineDraftView room={room} category={category} players={[{ ...first, roster: first.picks }, { ...second, roster: second.picks }]}
              busy={busy} submit={submit} />
          ) : <p role="alert">This room’s category could not be loaded.</p>}
        </section>
      </AppShell>
      <Dialog open={panel !== null} title={panel === 'rules' ? 'Online Secret Bid rules' : 'Online privacy'} onDismiss={() => setPanel(null)}>
        {panel === 'rules' ? <HowToPlay online />
          : panel === 'privacy' ? <p className="privacy-notice">Online play stores room state and bids on the server. Only the two seats can join, and neither sees the other bid before resolution. Finished rooms expire after 24 hours. Your browser cookie restores your seat.</p> : null}
      </Dialog>
    </>
  )
}

function OnlineDraftView({ room, category, players, busy, submit }: {
  room: RoomView; category: (typeof categories)[number]; players: [PlayerState, PlayerState]
  busy: boolean; submit: (command: OnlineRequest) => Promise<void>
}) {
  const draft = room.draft!
  const [p1, p2] = players
  const item = category.items.find(({ id }) => id === draft.currentItemId)
  const own = draft.ownBid
  const voting = room.voting
  if (draft.stage === 'finished') {
    return <ResultsScreen showdown={showdownFromRosters(players, category, draft.discardedCount)} categoryEmoji={category.emoji}
      vote={voting?.ownVote ?? null} voteDetails={{
        disabled: busy || !voting?.open || Boolean(voting.ownVote),
        label: voting ? `Room votes · ${p1.name} ${voting.tally.p1} · ${p2.name} ${voting.tally.p2} · Tie ${voting.tally.tie}${voting.open ? '' : ' · Voting closed'}` : 'Room voting closed',
      }} onVote={(vote) => void submit({ type: 'vote', ...roomRequest(room), vote })} onNewCategory={() => window.location.assign('/online')} />
  }
  if (!item) return <p role="alert">This card could not be loaded.</p>
  return (
    <div className="game-page match-page">
      <div className="game-toolbar"><span className="mode-label">Online · Card {draft.roundNumber} / 12</span>
        {draft.deadlineAt !== null && <Clock key={draft.roundNumber} deadline={draft.deadlineAt} serverTime={room.serverTime} />}</div>
      <div className="match-grid">
        <PlayerStatus player={p1} priority={draft.tiePriority === 'p1'} /><PlayerStatus player={p2} priority={draft.tiePriority === 'p2'} />
        <div className="match-center">
          <Card className="mystery-card" key={item.id}><div className="mystery-card__face">
            <span className="mystery-card__emoji" aria-hidden="true">{item.emoji}</span>
            <span className="mystery-card__theme">{category.title}</span><h2 className="mystery-card__title">{item.title}</h2>
          </div></Card>
          {own && own.max !== null && !own.locked && <BidControl key={`${draft.matchId}:${draft.roundNumber}`} player={own.seat === 'p1' ? p1 : p2}
            maxBid={own.max} disabled={busy} onLock={(amount) => void submit({ type: 'bid', ...roundRequest(room), amount })} />}
          {own && (own.locked || own.max === null) && <Card className="online-panel"><div role="status">
            <ScreenHeading className="stage-heading">{own.locked ? 'Bid locked' : 'Lineup full'}</ScreenHeading>
            <p>{own.locked ? 'Your bid is locked. Waiting for the round to resolve.' : 'Your lineup is full. Waiting for the other player.'}</p>
          </div></Card>}
          {draft.currentOutcome && <RoundOutcome outcome={draft.currentOutcome} players={{ p1, p2 }} itemTitle={item.title}
            complete={players.every(({ roster }) => roster.length === ROSTER_SIZE)} pending={busy}
            onNext={() => void submit({ type: 'next', ...roundRequest(room) })} />}
        </div>
      </div>
    </div>
  )
}
