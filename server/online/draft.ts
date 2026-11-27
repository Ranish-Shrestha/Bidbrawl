import { randomInt } from 'node:crypto'
import { createDeck } from '../../src/game/deck'
import { gameReducer, initializeMatch } from '../../src/game/reducer'
import { getMaxLegalBid, resolveSealedRound, validateBid } from '../../src/game/rules'
import { getCurrentItemId, getCurrentOutcome, getDiscardCount, getRoundRef } from '../../src/game/selectors'
import type { Category, MatchState, PlayerId, RoundRef } from '../../src/game/types'

const ROUND_DURATION_MS = 15_000

export type OnlineDraft = Readonly<{
  match: MatchState
  revision: number
  deadlineAt: number | null
  sealedBids: Readonly<Partial<Record<PlayerId, number>>>
}>

type OnlineRoundRef = RoundRef & { revision: number }

type OnlineAction = OnlineRoundRef & (
  | { type: 'BID'; seat: PlayerId; amount: number }
  | { type: 'CHECK_DEADLINE' }
  | { type: 'NEXT' }
)

type DraftUpdate = {
  draft: OnlineDraft
  status: 'applied' | 'closed' | 'stale' | 'invalid_bid' | 'already_locked' | 'waiting'
}

type StartOptions = {
  matchId: string
  category: Category
  names: Record<PlayerId, string>
  now: number
}

export function createOnlineDraft({ matchId, category, names, now }: StartOptions): OnlineDraft | null {
  const upperBound = 2 ** 48 - 1
  const deck = createDeck(category, () => randomInt(upperBound) / upperBound)
  const match = deck ? initializeMatch(matchId, category.id, deck, names) : null
  return match ? { match, revision: 1, deadlineAt: now + ROUND_DURATION_MS, sealedBids: {} } : null
}

function settle(draft: OnlineDraft): OnlineDraft {
  const { match, sealedBids } = draft
  const p1 = getMaxLegalBid(match.players.p1) === null ? null : sealedBids.p1 ?? 0
  const p2 = getMaxLegalBid(match.players.p2) === null ? null : sealedBids.p2 ?? 0
  const resolved = resolveSealedRound(match, p1, p2)
  if (resolved === match) throw new Error('Authoritative online round could not be settled.')
  return { match: resolved, revision: draft.revision + 1, deadlineAt: null, sealedBids: {} }
}

/** The room service applies this transition inside its transaction with an authorized seat and a server timestamp. */
export function updateOnlineDraft(draft: OnlineDraft, action: OnlineAction, now: number): DraftUpdate {
  const { match, revision, deadlineAt, sealedBids } = draft
  const round = getRoundRef(match)
  if (action.matchId !== round.matchId || action.roundNumber !== round.roundNumber || action.revision !== revision) {
    return { draft, status: 'stale' }
  }

  if (action.type === 'NEXT') {
    if (match.stage !== 'outcome') return { draft, status: 'closed' }
    const next = gameReducer(match, { type: 'REVEAL_NEXT', ...round })
    if (!next || next === match) throw new Error('Authoritative online round could not advance.')
    return {
      draft: {
        match: next,
        revision: revision + 1,
        sealedBids: {},
        deadlineAt: next.stage === 'finished' ? null : now + ROUND_DURATION_MS,
      },
      status: 'applied',
    }
  }

  if (deadlineAt === null) return { draft, status: 'closed' }
  if (now >= deadlineAt) {
    return { draft: settle(draft), status: action.type === 'BID' ? 'closed' : 'applied' }
  }
  if (action.type === 'CHECK_DEADLINE') return { draft, status: 'waiting' }
  if (!validateBid(match.players[action.seat], action.amount)) return { draft, status: 'invalid_bid' }
  if (sealedBids[action.seat] !== undefined) return { draft, status: 'already_locked' }

  const next = { ...draft, sealedBids: { ...sealedBids, [action.seat]: action.amount } }
  const opponent = action.seat === 'p1' ? 'p2' : 'p1'
  const ready = next.sealedBids[opponent] !== undefined || getMaxLegalBid(match.players[opponent]) === null
  return { draft: ready ? settle(next) : next, status: 'applied' }
}

/** Public fields plus the caller’s own lock status. The HTTP layer must authenticate the seat before calling. */
export function getOnlineSnapshot(draft: OnlineDraft, viewer: PlayerId) {
  const { match, revision, deadlineAt, sealedBids } = draft
  const player = match.players[viewer]
  const stage = deadlineAt !== null ? 'bidding' : match.stage === 'finished' ? 'finished' : 'outcome'
  return {
    ...getRoundRef(match),
    revision,
    stage,
    categoryId: match.categoryId,
    deadlineAt,
    currentItemId: getCurrentItemId(match),
    currentOutcome: getCurrentOutcome(match),
    discardedCount: getDiscardCount(match),
    tiePriority: match.tiePriority,
    players: [match.players.p1, match.players.p2].map(({ id, name, budgetRemaining, roster }) => ({
      id,
      name,
      budgetRemaining,
      picks: roster.map(({ itemId, paid, roundNumber, acquisition }) => ({ itemId, paid, roundNumber, acquisition })),
    })),
    ownBid: deadlineAt === null ? null : {
      seat: viewer,
      max: getMaxLegalBid(player),
      locked: sealedBids[viewer] !== undefined,
    },
  }
}
