import { Card } from './ui/Card'
import { ROSTER_SIZE } from '../game/types'
import type { PlayerState } from '../game/types'

export function playerLabel(player: Pick<PlayerState, 'id'>): string {
  return player.id === 'p1' ? 'Player 1' : 'Player 2'
}

export function PlayerStatus({ player, priority }: { player: PlayerState; priority: boolean }) {
  return (
    <Card className={`player-status player-${player.id}`}>
      <span className="player-status__label">{playerLabel(player)}</span>
      <div className="player-status__top">
        <strong>{player.name}</strong><span>${player.budgetRemaining}</span>
      </div>
      <div className="player-status__slots" aria-hidden="true">
        {Array.from({ length: ROSTER_SIZE }, (_, index) => <span key={index} data-filled={index < player.roster.length} />)}
      </div>
      <div className="player-status__meta">
        <span>{player.roster.length}/{ROSTER_SIZE} picks</span>
        {priority && player.roster.length < ROSTER_SIZE && <span>Tie priority</span>}
      </div>
    </Card>
  )
}
