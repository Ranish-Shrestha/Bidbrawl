import { CircleDollarSign, Shuffle, Trophy } from 'lucide-react'
import { useState } from 'react'
import { ScreenHeading } from './ScreenHeading'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { playerLabel } from './PlayerStatus'
import type { Outcome, PlayerId, PlayerState } from '../game/types'

type Props = {
  outcome: Outcome
  players: Readonly<Record<PlayerId, PlayerState>>
  itemTitle: string
  complete: boolean
  pending?: boolean
  onNext: () => void
}

const reactions = [
  { emoji: '😂', label: 'Laugh' },
  { emoji: '😮', label: 'Surprised' },
  { emoji: '😭', label: 'Devastated' },
  { emoji: '👏', label: 'Applaud' },
] as const

export function RoundOutcome({ outcome, players, itemTitle, complete, pending, onNext }: Props) {
  const [reaction, setReaction] = useState<string | null>(null)
  const winner = outcome.kind === 'discarded' ? null : players[outcome.winner].name
  const title = outcome.kind === 'discarded' ? 'Card discarded'
    : outcome.kind === 'mandatory' ? `${winner} takes the card` : `${winner} won this card`
  const detail = outcome.kind === 'discarded' ? 'All eligible players passed. There are enough cards left to fill both lineups.'
    : outcome.kind === 'mandatory' ? `${itemTitle} was assigned for $1 so both lineups can still be filled.`
      : `${winner} paid $${outcome.paid} for ${itemTitle}.${outcome.tied ? ' The tie priority decided the winner and now switches.' : ''}`
  const Icon = outcome.kind === 'discarded' ? Shuffle : outcome.kind === 'mandatory' ? CircleDollarSign : Trophy

  return (
    <Card className={`round-outcome outcome-${outcome.kind}${outcome.kind === 'won' && outcome.tied ? ' outcome-tied' : ''}`}>
      <div className="round-outcome__bids" role="group" aria-label="Revealed bids">
        {([['p1', outcome.p1Bid], ['p2', outcome.p2Bid]] as const).map(([id, bid]) => (
          <div key={id} className={`revealed-bid player-${id}`}>
            <span>{playerLabel(players[id])} · {players[id].name}</span>
            <strong>{bid === null ? 'Roster full' : bid === 0 ? 'Pass' : `$${bid}`}</strong>
          </div>
        ))}
      </div>
      <div role="status" className="round-outcome__message">
        <span className="round-outcome__icon"><Icon size={24} aria-hidden="true" /></span>
        <div><ScreenHeading className="stage-heading">{title}</ScreenHeading><p>{detail}</p></div>
      </div>
      <div className="round-reactions" role="group" aria-label="Round reactions">
        {reactions.map(({ emoji, label }) => (
          <Button key={label} variant="icon" aria-label={label} aria-pressed={reaction === label}
            onClick={() => setReaction((current) => current === label ? null : label)}>
            <span aria-hidden="true">{emoji}</span>
          </Button>
        ))}
      </div>
      <p className="sr-only" role="status">{reaction ? `Reaction: ${reaction}` : ''}</p>
      <Button disabled={pending} onClick={onNext}>{complete ? 'View Final Showdown' : 'Next Mystery Card'}</Button>
    </Card>
  )
}
