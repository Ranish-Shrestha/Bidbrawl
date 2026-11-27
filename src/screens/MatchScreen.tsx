import { DoorOpen, Layers, Sparkle, VolumeX } from 'lucide-react'
import { ScreenHeading } from '../components/ScreenHeading'
import { PlayerStatus, playerLabel } from '../components/PlayerStatus'
import { BidControl } from '../components/BidControl'
import { RoundOutcome } from '../components/RoundOutcome'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { getOpenSlots } from '../game/rules'
import type { getMatchView } from '../game/selectors'
import { DECK_SIZE } from '../game/types'
import type { Category, GameAction } from '../game/types'

type Props = {
  view: ReturnType<typeof getMatchView>
  category: Category
  dispatch: (action: GameAction) => void
  onExit: () => void
}

export function MatchScreen({ view, category, dispatch, onExit }: Props) {
  const { matchId, roundNumber, players, privateTurn, currentOutcome } = view
  const round = { matchId, roundNumber }
  const item = category.items.find(({ id }) => id === view.currentItemId)
  const nextBidder = getOpenSlots(players.p1) > 0 ? players.p1 : players.p2
  if (!item) return <p role="alert">The current card is unavailable. Exit this match and start a new draft. <Button onClick={onExit}>Exit match</Button></p>

  return (
    <section className="game-page match-page" aria-label="Secret Bid match">
      <div className="game-toolbar">
        <Button variant="quiet" onClick={onExit} aria-haspopup="dialog"><DoorOpen size={18} aria-hidden="true" /> Exit match</Button>
        <span className="mode-label"><Layers size={16} aria-hidden="true" /> Card {roundNumber} / {DECK_SIZE}</span>
      </div>
      <div className="match-grid">
        <PlayerStatus player={players.p1} priority={view.tiePriority === 'p1'} />
        <PlayerStatus player={players.p2} priority={view.tiePriority === 'p2'} />
        <div className="match-center">
          <Card className={`mystery-card${view.stage === 'reveal' ? ' mystery-card--reveal' : ''}`} key={item.id}>
            {view.stage === 'reveal' && <div className="mystery-card__back" aria-hidden="true"><span>?</span></div>}
            <div className="mystery-card__face">
              <Sparkle className="mystery-card__spark" size={32} aria-hidden="true" />
              <span aria-hidden="true" className="mystery-card__emoji">{item.emoji}</span>
              <span className="mystery-card__theme">{category.title}</span>
              {view.stage === 'reveal'
                ? <div role="status"><ScreenHeading className="mystery-card__title">{item.title}</ScreenHeading></div>
                : <p className="mystery-card__title">{item.title}</p>}
            </div>
          </Card>

          {view.stage === 'reveal' && (
            <Card className="reveal-actions">
              <p>Hand the device to <strong>{nextBidder.name}</strong> ({playerLabel(nextBidder)}).</p>
              <Button onClick={() => dispatch({ type: 'BEGIN_BIDDING', ...round })}>Begin Bidding</Button>
            </Card>
          )}
          {privateTurn && privateTurn.maxBid !== null && (
            <BidControl key={`${matchId}:${roundNumber}:${privateTurn.player}`} player={players[privateTurn.player]} maxBid={privateTurn.maxBid}
              onLock={(bid) => dispatch({ type: privateTurn.player === 'p1' ? 'LOCK_P1_BID' : 'LOCK_P2_BID', ...round, bid })} />
          )}
          {currentOutcome && (
            <RoundOutcome outcome={currentOutcome} players={players} itemTitle={item.title} complete={view.complete}
              onNext={() => dispatch({ type: 'REVEAL_NEXT', ...round })} />
          )}
          <p className="match-meta"><VolumeX size={16} aria-hidden="true" /> No talking <span aria-hidden="true">·</span> {view.remainingCards} cards unresolved <span aria-hidden="true">·</span> {view.discardedCount} discarded</p>
        </div>
      </div>
    </section>
  )
}
