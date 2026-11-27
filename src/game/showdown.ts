import { getDiscardCount } from './selectors'
import { STARTING_BUDGET } from './types'
import type { Category, MatchState, PlayerState } from './types'

export function getShowdown(state: MatchState, category: Category) {
  if (state.stage !== 'finished') throw new Error('The match must be finished to export a showdown.')
  return showdownFromRosters([state.players.p1, state.players.p2], category, getDiscardCount(state))
}

export function showdownFromRosters(players: readonly PlayerState[], category: Category, discardedCount: number) {
  const items = new Map(category.items.map((item) => [item.id, item]))
  return {
    categoryTitle: category.title,
    discardedCount,
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      spent: STARTING_BUDGET - player.budgetRemaining,
      remaining: player.budgetRemaining,
      picks: player.roster.map(({ itemId, paid }) => {
        const item = items.get(itemId)
        return { id: itemId, title: item?.title ?? 'Unavailable item', emoji: item?.emoji ?? '', paid }
      }),
    })),
  }
}

export type Showdown = ReturnType<typeof getShowdown>

export function formatShowdownText(showdown: Showdown): string {
  const { categoryTitle, discardedCount, players } = showdown
  return [
    'Bid Brawl · Final Showdown',
    `${categoryTitle} · ${discardedCount} discarded`,
    ...players.map(({ name, picks, spent, remaining }, index) => [
      '',
      `Player ${index + 1} · ${name}`,
      ...picks.map(({ title, paid }) => `• ${title} — $${paid}`),
      `Spent $${spent} · $${remaining} remaining`,
    ].join('\n')),
    '',
    'Who built the better lineup?',
  ].join('\n')
}
