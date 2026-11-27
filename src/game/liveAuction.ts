import { getActiveItems } from '../data/validateCategories'
import { createDeck, createSeededRandom } from './deck'
import { normalizePlayerName } from './names'
import { decideNoBid, getMaxLegalBid, getOpenSlots } from './rules'
import { DECK_SIZE, ROSTER_SIZE, STARTING_BUDGET } from './types'
import type { Category, LocalVote, PlayerId, PlayerState } from './types'

export type LiveCommand =
  | { type: 'REVEAL' | 'PASS' | 'NEXT' }
  | { type: 'RAISE'; amount: number }

export type LiveAction = (LiveCommand | { type: 'VOTE'; vote: LocalVote }) & { matchId: string; revision: number }
type Offer = Readonly<{ player: PlayerId; amount: number }>
type Turn = Readonly<{ player: PlayerId; offer: Offer | null; opponentPassed: boolean }>
export type LiveOutcome = Readonly<{ itemId: string } & (
  | { kind: 'won'; winner: PlayerId; paid: number }
  | { kind: 'mandatory'; winner: PlayerId; paid: 1 }
  | { kind: 'discarded' }
)>

export type LiveAuction = Readonly<{
  matchId: string
  categoryId: string
  deck: readonly string[]
  deckIndex: number
  players: Readonly<Record<PlayerId, PlayerState>>
  forcedPriority: PlayerId
  stage: 'reveal' | 'auction' | 'outcome' | 'finished'
  turn: Turn | null
  outcomes: readonly LiveOutcome[]
  history: readonly Readonly<{ round: number; command: LiveCommand; player: PlayerId | null }>[]
  vote: LocalVote | null
}>

export function initializeLiveAuction(category: Category, matchId: string, deck: readonly string[], names: Record<PlayerId, string>): LiveAuction | null {
  const p1 = normalizePlayerName(names.p1)
  const p2 = normalizePlayerName(names.p2)
  const eligibleItems = new Set(getActiveItems(category).map(({ id }) => id))
  if (!p1 || !p2 || !/^[A-Za-z0-9_-]{1,100}$/.test(matchId) || deck.length !== DECK_SIZE || new Set(deck).size !== DECK_SIZE ||
      deck.some((id) => !eligibleItems.has(id))) return null

  return {
    matchId, categoryId: category.id, deck: [...deck], deckIndex: 0,
    players: {
      p1: { id: 'p1', name: p1, budgetRemaining: STARTING_BUDGET, roster: [] },
      p2: { id: 'p2', name: p2, budgetRemaining: STARTING_BUDGET, roster: [] },
    },
    forcedPriority: 'p1', stage: 'reveal', turn: null, outcomes: [], history: [], vote: null,
  }
}

export function startLiveAuction(category: Category, matchId: string, seed: number, names: Record<PlayerId, string>, previousDeck?: readonly string[]) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null
  const deck = createDeck(category, createSeededRandom(seed))
  if (!deck) return null
  const draw = previousDeck && deck.every((item, index) => item === previousDeck[index]) ? [...deck.slice(1), deck[0]!] : deck
  return initializeLiveAuction(category, matchId, draw, names)
}

const opponentOf = (player: PlayerId): PlayerId => player === 'p1' ? 'p2' : 'p1'

export function getRaiseRange(state: LiveAuction): { min: number; max: number } | null {
  const { turn } = state
  if (!turn) return null
  const max = getMaxLegalBid(state.players[turn.player])
  if (max === null || max < 1) return null
  if (!turn.offer) return { min: 1, max: 1 }
  const min = turn.offer.amount + 1
  return min <= max ? { min, max } : null
}

export function isLiveComplete(state: LiveAuction) {
  return state.players.p1.roster.length === ROSTER_SIZE && state.players.p2.roster.length === ROSTER_SIZE
}

export function getLiveItemId(state: LiveAuction): string | null {
  return state.stage === 'auction' || state.stage === 'outcome' ? state.deck[state.deckIndex] ?? null : null
}

function settle(state: LiveAuction, offer: Offer | null): LiveAuction {
  const itemId = state.deck[state.deckIndex]!
  let forcedPriority = state.forcedPriority
  let outcome: LiveOutcome
  if (offer) outcome = { itemId, kind: 'won', winner: offer.player, paid: offer.amount }
  else {
    const decision = decideNoBid(getOpenSlots(state.players.p1), getOpenSlots(state.players.p2), state.deck.length - state.deckIndex, forcedPriority)
    outcome = decision.kind === 'discarded' ? { itemId, kind: 'discarded' } : { itemId, kind: 'mandatory', winner: decision.winner, paid: 1 }
    if (decision.kind === 'mandatory') forcedPriority = decision.nextPriority
  }
  let players = state.players
  if (outcome.kind !== 'discarded') {
    const winner = players[outcome.winner]
    players = { ...players, [winner.id]: {
      ...winner, budgetRemaining: winner.budgetRemaining - outcome.paid,
      roster: [...winner.roster, { itemId, paid: outcome.paid, roundNumber: state.deckIndex + 1,
        acquisition: outcome.kind === 'won' ? 'bid' : 'mandatory' }],
    } }
  }
  return { ...state, players, forcedPriority, turn: null, stage: 'outcome', outcomes: [...state.outcomes, outcome] }
}

export function reduceLiveAuction(state: LiveAuction, action: LiveAction): LiveAuction {
  if (action.matchId !== state.matchId || action.revision !== state.history.length) return state
  if (action.type === 'VOTE') return state.stage === 'finished' && action.vote !== state.vote ? { ...state, vote: action.vote } : state

  const { turn, stage } = state
  const command: LiveCommand = action.type === 'RAISE' ? { type: 'RAISE', amount: action.amount } : { type: action.type }
  let next: LiveAuction
  switch (action.type) {
    case 'REVEAL': {
      if (stage !== 'reveal') return state
      const opener: PlayerId = state.deckIndex % 2 === 0 ? 'p1' : 'p2'
      const player = getOpenSlots(state.players[opener]) > 0 ? opener : opponentOf(opener)
      next = { ...state, stage: 'auction', turn: { player, offer: null, opponentPassed: getOpenSlots(state.players[opponentOf(player)]) === 0 } }
      break
    }
    case 'RAISE': {
      if (!turn) return state
      const range = getRaiseRange(state)
      if (!range || !Number.isInteger(action.amount) || action.amount < range.min || action.amount > range.max) return state
      const offer = { player: turn.player, amount: action.amount }
      next = turn.opponentPassed ? settle(state, offer)
        : { ...state, turn: { player: opponentOf(turn.player), offer, opponentPassed: false } }
      break
    }
    case 'PASS':
      if (!turn) return state
      next = turn.offer || turn.opponentPassed ? settle(state, turn.offer)
        : { ...state, turn: { player: opponentOf(turn.player), offer: null, opponentPassed: true } }
      break
    case 'NEXT':
      if (stage !== 'outcome') return state
      if (isLiveComplete(state)) next = { ...state, stage: 'finished' }
      else {
        if (state.deckIndex + 1 >= state.deck.length) throw new Error('Auction exhausted the deck before filling both rosters.')
        next = { ...state, stage: 'reveal', deckIndex: state.deckIndex + 1 }
      }
      break
  }
  return { ...next, history: [...state.history, { round: state.deckIndex + 1, command, player: turn?.player ?? null }] }
}
