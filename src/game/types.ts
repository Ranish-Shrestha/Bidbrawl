export const STARTING_BUDGET = 20
export const ROSTER_SIZE = 5
export const DECK_SIZE = 12
export const MATCH_SCHEMA_VERSION = 1

export type PlayerId = 'p1' | 'p2'
export type LocalVote = PlayerId | 'tie'
export type GameStage = 'reveal' | 'bid-p1' | 'handoff' | 'bid-p2' | 'outcome' | 'finished'

export type Item = Readonly<{
  id: string
  title: string
  emoji: string
  active?: boolean
}>

export type Category = Readonly<{
  id: string
  title: string
  emoji: string
  description: string
  items: readonly Item[]
}>

export type RosterPick = Readonly<{
  itemId: string
  paid: number
  roundNumber: number
  acquisition: 'bid' | 'mandatory'
}>

export type PlayerState = Readonly<{
  id: PlayerId
  name: string
  budgetRemaining: number
  roster: readonly RosterPick[]
}>

type RevealedBids = Readonly<{
  itemId: string
  p1Bid: number | null
  p2Bid: number | null
}>

export type Outcome = RevealedBids & Readonly<
  | { kind: 'won'; winner: PlayerId; paid: number; tied: boolean }
  | { kind: 'discarded' }
  | { kind: 'mandatory'; winner: PlayerId; paid: 1 }
>

export type MatchState = Readonly<{
  schemaVersion: typeof MATCH_SCHEMA_VERSION
  matchId: string
  categoryId: string
  deck: readonly string[]
  deckIndex: number
  players: Readonly<Record<PlayerId, PlayerState>>
  stage: GameStage
  pendingP1Bid: number | null
  tiePriority: PlayerId
  forcedPriority: PlayerId
  outcomes: readonly Outcome[]
  localVote: LocalVote | null
}>

export type RoundRef = Readonly<{ matchId: string; roundNumber: number }>

export type GameAction =
  | { type: 'START_MATCH'; matchId: string; categoryId: string; seed: number; names?: Partial<Record<PlayerId, string>> }
  | { type: 'RESTART_SAME_CATEGORY'; matchId: string; newMatchId: string; seed: number }
  | { type: 'RESET_MATCH'; matchId: string }
  | { type: 'SET_LOCAL_VOTE'; matchId: string; vote: LocalVote }
  | (RoundRef & (
    | { type: 'BEGIN_BIDDING' | 'ACK_HANDOFF' | 'REVEAL_NEXT' }
    | { type: 'LOCK_P1_BID' | 'LOCK_P2_BID'; bid: number }
  ))
