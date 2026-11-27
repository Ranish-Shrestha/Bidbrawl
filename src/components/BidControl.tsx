import { useId, useState } from 'react'
import { LockKeyhole, Minus, Plus } from 'lucide-react'
import { ScreenHeading } from './ScreenHeading'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { playerLabel } from './PlayerStatus'
import type { PlayerState } from '../game/types'

export function BidControl({ player, maxBid, onLock, disabled = false }: { player: PlayerState; maxBid: number; onLock: (bid: number) => void; disabled?: boolean }) {
  const [bid, setBid] = useState(0)
  const bidId = useId()
  const limitId = useId()

  return (
    <Card className="bid-card">
      <div className="bid-card__heading">
        <span className="mode-label"><LockKeyhole size={14} aria-hidden="true" /> {playerLabel(player)} · Private bid</span>
        <ScreenHeading className="stage-heading">{player.name}’s bid</ScreenHeading>
        <p id={limitId}>Your budget is <strong>${player.budgetRemaining}</strong>. Max bid <strong>${maxBid}</strong>.</p>
      </div>
      <div className="bid-card__amount">
        <span>${bid}</span> <span>{bid === 0 ? 'Pass' : 'Your bid'}</span>
      </div>
      <label className="sr-only" htmlFor={bidId}>Bid amount</label>
      <div className="bid-stepper">
        <Button variant="icon" aria-label="Decrease bid" disabled={disabled || bid === 0} onClick={() => setBid((current) => Math.max(0, current - 1))}>
          <Minus size={20} aria-hidden="true" />
        </Button>
        <input id={bidId} type="range" min="0" max={maxBid} step="1" value={bid} disabled={disabled}
          aria-valuetext={bid === 0 ? 'Pass, zero dollars' : `${bid} dollars`} aria-describedby={limitId}
          onChange={(event) => setBid(event.target.valueAsNumber)} />
        <Button variant="icon" aria-label="Increase bid" disabled={disabled || bid === maxBid} onClick={() => setBid((current) => Math.min(maxBid, current + 1))}>
          <Plus size={20} aria-hidden="true" />
        </Button>
      </div>
      <div className="game-actions bid-card__actions">
        <Button variant="secondary" disabled={disabled} onClick={() => onLock(0)}>Pass</Button>
        <Button disabled={disabled || bid === 0} onClick={() => onLock(bid)}><LockKeyhole size={16} aria-hidden="true" /> Lock in ${bid}</Button>
      </div>
    </Card>
  )
}
