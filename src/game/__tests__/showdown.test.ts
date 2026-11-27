import { expect, it } from 'vitest'
import { categories } from '../../data/categories'
import { gameReducer } from '../reducer'
import { formatShowdownText, getShowdown } from '../showdown'
import { nextCard, playRound, startMatch } from './fixtures'

it('exports only settled lineups and spending from a finished draft', () => {
  const category = categories[0]!
  const start = startMatch({ categoryId: category.id, names: { p1: 'Alex', p2: 'Sam' } })
  expect(() => getShowdown(start, category)).toThrow(/finished/)

  let state = nextCard(playRound(start, 5, 3))
  for (let round = 2; round <= 10; round += 1) {
    state = nextCard(playRound(state, round <= 5 ? 1 : null, round <= 5 ? 0 : 1))
  }
  state = gameReducer(state, { type: 'SET_LOCAL_VOTE', matchId: state.matchId, vote: 'p1' })!

  const summary = getShowdown(state, category)
  expect(summary.players.map(({ picks }) => picks.length)).toEqual([5, 5])
  expect(summary.players[0]).toMatchObject({ name: 'Alex', spent: 9, remaining: 11 })
  const text = formatShowdownText(summary)
  const firstPick = category.items.find(({ id }) => id === start.deck[0])!
  expect(text).toContain(`• ${firstPick.title} — $5`)
  expect(text).toContain('Spent $9 · $11 remaining')
  expect(text).toContain('Player 2 · Sam')
  expect(text).not.toContain('$3')
  expect(text).not.toMatch(/vote|test-match/i)
  for (const id of state.deck.slice(state.outcomes.length)) {
    expect(text).not.toContain(category.items.find((item) => item.id === id)!.title)
  }
})
