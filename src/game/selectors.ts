import { getMaxLegalBid, getOpenSlots, isComplete } from './rules.js'
import type { MatchState, Outcome, PlayerId, RoundRef } from './types.js'

export function getRoundRef(state: MatchState): RoundRef {
  return { matchId: state.matchId, roundNumber: state.deckIndex + 1 }
}

export function getDiscardCount(state: MatchState): number {
  return state.outcomes.filter(({ kind }) => kind === 'discarded').length
}

export function getRemainingCardCount(state: MatchState): number {
  return state.deck.length - state.outcomes.length
}

export function getCurrentItemId(state: MatchState): string | null {
  return state.stage === 'finished' ? null : state.deck[state.deckIndex] ?? null
}

export function getCurrentOutcome(state: MatchState): Outcome | null {
  return state.stage === 'outcome' ? state.outcomes[state.deckIndex] ?? null : null
}

export function getActiveBidder(state: MatchState): PlayerId | null {
  if (state.stage === 'bid-p1') return 'p1'
  if (state.stage === 'bid-p2') return 'p2'
  return null
}

export function isPrivateStage(stage: MatchState['stage']): boolean {
  return stage === 'bid-p1' || stage === 'bid-p2' || stage === 'handoff'
}

export function getMatchView(state: MatchState) {
  const bidder = getActiveBidder(state)
  return {
    ...getRoundRef(state),
    stage: state.stage,
    categoryId: state.categoryId,
    currentItemId: getCurrentItemId(state),
    currentOutcome: getCurrentOutcome(state),
    players: state.players,
    remainingCards: getRemainingCardCount(state),
    openSlots: getOpenSlots(state.players.p1) + getOpenSlots(state.players.p2),
    discardedCount: getDiscardCount(state),
    complete: isComplete(state),
    tiePriority: state.tiePriority,
    localVote: state.localVote,
    privateTurn: bidder === null ? null : { player: bidder, maxBid: getMaxLegalBid(state.players[bidder]) },
  }
}
