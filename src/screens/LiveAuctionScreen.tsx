import { useLayoutEffect, useState } from 'react'
import { Download, Gavel, Plus, ScanLine, Sparkle } from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { PlayerStatus, playerLabel } from '../components/PlayerStatus'
import { ScreenHeading } from '../components/ScreenHeading'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Dialog } from '../components/ui/Dialog'
import { categories } from '../data/categories'
import { downloadBlob } from '../download'
import { getLiveItemId, getRaiseRange, isLiveComplete, reduceLiveAuction, startLiveAuction } from '../game/liveAuction'
import type { LiveAuction, LiveCommand } from '../game/liveAuction'
import { getLiveReplay } from '../game/liveReplay'
import { loadLiveAuction, saveLiveAuction } from '../game/liveStorage'
import { newMatchIdentity } from '../game/useLocalMatch'
import { DECK_SIZE } from '../game/types'
import type { Category, LocalVote, PlayerId } from '../game/types'
import { ResultsScreen } from './ResultsScreen'
import { SetupScreen } from './SetupScreen'
import './liveAuction.css'

type Command = LiveCommand | { type: 'VOTE'; vote: LocalVote }
const home = () => window.location.assign('/')

export default function LiveAuctionScreen() {
  const [saved] = useState(loadLiveAuction)
  const [state, setState] = useState(saved.state)
  const [storageFailed, setStorageFailed] = useState(saved.status === 'unavailable')
  const [error, setError] = useState(saved.status === 'invalid' ? 'The saved auction could not be restored. Start a new auction to continue.' : '')
  const [creator, setCreator] = useState(false)
  const [panel, setPanel] = useState<'rules' | 'privacy' | 'quit' | null>(null)
  const [exportStatus, setExportStatus] = useState('')

  useLayoutEffect(() => {
    if (!state) return
    const savedSuccessfully = saveLiveAuction(state)
    queueMicrotask(() => setStorageFailed(!savedSuccessfully))
  }, [state])

  function start(categoryId: string, names: Record<PlayerId, string>, previousDeck?: readonly string[]) {
    const category = categories.find(({ id }) => id === categoryId)
    if (!category) return
    try {
      const { matchId, seed } = newMatchIdentity()
      const next = startLiveAuction(category, matchId, seed, names, previousDeck)
      if (!next) throw new Error('Invalid auction setup')
      setState(next)
      setError('')
      setExportStatus('')
    } catch { setError('The auction could not start. Check the category and player names and try again.') }
  }

  function dispatch(command: Command) {
    if (!state) return
    const action = { ...command, matchId: state.matchId, revision: state.history.length }
    setState((current) => current ? reduceLiveAuction(current, action) : current)
  }

  function clear() {
    setStorageFailed(!saveLiveAuction(null))
    setState(null)
    setError('')
    setExportStatus('')
    setPanel(null)
  }

  const category = categories.find(({ id }) => id === state?.categoryId)
  const replay = state && category ? getLiveReplay(state, category) : null
  const dialogTitle = panel === 'quit' ? 'Quit this auction?' : panel === 'privacy' ? 'Live Auction privacy' : 'Live Auction rules'

  return (
    <>
      <AppShell gamePage onHome={home} onShowRules={() => setPanel('rules')} onShowPrivacy={() => setPanel('privacy')}>
        {storageFailed && <p className="game-notice" role="status">Progress can’t be saved in this browser. Keep this tab open to finish.</p>}
        {error && state && <p className="game-notice" role="alert">{error}</p>}
        {state && category ? replay ? (
          <>
            <div className="live-toolbar">
              <span className="mode-label">Live Auction</span>
              <a className="button button--secondary" href="/replay"><ScanLine size={17} aria-hidden="true" /> Replay Studio</a>
              <Button variant="secondary" onClick={() => {
                try {
                  downloadBlob(new Blob([JSON.stringify(replay, null, 2)], { type: 'application/json' }), 'bid-brawl-live-replay.json')
                  setExportStatus('Replay file ready to save.')
                } catch { setExportStatus('The replay could not be downloaded. Try again.') }
              }}><Download size={17} aria-hidden="true" /> Download Replay JSON</Button>
              {exportStatus && <p role="status">{exportStatus}</p>}
            </div>
            <ResultsScreen showdown={replay.showdown} categoryEmoji={category.emoji} vote={state.vote}
              onVote={(vote) => dispatch({ type: 'VOTE', vote })} onNewCategory={clear}
              onRematch={() => start(category.id, { p1: state.players.p1.name, p2: state.players.p2.name }, state.deck)} />
          </>
        ) : (
          <LiveTable state={state} category={category} creator={creator} toggleCreator={() => setCreator((current) => !current)}
            dispatch={dispatch} onQuit={() => setPanel('quit')} />
        ) : <>
          <SetupScreen mode="live" onBack={home} onStart={start} error={error || null} />
          <div><a className="button button--secondary" href="/replay"><ScanLine size={17} aria-hidden="true" /> Open Replay Studio</a></div>
        </>}
      </AppShell>
      <Dialog open={panel !== null} title={dialogTitle} onDismiss={() => setPanel(null)}>
        {panel === 'quit' ? <div className="exit-confirm">
          <p>Quitting clears this Live Auction’s saved progress.</p>
          <div className="game-actions"><Button onClick={() => setPanel(null)}>Keep playing</Button><Button variant="secondary" onClick={clear}>Quit Auction</Button></div>
        </div> : panel === 'privacy' ? <p className="privacy-notice">Live offers are visible to both players. This draft is saved on this device. A replay includes player names and public actions from this match.</p>
          : panel === 'rules' ? <ol className="live-rule-list">
            <li>Reveal each card when you’re ready. Player 1 opens odd rounds and Player 2 opens even rounds. A full roster skips its turn.</li>
            <li>The first offer is $1. The other player raises by at least $1 or passes. Save $1 for each future pick.</li>
            <li>Passing against an offer gives the card to the leader. If the opener passes, the other player can buy for $1 or pass too.</li>
            <li>With no offer, discard the card if both lineups can still fill. Otherwise, the player with more open slots takes it for $1. An alternating priority breaks equal-slot ties.</li>
          </ol> : null}
      </Dialog>
    </>
  )
}

function LiveTable({ state, category, creator, toggleCreator, dispatch, onQuit }: {
  state: LiveAuction; category: Category; creator: boolean; toggleCreator: () => void
  dispatch: (command: LiveCommand) => void; onQuit: () => void
}) {
  const { players, turn, stage } = state
  const item = category.items.find(({ id }) => id === getLiveItemId(state))
  const offer = turn?.offer
  const outcome = stage === 'outcome' ? state.outcomes[state.deckIndex] : null
  const headline = item?.title ?? 'Mystery card'
  const activePlayer = turn ? players[turn.player] : null
  const status = outcome ? outcome.kind === 'discarded' ? 'Card discarded' : `${players[outcome.winner].name} takes the card for $${outcome.paid}`
    : offer ? `${players[offer.player].name} leads at $${offer.amount}` : activePlayer ? 'Opening offer · $1' : 'Ready when you are'

  const card = (
    <div className="live-card" key={`${state.deckIndex}:${Boolean(item)}`}>
      <div className="live-card__symbol" aria-hidden="true">{item?.emoji ?? '?'}</div>
      <span className="mystery-card__theme">{category.title}</span>
      <ScreenHeading className="mystery-card__title">{headline}</ScreenHeading>
      <p className="live-price" role="status">{status}</p>
      {activePlayer && <p className="live-turn-label">{activePlayer.name} · {playerLabel(activePlayer)} to act</p>}
    </div>
  )

  return (
    <section className="game-page live-page" aria-label="Live Auction match">
      <div className="live-toolbar">
        <span className="mode-label"><Gavel size={17} aria-hidden="true" /> Card {state.deckIndex + 1} / {DECK_SIZE}</span>
        <div className="live-toolbar__actions">
          <Button variant="secondary" aria-pressed={creator} onClick={toggleCreator}><ScanLine size={17} aria-hidden="true" /> Creator View</Button>
          <Button variant="quiet" onClick={onQuit} aria-haspopup="dialog">Quit</Button>
        </div>
      </div>
      <div className="live-board">
        <div className={creator ? 'creator-frame' : 'live-table'} role="group" aria-label={creator ? '9:16 Creator frame' : 'Auction table'}>
          <PlayerStatus player={players.p1} priority={false} />
          <PlayerStatus player={players.p2} priority={false} />
          {card}
        </div>
        {stage === 'reveal' && <Button className="live-primary-action" onClick={() => dispatch({ type: 'REVEAL' })}><Sparkle size={17} aria-hidden="true" /> Reveal Card</Button>}
        {turn && activePlayer && <RaiseControls key={state.history.length} range={getRaiseRange(state)}
          opening={turn.offer === null} lastChance={turn.opponentPassed} dispatch={dispatch} />}
        {outcome && <Card className="live-controls">
          {outcome.kind === 'mandatory' && <p>The card was assigned for $1 so there are enough cards to fill both lineups.</p>}
          {outcome.kind === 'discarded' && <p>No offers. Both lineups can still be filled.</p>}
          <Button onClick={() => dispatch({ type: 'NEXT' })}>{isLiveComplete(state) ? 'View Final Showdown' : 'Next Card'}</Button>
        </Card>}
      </div>
    </section>
  )
}

function RaiseControls({ range, opening, lastChance, dispatch }: {
  range: ReturnType<typeof getRaiseRange>; opening: boolean; lastChance: boolean; dispatch: (command: LiveCommand) => void
}) {
  const [amount, setAmount] = useState(range?.min ?? 0)
  return (
    <Card className="live-controls">
      {range && range.min < range.max && <label className="live-range">Raise amount <strong>${amount}</strong>
        <input type="range" min={range.min} max={range.max} step={1} value={amount} aria-valuetext={`${amount} dollars`}
          onChange={(event) => setAmount(event.target.valueAsNumber)} />
      </label>}
      {!range && <p>Your budget can’t cover a higher offer. Pass to settle the card.</p>}
      <div className="game-actions">
        <Button variant="secondary" onClick={() => dispatch({ type: 'PASS' })}>Pass</Button>
        <Button disabled={!range} onClick={() => dispatch({ type: 'RAISE', amount })}><Plus size={17} aria-hidden="true" />
          {opening ? lastChance ? 'Buy for $1' : 'Open at $1' : range ? `Raise to $${amount}` : 'Raise'}
        </Button>
      </div>
    </Card>
  )
}
