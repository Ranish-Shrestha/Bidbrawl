import { ROSTER_SIZE } from './types'
import type { MatchState, Outcome, PlayerId, PlayerState } from './types'

export function getOpenSlots(player: PlayerState): number {
  return ROSTER_SIZE - player.roster.length
}

export function getMaxLegalBid(player: PlayerState): number | null {
  const openSlots = getOpenSlots(player)
  return openSlots > 0 ? player.budgetRemaining - (openSlots - 1) : null
}

export function validateBid(player: PlayerState, bid: number): boolean {
  const max = getMaxLegalBid(player)
  return max !== null && Number.isInteger(bid) && bid >= 0 && bid <= max
}

export function isComplete(state: MatchState): boolean {
  return getOpenSlots(state.players.p1) === 0 && getOpenSlots(state.players.p2) === 0
}

export function canDiscard(state: MatchState): boolean {
  const openSlots = getOpenSlots(state.players.p1) + getOpenSlots(state.players.p2)
  return state.deckIndex === state.outcomes.length && state.deck.length - state.deckIndex > openSlots
}

function otherPlayer(player: PlayerId): PlayerId {
  return player === 'p1' ? 'p2' : 'p1'
}

export function decideNoBid(p1Slots: number, p2Slots: number, cardsLeft: number, priority: PlayerId) {
  if (cardsLeft > p1Slots + p2Slots) return { kind: 'discarded' } as const
  const tied = p1Slots === p2Slots
  return {
    kind: 'mandatory', winner: tied ? priority : p1Slots > p2Slots ? 'p1' : 'p2',
    nextPriority: tied ? otherPlayer(priority) : priority,
  } as const
}

// Resolve only the final eligible bid. With both players active, Player 1's bid
// was already locked before the handoff. A full player's bid is represented by null.
export function resolveRound(state: MatchState, bid: number): MatchState {
  if (state.stage === 'bid-p2') return resolveSealedRound(state, state.pendingP1Bid, bid)
  if (state.stage === 'bid-p1' && state.pendingP1Bid === null && getOpenSlots(state.players.p2) === 0) {
    return resolveSealedRound(state, bid, null)
  }
  return state
}

/** Settle a round using one legal bid per eligible player. Local and online turn handling supply the bids. */
export function resolveSealedRound(state: MatchState, p1Bid: number | null, p2Bid: number | null): MatchState {
  if (state.deckIndex !== state.outcomes.length) return state
  const itemId = state.deck[state.deckIndex]
  if (!itemId) return state

  const p1Slots = getOpenSlots(state.players.p1)
  const p2Slots = getOpenSlots(state.players.p2)
  if (p1Slots === 0 && p2Slots === 0) return state
  const p1Legal = p1Slots === 0 ? p1Bid === null : p1Bid !== null && validateBid(state.players.p1, p1Bid)
  const p2Legal = p2Slots === 0 ? p2Bid === null : p2Bid !== null && validateBid(state.players.p2, p2Bid)
  if (!p1Legal || !p2Legal) return state

  const p1Offer = p1Bid ?? 0
  const p2Offer = p2Bid ?? 0
  const summary = { itemId, p1Bid, p2Bid }
  let outcome: Outcome
  let tiePriority = state.tiePriority
  let forcedPriority = state.forcedPriority

  if (p1Offer > 0 || p2Offer > 0) {
    const tied = p1Offer === p2Offer
    const winner = tied ? tiePriority : p1Offer > p2Offer ? 'p1' : 'p2'
    outcome = { ...summary, kind: 'won', winner, paid: Math.max(p1Offer, p2Offer), tied }
    if (tied) tiePriority = otherPlayer(tiePriority)
  } else {
    const decision = decideNoBid(p1Slots, p2Slots, state.deck.length - state.deckIndex, forcedPriority)
    outcome = decision.kind === 'discarded' ? { ...summary, kind: 'discarded' }
      : { ...summary, kind: 'mandatory', winner: decision.winner, paid: 1 }
    if (decision.kind === 'mandatory') forcedPriority = decision.nextPriority
  }

  let players = state.players
  if (outcome.kind !== 'discarded') {
    const player = players[outcome.winner]
    players = {
      ...players,
      [player.id]: {
        ...player,
        budgetRemaining: player.budgetRemaining - outcome.paid,
        roster: [...player.roster, {
          itemId,
          paid: outcome.paid,
          roundNumber: state.deckIndex + 1,
          acquisition: outcome.kind === 'won' ? 'bid' : 'mandatory',
        }],
      },
    }
  }

  return { ...state, players, tiePriority, forcedPriority, stage: 'outcome', pendingP1Bid: null, outcomes: [...state.outcomes, outcome] }
}
