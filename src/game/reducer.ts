import { categories } from '../data/categories'
import { createDeck, createSeededRandom } from './deck'
import { normalizePlayerName } from './names'
import { getOpenSlots, isComplete, resolveRound, validateBid } from './rules'
import { getRoundRef } from './selectors'
import { MATCH_SCHEMA_VERSION, STARTING_BUDGET } from './types'
import type { Category, GameAction, MatchState, PlayerId } from './types'

export function findCategory(catalog: readonly Category[], id: string): Category | undefined {
  const matches = catalog.filter((category) => category.id === id)
  return matches.length === 1 ? matches[0] : undefined
}

// Both callers supply a deck already checked against the category.
export function initializeMatch(
  matchId: string,
  categoryId: string,
  deck: readonly string[],
  names: Partial<Record<PlayerId, string>> = {},
): MatchState | null {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(matchId)) return null
  const p1Name = normalizePlayerName(names.p1 ?? 'Player 1')
  const p2Name = normalizePlayerName(names.p2 ?? 'Player 2')
  if (!p1Name || !p2Name) return null

  return {
    schemaVersion: MATCH_SCHEMA_VERSION,
    matchId,
    categoryId,
    deck,
    deckIndex: 0,
    players: {
      p1: { id: 'p1', name: p1Name, budgetRemaining: STARTING_BUDGET, roster: [] },
      p2: { id: 'p2', name: p2Name, budgetRemaining: STARTING_BUDGET, roster: [] },
    },
    stage: 'reveal',
    pendingP1Bid: null,
    tiePriority: 'p1',
    forcedPriority: 'p1',
    outcomes: [],
    localVote: null,
  }
}

function makeDeck(catalog: readonly Category[], categoryId: string, seed: number): readonly string[] | null {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null
  const category = findCategory(catalog, categoryId)
  return category ? createDeck(category, createSeededRandom(seed)) : null
}

export function createGameReducer(catalog: readonly Category[]) {
  return function reduce(state: MatchState | null, action: GameAction): MatchState | null {
    if (action.type === 'START_MATCH') {
      if (state !== null) return state
      const deck = makeDeck(catalog, action.categoryId, action.seed)
      return deck ? initializeMatch(action.matchId, action.categoryId, deck, action.names) : null
    }

    if (!state || state.matchId !== action.matchId) return state
    if ('roundNumber' in action && getRoundRef(state).roundNumber !== action.roundNumber) return state

    switch (action.type) {
      case 'RESET_MATCH':
        return null
      case 'RESTART_SAME_CATEGORY': {
        if (state.stage !== 'finished' || action.newMatchId === state.matchId) return state
        const deck = makeDeck(catalog, state.categoryId, action.seed)
        if (!deck) return state
        const orderedDeck = deck.every((itemId, index) => itemId === state.deck[index])
          ? [...deck.slice(1), deck[0]!]
          : deck
        return initializeMatch(action.newMatchId, state.categoryId, orderedDeck, {
          p1: state.players.p1.name,
          p2: state.players.p2.name,
        }) ?? state
      }
      case 'SET_LOCAL_VOTE':
        if (state.stage !== 'finished' || state.localVote === action.vote) return state
        return { ...state, localVote: action.vote }
      case 'BEGIN_BIDDING':
        if (state.stage !== 'reveal') return state
        return { ...state, stage: getOpenSlots(state.players.p1) > 0 ? 'bid-p1' : 'bid-p2' }
      case 'LOCK_P1_BID':
        if (state.stage !== 'bid-p1' || !validateBid(state.players.p1, action.bid)) return state
        if (getOpenSlots(state.players.p2) === 0) return resolveRound(state, action.bid)
        return { ...state, pendingP1Bid: action.bid, stage: 'handoff' }
      case 'ACK_HANDOFF':
        return state.stage === 'handoff' ? { ...state, stage: 'bid-p2' } : state
      case 'LOCK_P2_BID':
        return state.stage === 'bid-p2' ? resolveRound(state, action.bid) : state
      case 'REVEAL_NEXT':
        if (state.stage !== 'outcome') return state
        if (isComplete(state)) return { ...state, stage: 'finished' }
        if (state.deckIndex + 1 >= state.deck.length) throw new Error('Draft ran out of cards before both rosters were full.')
        return { ...state, stage: 'reveal', deckIndex: state.deckIndex + 1 }
    }
  }
}

export const gameReducer = createGameReducer(categories)
