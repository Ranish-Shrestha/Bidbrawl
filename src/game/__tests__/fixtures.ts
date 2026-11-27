import assert from 'node:assert/strict'
import { categories } from '../../data/categories'
import { gameReducer } from '../reducer'
import { getRoundRef } from '../selectors'
import type { GameAction, MatchState } from '../types'

export type RoundAction =
  | { type: 'BEGIN_BIDDING' | 'ACK_HANDOFF' | 'REVEAL_NEXT' }
  | { type: 'LOCK_P1_BID' | 'LOCK_P2_BID'; bid: number }

export function startMatch(overrides: Partial<Extract<GameAction, { type: 'START_MATCH' }>> = {}): MatchState {
  const state = gameReducer(null, {
    type: 'START_MATCH', matchId: 'test-match', categoryId: categories[0]!.id, seed: 201,
    ...overrides,
  })
  assert.ok(state)
  return state
}

export function act(state: MatchState, action: RoundAction): MatchState {
  const next = gameReducer(state, { ...action, ...getRoundRef(state) })
  assert.ok(next)
  return next
}

export function playRound(state: MatchState, p1Bid: number | null, p2Bid: number | null): MatchState {
  let next = act(state, { type: 'BEGIN_BIDDING' })
  if (p1Bid !== null) next = act(next, { type: 'LOCK_P1_BID', bid: p1Bid })
  if (next.stage === 'handoff') next = act(next, { type: 'ACK_HANDOFF' })
  if (p2Bid !== null) next = act(next, { type: 'LOCK_P2_BID', bid: p2Bid })
  assert.equal(next.stage, 'outcome')
  return next
}

export function nextCard(state: MatchState): MatchState {
  return act(state, { type: 'REVEAL_NEXT' })
}
