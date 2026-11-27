import type { LiveAuction } from './liveAuction'
import { showdownFromRosters } from './showdown'
import type { Category } from './types'

export function getLiveReplay(state: LiveAuction, category: Category) {
  if (state.stage !== 'finished') return null
  const titles = new Map(category.items.map(({ id, title }) => [id, title]))
  const showdown = showdownFromRosters([state.players.p1, state.players.p2], category,
    state.outcomes.filter(({ kind }) => kind === 'discarded').length)
  return {
    version: 1,
    mode: 'live-auction',
    showdown,
    rounds: state.outcomes.map((outcome, index) => ({
      number: index + 1,
      itemTitle: titles.get(outcome.itemId),
      outcome,
      actions: state.history.filter(({ round, command }) => round === index + 1 && command.type !== 'NEXT')
        .map(({ command, player }) => ({ ...command, ...(player ? { player } : {}) })),
    })),
  }
}
