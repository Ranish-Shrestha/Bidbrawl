import { categories } from '../data/categories'
import { getActiveItems, validateCategory } from '../data/validateCategories'
import { createGameReducer, findCategory, initializeMatch } from './reducer'
import { getRoundRef } from './selectors'
import { DECK_SIZE, MATCH_SCHEMA_VERSION } from './types'
import type { Category, GameAction, MatchState } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function matchesState(value: unknown, expected: unknown): boolean {
  if (isArray(expected)) {
    return isArray(value) && value.length === expected.length &&
      expected.every((entry, index) => matchesState(value[index], entry))
  }
  if (isRecord(expected)) {
    return isRecord(value) && Object.keys(value).length === Object.keys(expected).length &&
      Object.entries(expected).every(([key, entry]) => Object.hasOwn(value, key) && matchesState(value[key], entry))
  }
  return value === expected
}

type ValidationResult =
  | { valid: true; state: MatchState }
  | { valid: false; error: string }

export function parseMatchState(value: unknown, catalog: readonly Category[] = categories): ValidationResult {
  if (!isRecord(value) || value.schemaVersion !== MATCH_SCHEMA_VERSION) {
    return { valid: false, error: 'Unsupported match version.' }
  }
  if (typeof value.matchId !== 'string' || typeof value.categoryId !== 'string' || !isRecord(value.players)) {
    return { valid: false, error: 'Invalid match identity or players.' }
  }

  const category = findCategory(catalog, value.categoryId)
  if (!category || validateCategory(category).length > 0) return { valid: false, error: 'Unknown or invalid category.' }

  const activeIds = new Set(getActiveItems(category).map(({ id }) => id))
  if (!isArray(value.deck) || value.deck.length !== DECK_SIZE || new Set(value.deck).size !== DECK_SIZE ||
      !value.deck.every((id): id is string => typeof id === 'string' && activeIds.has(id))) {
    return { valid: false, error: 'Invalid mystery deck.' }
  }

  const { p1, p2 } = value.players
  if (!isRecord(p1) || !isRecord(p2) || typeof p1.name !== 'string' || typeof p2.name !== 'string') {
    return { valid: false, error: 'Invalid player names.' }
  }
  const initial = initializeMatch(value.matchId, value.categoryId, [...value.deck], { p1: p1.name, p2: p2.name })
  if (!initial) return { valid: false, error: 'Invalid match identity or players.' }
  if (!isArray(value.outcomes) || value.outcomes.length > DECK_SIZE) return { valid: false, error: 'Invalid round history.' }

  const reduce = createGameReducer(catalog)
  let state = initial
  function apply(action: GameAction) {
    state = reduce(state, action) ?? state
  }

  // Rebuild derived state through the same transitions used while playing.
  for (const outcome of value.outcomes) {
    if (!isRecord(outcome)) return { valid: false, error: 'Invalid round outcome.' }
    apply({ type: 'REVEAL_NEXT', ...getRoundRef(state) })
    const round = getRoundRef(state)
    apply({ type: 'BEGIN_BIDDING', ...round })
    if (typeof outcome.p1Bid === 'number') apply({ type: 'LOCK_P1_BID', ...round, bid: outcome.p1Bid })
    apply({ type: 'ACK_HANDOFF', ...round })
    if (typeof outcome.p2Bid === 'number') apply({ type: 'LOCK_P2_BID', ...round, bid: outcome.p2Bid })
    if (state.stage !== 'outcome' || !matchesState(outcome, state.outcomes[state.deckIndex])) {
      return { valid: false, error: 'Round outcome disagrees with the draft rules.' }
    }
  }

  if (value.stage !== 'outcome') apply({ type: 'REVEAL_NEXT', ...getRoundRef(state) })
  const round = getRoundRef(state)
  if (value.stage === 'bid-p1' || value.stage === 'handoff' || value.stage === 'bid-p2') {
    apply({ type: 'BEGIN_BIDDING', ...round })
    if (value.stage !== 'bid-p1' && typeof value.pendingP1Bid === 'number') {
      apply({ type: 'LOCK_P1_BID', ...round, bid: value.pendingP1Bid })
    }
    if (value.stage === 'bid-p2') apply({ type: 'ACK_HANDOFF', ...round })
  }
  if (value.localVote === 'p1' || value.localVote === 'p2' || value.localVote === 'tie') {
    apply({ type: 'SET_LOCAL_VOTE', matchId: state.matchId, vote: value.localVote })
  }

  return matchesState(value, state)
    ? { valid: true, state }
    : { valid: false, error: 'Match state disagrees with the round history.' }
}

export function validateMatchState(value: unknown, catalog: readonly Category[] = categories): string[] {
  const result = parseMatchState(value, catalog)
  return result.valid ? [] : [result.error]
}
