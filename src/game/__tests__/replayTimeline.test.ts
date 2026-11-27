import { describe, expect, it } from 'vitest'
import { categories } from '../../data/categories'
import { reduceLiveAuction, startLiveAuction } from '../liveAuction'
import type { LiveCommand } from '../liveAuction'
import { getLiveReplay } from '../liveReplay'
import { buildReplayTimeline } from '../replayTimeline'

function completedReplay() {
  const category = categories[0]!
  let draft = startLiveAuction(category, 'timeline', 42, { p1: 'Alex', p2: 'Sam' })!
  const act = (command: LiveCommand) => {
    draft = reduceLiveAuction(draft, { ...command, matchId: draft.matchId, revision: draft.history.length })
  }
  for (let round = 1; round <= 10; round++) {
    act({ type: 'REVEAL' })
    act({ type: 'RAISE', amount: 1 })
    if (draft.turn) act({ type: 'PASS' })
    act({ type: 'NEXT' })
  }
  return { replay: getLiveReplay(draft, category)!, draft }
}

describe('replay import', () => {
  it('reconstructs each public event and the final budgets without future cards', () => {
    const { replay, draft } = completedReplay()
    const timeline = buildReplayTimeline(replay)!
    expect(timeline.category).toBe(replay.showdown.categoryTitle)
    expect(timeline.scenes.slice(0, 4).map(({ kind, message }) => [kind, message])).toEqual([
      ['reveal', 'Alex opens'], ['raise', 'Alex offers $1'], ['pass', 'Sam passes'], ['outcome', 'Alex wins for $1'],
    ])
    expect(timeline.scenes[1]?.players[0]?.budget).toBe(20)
    expect(timeline.scenes[3]?.players[0]).toMatchObject({ budget: 19, picks: 1 })
    expect(timeline.scenes.at(-1)).toMatchObject({ kind: 'final', players: [{ budget: 15, picks: 5 }, { budget: 15, picks: 5 }] })
    for (const item of draft.deck.slice(10)) expect(JSON.stringify(timeline)).not.toContain(item)
  })

  it('rejects incomplete, contradictory, duplicated and out-of-turn replays', () => {
    const { replay } = completedReplay()
    const [first, ...rest] = replay.rounds
    const setFirst = (round: object) => ({ ...replay, rounds: [round, ...rest] })
    expect(buildReplayTimeline({ ...replay, version: 3 })).toBeNull()
    expect(buildReplayTimeline({ ...replay, rounds: rest })).toBeNull()
    expect(buildReplayTimeline(setFirst({ ...first, outcome: { ...first?.outcome, itemId: rest[0]?.outcome.itemId } }))).toBeNull()
    expect(buildReplayTimeline(setFirst({ ...first, outcome: { ...first?.outcome, paid: 9 } }))).toBeNull()
    expect(buildReplayTimeline(setFirst({ ...first, actions: [{ type: 'REVEAL' }, { type: 'RAISE', player: 'p2', amount: 1 }] }))).toBeNull()
    expect(buildReplayTimeline(setFirst({ ...first, actions: [{ type: 'REVEAL' }, { type: 'RAISE', player: 'p1', amount: 16 }] }))).toBeNull()
  })
})
