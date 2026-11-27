import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { categories } from '../../data/categories'
import { validateCategories, validateCategory } from '../../data/validateCategories'
import { createDeck, createSeededRandom } from '../deck'
import { createGameReducer, gameReducer } from '../reducer'
import { getMatchView, getRoundRef } from '../selectors'
import type { Category, GameAction } from '../types'
import { act, nextCard, playRound, startMatch } from './fixtures'

describe('Category data and match setup', () => {
  it('bundles eight or more valid categories with 20–30 unique items each', () => {
    expect(categories.length).toBeGreaterThanOrEqual(8)
    expect(validateCategories(categories)).toEqual([])
    for (const category of categories) {
      expect(category.items.length).toBeGreaterThanOrEqual(20)
      expect(category.items.length).toBeLessThanOrEqual(30)
    }
  })

  it('draws from active items only and reproduces the draw with a seed', () => {
    const base = categories[0]!
    const inactive = base.items[0]!
    const category = { ...base, items: [{ ...inactive, active: false }, ...base.items.slice(1)] }
    const deck = createDeck(category, createSeededRandom(22))
    expect(deck).toHaveLength(12)
    expect(deck).not.toContain(inactive.id)
    expect(createDeck(category, createSeededRandom(22))).toEqual(deck)
    expect(createDeck(category, createSeededRandom(23))).not.toEqual(deck)
    expect(createDeck(category, () => 1)).toBeNull()
  })

  it('rejects too few active items, duplicate IDs or titles, and invalid category metadata', () => {
    const category = categories[0]!
    const invalid: Category[] = [
      { ...category, items: category.items.slice(0, 11) },
      { ...category, items: category.items.map((item, index) => ({ ...item, active: index < 11 })) },
      { ...category, items: [...category.items, category.items[0]!] },
      { ...category, items: [...category.items, { ...category.items[0]!, id: 'copy' }] },
      { ...category, items: [{ ...category.items[0]!, title: '', emoji: 'text' }, ...category.items.slice(1)] },
      { ...category, id: '<svg-onload>', emoji: '', title: ' Extra spaces ' },
    ]
    const action = { type: 'START_MATCH', matchId: 'test-match', categoryId: category.id, seed: 201 } as const
    for (const entry of invalid) {
      expect(validateCategory(entry).length).toBeGreaterThan(0)
      expect(createGameReducer([entry])(null, { ...action, categoryId: entry.id })).toBeNull()
    }
    expect(validateCategories([category, category])).toContain(`Duplicate category ID: ${category.id}`)
    expect(createGameReducer([category, category])(null, action)).toBeNull()
    expect(gameReducer(null, { ...action, categoryId: '__proto__' })).toBeNull()
    expect(gameReducer(null, { ...action, seed: Number.NaN })).toBeNull()
  })

  it('normalizes and truncates names by grapheme and rejects blank or control-only text', () => {
    const family = '👩‍👩‍👧‍👦'
    const state = startMatch({ names: { p1: `  ${family.repeat(21)}  `, p2: '  Cafe\u0301  ' } })
    expect(state.players.p1.name).toBe(family.repeat(20))
    expect(state.players.p2.name).toBe('Café')
    for (const p1 of ['   ', '\u200D', 'Alex\nSam', 'Alex\u202ESam']) {
      expect(gameReducer(null, {
        type: 'START_MATCH', matchId: 'invalid-name', categoryId: state.categoryId, seed: 12, names: { p1 },
      })).toBeNull()
    }
  })

  it('keeps a display name that resembles markup as inert text', () => {
    const name = '<img src=x onerror>'
    const state = startMatch({ names: { p1: name } })
    const view = getMatchView(state)
    const { container } = render(<div>{view.players.p1.name}</div>)
    expect(screen.getByText(name)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('Match transitions', () => {
  it('hides locked bids and future cards until the correct transition', () => {
    const start = startMatch()
    const bidP1 = act(start, { type: 'BEGIN_BIDDING' })
    expect(act(start, { type: 'LOCK_P1_BID', bid: 5 })).toBe(start)
    expect(act(bidP1, { type: 'LOCK_P2_BID', bid: 3 })).toBe(bidP1)
    const handoff = act(bidP1, { type: 'LOCK_P1_BID', bid: 5 })
    expect(handoff.stage).toBe('handoff')
    expect(handoff.pendingP1Bid).toBe(5)
    expect(handoff.players).toBe(start.players)
    expect(act(handoff, { type: 'LOCK_P1_BID', bid: 6 })).toBe(handoff)
    expect(act(handoff, { type: 'LOCK_P2_BID', bid: 3 })).toBe(handoff)
    expect(getMatchView(handoff)).toMatchObject({ privateTurn: null, currentOutcome: null })
    const bidP2 = act(handoff, { type: 'ACK_HANDOFF' })
    const view = getMatchView(bidP2)
    expect(view.privateTurn).toEqual({ player: 'p2', maxBid: 16 })
    expect(view).not.toHaveProperty('pendingP1Bid')
    expect(view).not.toHaveProperty('deck')
    expect(view).not.toHaveProperty('outcomes')
    expect(view.currentOutcome).toBeNull()
    expect(act(bidP2, { type: 'LOCK_P2_BID', bid: 17 })).toBe(bidP2)
    const outcome = act(bidP2, { type: 'LOCK_P2_BID', bid: 3 })
    expect(getMatchView(outcome).currentOutcome).toMatchObject({ p1Bid: 5, p2Bid: 3 })
    expect(outcome.pendingP1Bid).toBeNull()
    expect(getMatchView(nextCard(outcome))).toMatchObject({ currentItemId: start.deck[1], currentOutcome: null, roundNumber: 2 })
  })

  it('ignores repeated submissions and stale actions from a previous round or match', () => {
    const start = startMatch()
    const bidP1 = act(start, { type: 'BEGIN_BIDDING' })
    const handoff = act(bidP1, { type: 'LOCK_P1_BID', bid: 5 })
    const bidP2 = act(handoff, { type: 'ACK_HANDOFF' })
    const lock: GameAction = { type: 'LOCK_P2_BID', ...getRoundRef(bidP2), bid: 3 }
    const outcome = gameReducer(bidP2, lock)!
    expect(gameReducer(bidP2, lock)).toEqual(outcome)
    expect(gameReducer(outcome, lock)).toBe(outcome)
    expect(outcome.players.p1.budgetRemaining).toBe(15)
    expect(bidP2.players.p1.budgetRemaining).toBe(20)
    const next = act(outcome, { type: 'REVEAL_NEXT' })
    expect(gameReducer(next, { type: 'REVEAL_NEXT', ...getRoundRef(outcome) })).toBe(next)
    const waiting = act(act(act(next, { type: 'BEGIN_BIDDING' }), { type: 'LOCK_P1_BID', bid: 3 }), { type: 'ACK_HANDOFF' })
    expect(gameReducer(waiting, lock)).toBe(waiting)
    expect(gameReducer(waiting, { ...lock, ...getRoundRef(waiting), matchId: 'old-match' })).toBe(waiting)
  })

  it('finishes on the tenth acquisition, hides unused cards, and clears draft state on rematch', () => {
    const initial = startMatch({ names: { p1: 'Alex', p2: 'Sam' } })
    let state = playRound(initial, 1, 1)
    expect(state.tiePriority).toBe('p2')
    for (let i = 1; i < 10; i += 1) {
      state = playRound(nextCard(state), i < 5 ? 1 : null, i < 5 ? 0 : 1)
    }
    const vote = { type: 'SET_LOCAL_VOTE', matchId: initial.matchId, vote: 'tie' } as const
    expect(gameReducer(state, vote)).toBe(state)
    expect(state.stage).toBe('outcome')
    const finished = nextCard(state)
    expect(finished.stage).toBe('finished')
    expect(finished.players.p1.roster).toHaveLength(5)
    expect(finished.players.p2.roster).toHaveLength(5)
    expect(getMatchView(finished)).toMatchObject({ currentItemId: null, currentOutcome: null, remainingCards: 2 })
    expect(nextCard(finished)).toBe(finished)
    const voted = gameReducer(finished, vote)!
    expect(voted.localVote).toBe('tie')

    const rematch = { type: 'RESTART_SAME_CATEGORY', matchId: initial.matchId, newMatchId: 'rematch', seed: 201 } as const
    expect(gameReducer(state, rematch)).toBe(state)
    const restarted = gameReducer(voted, rematch)!
    expect(restarted).toEqual({ ...initial, matchId: 'rematch', deck: restarted.deck })
    expect(restarted.deck).not.toEqual(initial.deck)
    expect(gameReducer(restarted, { type: 'RESET_MATCH', matchId: initial.matchId })).toBe(restarted)
    expect(gameReducer(restarted, { type: 'RESET_MATCH', matchId: restarted.matchId })).toBeNull()
  })
})
