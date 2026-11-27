import { describe, expect, it } from 'vitest'
import { categories } from '../../data/categories'
import { createSeededRandom } from '../deck'
import { getLiveItemId, getRaiseRange, reduceLiveAuction, startLiveAuction } from '../liveAuction'
import type { LiveAuction, LiveCommand } from '../liveAuction'
import { getLiveReplay } from '../liveReplay'
import { decodeLiveAuction, encodeLiveAuction } from '../liveStorage'

const category = categories[0]!

function start(seed = 32) {
  return startLiveAuction(category, 'live-test', seed, { p1: 'Alex', p2: 'Sam' })!
}

function act(state: LiveAuction, command: LiveCommand) {
  return reduceLiveAuction(state, { ...command, matchId: state.matchId, revision: state.history.length })
}

describe('Live Auction rules', () => {
  it('reveals manually, opens at $1, and charges the final visible leader exactly once', () => {
    const initial = start()
    expect(getLiveItemId(initial)).toBeNull()
    expect(act(initial, { type: 'RAISE', amount: 1 })).toBe(initial)
    const revealed = act(initial, { type: 'REVEAL' })
    expect(getLiveItemId(revealed)).toBe(initial.deck[0])
    expect(revealed.turn?.player).toBe('p1')
    expect(getRaiseRange(revealed)).toEqual({ min: 1, max: 1 })
    expect(act(revealed, { type: 'RAISE', amount: 2 })).toBe(revealed)
    const opened = act(revealed, { type: 'RAISE', amount: 1 })
    expect(opened.turn).toMatchObject({ player: 'p2', offer: { player: 'p1', amount: 1 } })
    for (const amount of [1, 2.5, 17, Number.NaN]) expect(act(opened, { type: 'RAISE', amount })).toBe(opened)
    const raised = act(opened, { type: 'RAISE', amount: 16 })
    expect(raised.players.p2.budgetRemaining).toBe(20)
    expect(getRaiseRange(raised)).toBeNull()
    const pass = { type: 'PASS', matchId: initial.matchId, revision: raised.history.length } as const
    const result = reduceLiveAuction(raised, pass)
    expect(result.outcomes).toEqual([{ itemId: initial.deck[0], kind: 'won', winner: 'p2', paid: 16 }])
    expect(result.players.p2.budgetRemaining).toBe(4)
    expect(reduceLiveAuction(result, pass)).toBe(result)
    const next = act(result, { type: 'NEXT' })
    expect(getLiveItemId(next)).toBeNull()
    expect(act(next, { type: 'REVEAL' }).turn?.player).toBe('p2')
  })

  it('allows a $1 purchase after the opener passes and skips full rosters', () => {
    let state = start()
    for (let round = 1; round <= 5; round++) {
      state = act(state, { type: 'REVEAL' })
      if (state.turn?.player === 'p2') state = act(state, { type: 'PASS' })
      state = act(state, { type: 'RAISE', amount: 1 })
      if (state.turn) state = act(state, { type: 'PASS' })
      expect(state.outcomes.at(-1)).toMatchObject({ kind: 'won', winner: 'p1', paid: 1 })
      state = act(state, { type: 'NEXT' })
    }
    expect(state.players.p1.roster).toHaveLength(5)
    state = act(state, { type: 'REVEAL' })
    expect(state.turn).toMatchObject({ player: 'p2', opponentPassed: true })
    expect(act(state, { type: 'RAISE', amount: 1 }).stage).toBe('outcome')
  })

  it('allows only two no-offer discards and uses the protected $1 assignment afterward', () => {
    let state = start()
    for (let round = 1; round <= 12; round++) {
      state = act(act(state, { type: 'REVEAL' }), { type: 'PASS' })
      if (state.turn) state = act(state, { type: 'PASS' })
      const result = state.outcomes.at(-1)
      expect(result?.kind).toBe(round <= 2 ? 'discarded' : 'mandatory')
      if (round === 3) expect(result).toMatchObject({ winner: 'p1', paid: 1 })
      if (round === 5) expect(result).toMatchObject({ winner: 'p2', paid: 1 })
      state = act(state, { type: 'NEXT' })
    }
    expect(state.stage).toBe('finished')
    expect([state.players.p1.budgetRemaining, state.players.p2.budgetRemaining]).toEqual([15, 15])
  })

  it('restores an offer from valid commands and rejects tampered history', () => {
    const state = act(act(start(), { type: 'REVEAL' }), { type: 'RAISE', amount: 1 })
    const saved = encodeLiveAuction(state)
    expect(decodeLiveAuction(saved)).toEqual(state)
    expect(decodeLiveAuction(saved.replace('"amount":1', '"amount":19'))).toBeNull()
    expect(decodeLiveAuction(saved.replace('"version":1', '"version":2'))).toBeNull()
    expect(getLiveReplay(state, category)).toBeNull()
  })

  it('produces replay metadata without unrevealed cards and redraws on rematch', () => {
    const initial = start()
    let state = initial
    for (let round = 1; round <= 10; round++) {
      state = act(act(state, { type: 'REVEAL' }), { type: 'RAISE', amount: 1 })
      if (state.turn) state = act(state, { type: 'PASS' })
      state = act(state, { type: 'NEXT' })
    }
    const voted = reduceLiveAuction(state, { type: 'VOTE', vote: 'tie', matchId: state.matchId, revision: state.history.length })
    const replay = getLiveReplay(voted, category)!
    expect(replay.rounds).toHaveLength(10)
    expect(replay.rounds[0]?.actions).toContainEqual({ type: 'RAISE', player: 'p1', amount: 1 })
    expect(JSON.stringify(replay)).not.toContain('"vote"')
    for (const future of initial.deck.slice(10)) expect(JSON.stringify(replay)).not.toContain(future)
    expect(decodeLiveAuction(encodeLiveAuction(voted))?.vote).toBe('tie')
    expect(startLiveAuction(category, 'rematch', 32, { p1: 'Alex', p2: 'Sam' }, initial.deck)?.deck).not.toEqual(initial.deck)
  })

  it('finishes 1,000 simulated drafts within both budget and roster limits', () => {
    for (let seed = 0; seed < 1_000; seed++) {
      const random = createSeededRandom(seed + 40)
      let state = start(seed)
      while (state.stage !== 'finished') {
        if (state.history.length > 250) throw new Error(`Draft exceeded action bound for seed ${seed}`)
        if (state.stage === 'reveal') state = act(state, { type: 'REVEAL' })
        else if (state.stage === 'outcome') {
          const [p1, p2] = [state.players.p1, state.players.p2]
          for (const player of [p1, p2]) {
            if (player.roster.length > 5 || player.budgetRemaining < 5 - player.roster.length ||
              player.roster.reduce((total, pick) => total + pick.paid, player.budgetRemaining) !== 20) {
              throw new Error(`Budget or roster invariant failed for seed ${seed}`)
            }
          }
          state = act(state, { type: 'NEXT' })
        } else {
          const range = getRaiseRange(state)
          state = act(state, range && random() >= (seed % 10) / 10
            ? { type: 'RAISE', amount: range.min + Math.floor(random() * (range.max - range.min + 1)) }
            : { type: 'PASS' })
        }
      }
      expect([state.players.p1.roster.length, state.players.p2.roster.length]).toEqual([5, 5])
      expect(new Set(state.outcomes.map(({ itemId }) => itemId)).size).toBe(state.outcomes.length)
      expect(state.outcomes.length).toBeLessThanOrEqual(12)
    }
  }, 15_000)
})
