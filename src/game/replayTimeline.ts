import { categories } from '../data/categories'
import { getActiveItems } from '../data/validateCategories'
import { initializeLiveAuction, reduceLiveAuction } from './liveAuction'
import type { LiveAuction, LiveCommand, LiveOutcome } from './liveAuction'
import { DECK_SIZE, ROSTER_SIZE, STARTING_BUDGET } from './types'
import type { Item, PlayerId } from './types'

export const MAX_REPLAY_BYTES = 256 * 1024

export type ReplayScene = {
  round: number | null
  kind: 'reveal' | 'raise' | 'pass' | 'outcome' | 'final'
  item: Pick<Item, 'title' | 'emoji'> | null
  message: string
  players: readonly { id: PlayerId; name: string; budget: number; picks: number }[]
}

export type ReplayTimeline = { category: string; scenes: readonly ReplayScene[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function commandFrom(value: unknown): LiveCommand | null {
  if (!isRecord(value)) return null
  if (value.type === 'REVEAL' || value.type === 'PASS') return { type: value.type }
  return value.type === 'RAISE' && typeof value.amount === 'number' ? { type: 'RAISE', amount: value.amount } : null
}

function matchesOutcome(value: unknown, expected: LiveOutcome): boolean {
  if (!isRecord(value) || value.kind !== expected.kind || value.itemId !== expected.itemId) return false
  return expected.kind === 'discarded' || (value.winner === expected.winner && value.paid === expected.paid)
}

function scene(state: LiveAuction, round: number | null, kind: ReplayScene['kind'], item: ReplayScene['item'], message: string): ReplayScene {
  return {
    round, kind, item, message,
    players: Object.values(state.players).map((player) => ({
      id: player.id, name: player.name, budget: player.budgetRemaining, picks: player.roster.length,
    })),
  }
}

function apply(state: LiveAuction, command: LiveCommand) {
  return reduceLiveAuction(state, { ...command, matchId: state.matchId, revision: state.history.length })
}

export function buildReplayTimeline(input: unknown): ReplayTimeline | null {
  if (!isRecord(input) || input.version !== 1 || input.mode !== 'live-auction' || !isRecord(input.showdown) ||
      !Array.isArray(input.rounds) || input.rounds.length < ROSTER_SIZE * 2 || input.rounds.length > DECK_SIZE) return null
  const rounds: readonly unknown[] = input.rounds
  const { categoryTitle, players } = input.showdown
  const category = categories.find(({ title }) => title === categoryTitle)
  if (!category || !Array.isArray(players) || players.length !== 2) return null
  const [first, second]: readonly unknown[] = players
  if (!isRecord(first) || first.id !== 'p1' || typeof first.name !== 'string' ||
      !isRecord(second) || second.id !== 'p2' || typeof second.name !== 'string') return null

  const items = getActiveItems(category)
  const byId = new Map(items.map((item) => [item.id, item]))
  const revealed: string[] = []
  for (const round of rounds) {
    if (!isRecord(round) || !isRecord(round.outcome) || typeof round.outcome.itemId !== 'string' ||
        !byId.has(round.outcome.itemId) || revealed.includes(round.outcome.itemId)) return null
    revealed.push(round.outcome.itemId)
  }
  // The rules need the original card count for no-offer settlement. These unused
  // IDs only fill the simulation deck and never appear in the timeline.
  const deck = [...revealed, ...items.map(({ id }) => id).filter((id) => !revealed.includes(id))].slice(0, DECK_SIZE)
  let state = initializeLiveAuction(category, 'replay-view', deck, { p1: first.name, p2: second.name })
  if (!state) return null

  const scenes: ReplayScene[] = []
  for (const [index, round] of rounds.entries()) {
    const number = index + 1
    const { actions, outcome, itemTitle, number: suppliedNumber } = round as Record<string, unknown>
    const item = byId.get(revealed[index]!)!
    if (state.stage !== 'reveal' || suppliedNumber !== number || itemTitle !== item.title ||
        !Array.isArray(actions) || actions.length < 2 || actions.length > STARTING_BUDGET + 2) return null

    for (const entry of actions as readonly unknown[]) {
      const command = commandFrom(entry)
      if (!command || !isRecord(entry)) return null
      const actor = state.turn?.player
      if (entry.player !== actor) return null
      const next = apply(state, command)
      if (next === state) return null
      if (command.type === 'REVEAL') {
        scenes.push(scene(next, number, 'reveal', item, `${next.players[next.turn!.player].name} opens`))
      } else if (actor) {
        const name = state.players[actor].name
        const message = command.type === 'RAISE' ? `${name} offers $${command.amount}` : `${name} passes`
        scenes.push(scene(state, number, command.type === 'RAISE' ? 'raise' : 'pass', item, message))
      }
      state = next
    }

    const settled = state.outcomes[index]
    if (state.stage !== 'outcome' || !settled || !matchesOutcome(outcome, settled)) return null
    const message = settled.kind === 'discarded' ? 'Card discarded'
      : settled.kind === 'mandatory' ? `${state.players[settled.winner].name} assigned for $1`
      : `${state.players[settled.winner].name} wins for $${settled.paid}`
    scenes.push(scene(state, number, 'outcome', item, message))
    state = apply(state, { type: 'NEXT' })
  }
  if (state.stage !== 'finished') return null
  scenes.push(scene(state, null, 'final', null, 'Who built the better lineup?'))
  return { category: category.title, scenes }
}
