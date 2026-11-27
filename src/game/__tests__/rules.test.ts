import { describe, expect, it } from 'vitest'
import { canDiscard, getMaxLegalBid, getOpenSlots, isComplete, resolveRound, validateBid } from '../rules'
import { getCurrentItemId, getCurrentOutcome, getDiscardCount, getRemainingCardCount } from '../selectors'
import { act, nextCard, playRound, startMatch } from './fixtures'

describe('Secret Bid rules', () => {
  it('starts with two $20 budgets, no picks, and 12 unique mystery cards', () => {
    const state = startMatch()
    expect(state.stage).toBe('reveal')
    expect(new Set(state.deck).size).toBe(12)
    expect(getCurrentItemId(state)).toBe(state.deck[0])
    expect(getRemainingCardCount(state)).toBe(12)
    expect(state.players.p1).toEqual({ id: 'p1', name: 'Player 1', budgetRemaining: 20, roster: [] })
    expect(state.players.p2).toEqual({ id: 'p2', name: 'Player 2', budgetRemaining: 20, roster: [] })
    expect(state.tiePriority).toBe('p1')
    expect(state.forcedPriority).toBe('p1')
  })

  it('rejects invalid bids and protects one dollar per remaining slot', () => {
    const state = startMatch()
    expect(getMaxLegalBid(state.players.p1)).toBe(16)
    for (const bid of [-1, 0.5, 17, Number.NaN, Infinity]) {
      expect(validateBid(state.players.p1, bid)).toBe(false)
      const bidding = act(state, { type: 'BEGIN_BIDDING' })
      expect(act(bidding, { type: 'LOCK_P1_BID', bid })).toBe(bidding)
    }
    expect(validateBid(state.players.p1, 0)).toBe(true)
    const p1 = playRound(state, 16, 2).players.p1
    expect(p1.budgetRemaining).toBe(4)
    expect(getOpenSlots(p1)).toBe(4)
    expect(getMaxLegalBid(p1)).toBe(1)
    expect(validateBid(p1, 2)).toBe(false)
  })

  it.each([[6, 3, 'p1', 6], [1, 8, 'p2', 8], [0, 3, 'p2', 3], [4, 0, 'p1', 4]] as const)(
    'resolves bids %i and %i and charges %s $%i', (p1Bid, p2Bid, winner, paid) => {
      const result = playRound(startMatch(), p1Bid, p2Bid)
      const loser = winner === 'p1' ? 'p2' : 'p1'
      expect(getCurrentOutcome(result)).toMatchObject({ kind: 'won', winner, p1Bid, p2Bid, paid, tied: false })
      expect(result.players[winner].budgetRemaining).toBe(20 - paid)
      expect(result.players[loser].budgetRemaining).toBe(20)
      expect(result.tiePriority).toBe('p1')
      expect(result.forcedPriority).toBe('p1')
    },
  )

  it('alternates positive ties and flips only once per tie', () => {
    const first = playRound(startMatch(), 3, 3)
    expect(getCurrentOutcome(first)).toMatchObject({ kind: 'won', winner: 'p1', paid: 3, tied: true })
    expect(first.tiePriority).toBe('p2')
    expect(resolveRound(first, 3)).toBe(first)
    const ordinary = playRound(nextCard(first), 2, 0)
    expect(ordinary.tiePriority).toBe('p2')
    const second = playRound(nextCard(ordinary), 1, 1)
    expect(getCurrentOutcome(second)).toMatchObject({ kind: 'won', winner: 'p2', paid: 1, tied: true })
    expect(second.tiePriority).toBe('p1')
    expect(second.forcedPriority).toBe('p1')
  })

  it('discards at most twice and assigns for $1 at capacity using separate priority', () => {
    const start = startMatch()
    expect(canDiscard(start)).toBe(true)
    const first = playRound(start, 0, 0)
    expect(getCurrentOutcome(first)).toMatchObject({ kind: 'discarded', p1Bid: 0, p2Bid: 0 })
    expect(first.players).toBe(start.players)
    expect(first.forcedPriority).toBe('p1')
    const second = playRound(nextCard(first), 0, 0)
    expect(getDiscardCount(second)).toBe(2)

    const atCapacity = nextCard(second)
    expect(canDiscard(atCapacity)).toBe(false)
    const tied = playRound(atCapacity, 0, 0)
    expect(getCurrentOutcome(tied)).toMatchObject({ kind: 'mandatory', winner: 'p1', paid: 1 })
    expect(tied.players.p1.budgetRemaining).toBe(19)
    expect(tied.forcedPriority).toBe('p2')
    const unequal = playRound(nextCard(tied), 0, 0)
    expect(getCurrentOutcome(unequal)).toMatchObject({ kind: 'mandatory', winner: 'p2', paid: 1 })
    expect(unequal.forcedPriority).toBe('p2')
    const tiedAgain = playRound(nextCard(unequal), 0, 0)
    expect(getCurrentOutcome(tiedAgain)).toMatchObject({ kind: 'mandatory', winner: 'p2', paid: 1 })
    expect(tiedAgain.forcedPriority).toBe('p1')
    expect(tiedAgain.tiePriority).toBe('p1')
  })

  it('handles a lone eligible bidder passing with two cards and one slot left', () => {
    let state = startMatch()
    for (let i = 0; i < 5; i += 1) state = nextCard(playRound(state, 1, 0))
    const first = playRound(state, null, 0)
    expect(getCurrentOutcome(first)).toMatchObject({ kind: 'discarded', p1Bid: null, p2Bid: 0 })
    state = nextCard(first)
    for (let i = 0; i < 4; i += 1) state = nextCard(playRound(state, null, 1))
    expect(getRemainingCardCount(state)).toBe(2)
    state = nextCard(playRound(state, null, 0))
    expect(canDiscard(state)).toBe(false)
    const last = playRound(state, null, 0)
    expect(getCurrentOutcome(last)).toMatchObject({ kind: 'mandatory', winner: 'p2', paid: 1, p1Bid: null })
    expect(isComplete(last)).toBe(true)
    expect(nextCard(last).stage).toBe('finished')
  })

  it.each(['p1', 'p2'] as const)('skips handoff when %s has a full roster', (full) => {
    let state = startMatch()
    for (let i = 0; i < 5; i += 1) {
      state = nextCard(playRound(state, full === 'p1' ? 1 : 0, full === 'p2' ? 1 : 0))
    }
    expect(getMaxLegalBid(state.players[full])).toBeNull()
    expect(validateBid(state.players[full], 0)).toBe(false)
    const waiting = act(state, { type: 'BEGIN_BIDDING' })
    expect(waiting.stage).toBe(full === 'p1' ? 'bid-p2' : 'bid-p1')
    expect(act(waiting, { type: full === 'p1' ? 'LOCK_P1_BID' : 'LOCK_P2_BID', bid: 1 })).toBe(waiting)
    const result = act(waiting, { type: full === 'p1' ? 'LOCK_P2_BID' : 'LOCK_P1_BID', bid: 1 })
    expect(result.stage).toBe('outcome')
    expect(result.players[full]).toBe(state.players[full])
    expect(result.players[full === 'p1' ? 'p2' : 'p1'].roster).toHaveLength(1)
  })
})
