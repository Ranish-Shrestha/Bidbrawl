import { Layers, RotateCcw, Trophy } from 'lucide-react'
import { ScreenHeading } from '../components/ScreenHeading'
import { playerLabel } from '../components/PlayerStatus'
import { ResultShare } from '../components/ResultShare'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import type { LocalVote } from '../game/types'
import type { Showdown } from '../game/showdown'

type Props = {
  showdown: Showdown
  categoryEmoji: string
  vote: LocalVote | null
  voteDetails?: { label: string; disabled: boolean }
  onVote: (vote: LocalVote) => void
  onRematch?: () => void
  onNewCategory: () => void
}

export function ResultsScreen({ showdown, categoryEmoji, vote, voteDetails, onVote, onRematch, onNewCategory }: Props) {
  const { players } = showdown
  const ballots = [
    ...players.map((player) => ({ vote: player.id, label: `Vote for ${player.name}`, seat: playerLabel(player) })),
    { vote: 'tie', label: 'It’s a tie', seat: '' },
  ] as const

  return (
    <section className="game-page results-page" aria-labelledby="results-title">
      <div className="game-intro results-intro">
        <div className="results-intro__mark"><Trophy size={31} aria-hidden="true" /></div>
        <ScreenHeading id="results-title">Final Showdown</ScreenHeading>
        <p><span aria-hidden="true">{categoryEmoji} </span>{showdown.categoryTitle} · {showdown.discardedCount} discarded</p>
        <ResultShare showdown={showdown} />
      </div>
      <div className="results-rosters">
        {players.map((player) => (
          <Card key={player.id} className={`results-roster player-${player.id}`}>
            <div className="results-roster__heading">
              <span className="player-status__label">{playerLabel(player)}</span>
              <h2>{player.name}</h2>
            </div>
            <ol aria-label={`${playerLabel(player)} lineup`}>
              {player.picks.map(({ id, title, emoji, paid }) => (
                <li key={id}><span aria-hidden="true">{emoji}</span><span>{title}</span><strong>${paid}</strong></li>
              ))}
            </ol>
            <dl className="results-roster__totals">
              <div><dt>Spent</dt><dd>${player.spent}</dd></div>
              <div><dt>Remaining</dt><dd>${player.remaining}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
      <Card className="results-vote">
        <h2>Who built the better lineup?</h2>
        <p>{voteDetails?.label ?? 'Optional vote · Local opinion'}</p>
        <div className="vote-options">
          {ballots.map(({ vote: ballot, label, seat }) => (
            <Button key={ballot} variant="secondary" disabled={voteDetails?.disabled} aria-pressed={vote === ballot} onClick={() => onVote(ballot)}>
              {label}{seat && <span className="sr-only"> ({seat})</span>}
            </Button>
          ))}
        </div>
        <p className="sr-only" role="status">{vote === null ? '' : `Vote: ${vote === 'tie' ? 'tie' : players.find(({ id }) => id === vote)?.name}`}</p>
      </Card>
      <div className="game-actions results-actions">
        {onRematch && <Button onClick={onRematch}><RotateCcw size={18} aria-hidden="true" /> Rematch</Button>}
        <Button variant="secondary" onClick={onNewCategory}><Layers size={18} aria-hidden="true" /> {onRematch ? 'New Category' : 'New Room'}</Button>
      </div>
    </section>
  )
}
