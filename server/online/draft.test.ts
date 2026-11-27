// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { categories } from '../../src/data/categories'
import { getRoundRef } from '../../src/game/selectors'
import type { PlayerId } from '../../src/game/types'
import { createOnlineDraft, getOnlineSnapshot, updateOnlineDraft } from './draft'
import type { OnlineDraft } from './draft'

const startTime = 100_000

function start() {
  const draft = createOnlineDraft({ matchId: 'online-match', category: categories[0]!, names: { p1: 'Alex', p2: 'Sam' }, now: startTime })
  if (!draft) throw new Error('Expected the draft to start')
  return draft
}

function ref(draft: OnlineDraft) {
  return { ...getRoundRef(draft.match), revision: draft.revision }
}

function bid(draft: OnlineDraft, seat: PlayerId, amount: number, now = (draft.deadlineAt ?? startTime + 15_000) - 14_999) {
  return updateOnlineDraft(draft, { type: 'BID', ...ref(draft), seat, amount }, now)
}

describe('Online round processing', () => {
  it('accepts either seat first against the same public revision and resolves both bids together', () => {
    const draft = start()
    expect(new Set(draft.match.deck).size).toBe(12)
    expect(getOnlineSnapshot(draft, 'p1')).toMatchObject({ stage: 'bidding', roundNumber: 1, deadlineAt: startTime + 15_000 })
    const first = bid(draft, 'p2', 4)
    expect(first.status).toBe('applied')
    expect(first.draft.revision).toBe(draft.revision)
    expect(first.draft.match.players).toBe(draft.match.players)
    const second = updateOnlineDraft(first.draft, { type: 'BID', ...ref(draft), seat: 'p1', amount: 8 }, startTime + 2)
    expect(second.status).toBe('applied')
    expect(second.draft.revision).toBe(draft.revision + 1)
    expect(second.draft.sealedBids).toEqual({})
    expect(second.draft.match.players.p1.budgetRemaining).toBe(12)
    expect(second.draft.match.players.p2.budgetRemaining).toBe(20)
    expect(second.draft).toEqual(bid(bid(draft, 'p1', 8).draft, 'p2', 4).draft)
    for (const seat of ['p1', 'p2'] as const) {
      expect(getOnlineSnapshot(second.draft, seat)).toMatchObject({
        stage: 'outcome', ownBid: null, currentOutcome: { winner: 'p1', p1Bid: 8, p2Bid: 4, paid: 8 },
      })
    }
  })

  it('makes the opponent’s snapshot identical before and after a sealed bid', () => {
    const draft = start()
    const locked = bid(draft, 'p1', 13).draft
    expect(getOnlineSnapshot(locked, 'p2')).toEqual(getOnlineSnapshot(draft, 'p2'))
    const own = getOnlineSnapshot(locked, 'p1')
    expect(own.ownBid).toEqual({ seat: 'p1', max: 16, locked: true })
    expect(own.currentOutcome).toBeNull()
    expect(own).not.toHaveProperty('sealedBids')
    expect(own).not.toHaveProperty('deck')
    expect(own).not.toHaveProperty('match')
    for (const itemId of draft.match.deck.slice(1)) expect(JSON.stringify(own)).not.toContain(itemId)
  })

  it('rejects invalid, overwritten and stale bids without charging a player again', () => {
    const draft = start()
    for (const invalid of [-1, 0.5, 17, Infinity, NaN]) {
      expect(bid(draft, 'p1', invalid)).toEqual({ draft, status: 'invalid_bid' })
    }
    const locked = bid(draft, 'p1', 16).draft
    expect(bid(locked, 'p1', 0)).toEqual({ draft: locked, status: 'already_locked' })
    const resolve = { type: 'BID', ...ref(locked), seat: 'p2', amount: 0 } as const
    const outcome = updateOnlineDraft(locked, resolve, startTime + 2).draft
    expect(updateOnlineDraft(outcome, resolve, startTime + 3)).toEqual({ draft: outcome, status: 'stale' })
    expect(outcome.match.players.p1.budgetRemaining).toBe(4)
    const next = updateOnlineDraft(outcome, { type: 'NEXT', ...ref(outcome) }, startTime + 3).draft
    expect(updateOnlineDraft(next, resolve, startTime + 4)).toEqual({ draft: next, status: 'stale' })
    expect(getOnlineSnapshot(next, 'p1').ownBid?.max).toBe(1)
    expect(bid(next, 'p1', 2)).toEqual({ draft: next, status: 'invalid_bid' })
  })

  it('uses the deadline boundary for missing bids and preserves a bid locked before it', () => {
    const draft = start()
    const deadline = draft.deadlineAt!
    const action = { type: 'CHECK_DEADLINE', ...ref(draft) } as const
    expect(updateOnlineDraft(draft, action, deadline - 1)).toEqual({ draft, status: 'waiting' })
    const locked = bid(draft, 'p1', 6, deadline - 1).draft
    const late = bid(locked, 'p2', 9, deadline)
    expect(late.status).toBe('closed')
    expect(getOnlineSnapshot(late.draft, 'p2').currentOutcome).toMatchObject({ p1Bid: 6, p2Bid: 0, winner: 'p1', paid: 6 })
    expect(updateOnlineDraft(locked, action, deadline).draft).toEqual(late.draft)
    expect(updateOnlineDraft(late.draft, action, deadline + 1)).toEqual({ draft: late.draft, status: 'stale' })
  })

  it('resolves immediately with one eligible seat and represents a full seat with a null bid', () => {
    let draft = start()
    for (let round = 1; round <= 5; round += 1) {
      draft = bid(bid(draft, 'p1', 1).draft, 'p2', 0).draft
      draft = updateOnlineDraft(draft, { type: 'NEXT', ...ref(draft) }, startTime + round * 2).draft
    }
    expect(bid(draft, 'p1', 0)).toEqual({ draft, status: 'invalid_bid' })
    const next = bid(draft, 'p2', 2).draft
    expect(getOnlineSnapshot(next, 'p1').currentOutcome).toMatchObject({ p1Bid: null, p2Bid: 2, winner: 'p2' })
  })

  it('finishes an all-timeout draft with exactly five picks per player', () => {
    let draft = start()
    for (let round = 1; round <= 12; round += 1) {
      const now = draft.deadlineAt!
      const outcome = updateOnlineDraft(draft, { type: 'CHECK_DEADLINE', ...ref(draft) }, now).draft
      expect(getOnlineSnapshot(outcome, 'p1').currentOutcome?.kind).toBe(round <= 2 ? 'discarded' : 'mandatory')
      draft = updateOnlineDraft(outcome, { type: 'NEXT', ...ref(outcome) }, now + 1).draft
    }
    expect(draft.match.stage).toBe('finished')
    expect(draft.deadlineAt).toBeNull()
    expect(getOnlineSnapshot(draft, 'p2').players.map(({ picks, budgetRemaining }) => [picks.length, budgetRemaining])).toEqual([[5, 15], [5, 15]])
  })
})
