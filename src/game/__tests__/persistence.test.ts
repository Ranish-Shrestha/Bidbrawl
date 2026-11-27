import { beforeEach, describe, expect, it } from 'vitest'
import { validateMatchState } from '../matchValidation'
import { loadMatch, MATCH_STORAGE_KEY, saveMatch } from '../persistence'
import { gameReducer } from '../reducer'
import { getMatchView } from '../selectors'
import type { MatchState } from '../types'
import { act, nextCard, playRound, startMatch } from './fixtures'

describe('Versioned local match storage', () => {
  beforeEach(() => localStorage.clear())

  it('restores a reveal or outcome and can clear a saved match', () => {
    expect(loadMatch(localStorage)).toEqual({ kind: 'empty' })
    const start = startMatch()
    const outcome = playRound(start, 2, 5)
    for (const state of [start, outcome, nextCard(outcome)]) {
      expect(saveMatch(localStorage, state)).toBe(true)
      expect(loadMatch(localStorage)).toEqual({ kind: 'ready', state })
    }
    expect(saveMatch(localStorage, null)).toBe(true)
    expect(loadMatch(localStorage)).toEqual({ kind: 'empty' })
  })

  it('requires a private resume from either bid turn or handoff', () => {
    const p1 = act(startMatch(), { type: 'BEGIN_BIDDING' })
    const handoff = act(p1, { type: 'LOCK_P1_BID', bid: 13 })
    const p2 = act(handoff, { type: 'ACK_HANDOFF' })
    for (const state of [p1, handoff, p2]) {
      expect(saveMatch(localStorage, state)).toBe(true)
      const restored = loadMatch(localStorage)
      expect(restored.kind).toBe('private')
      expect(JSON.stringify(restored)).toBe('{"kind":"private"}')
      if (restored.kind !== 'private') throw new Error('Expected an opaque resume gate.')
      const resumed = restored.resume()
      expect(resumed).toEqual(state)
      expect(getMatchView(resumed)).not.toHaveProperty('pendingP1Bid')
      expect(getMatchView(resumed).currentOutcome).toBeNull()
      if (resumed.stage === 'handoff') {
        const continued = act(resumed, { type: 'ACK_HANDOFF' })
        const revealed = act(continued, { type: 'LOCK_P2_BID', bid: 3 })
        expect(getMatchView(revealed).currentOutcome).toMatchObject({ p1Bid: 13, p2Bid: 3, winner: 'p1' })
      }
    }
  })

  it('rejects malformed, stale, or internally inconsistent snapshots', () => {
    const state = playRound(startMatch(), 5, 5)
    const outcome = state.outcomes[0]!
    const invalid: unknown[] = [
      null,
      { ...state, schemaVersion: 0 },
      { ...state, categoryId: '__proto__' },
      { ...state, deck: Array(12).fill(state.deck[0]) },
      { ...state, deck: ['unknown-item', ...state.deck.slice(1)] },
      { ...state, deckIndex: 7 },
      { ...state, localVote: 'p2' },
      { ...state, tiePriority: 'p1' },
      { ...state, forcedPriority: 'p2' },
      { ...state, stage: 'finished' },
      { ...state, stage: 'handoff', pendingP1Bid: 100 },
      { ...state, pendingP1Bid: 5 },
      { ...state, players: { ...state.players, p1: { ...state.players.p1, budgetRemaining: 20 } } },
      { ...state, players: { ...state.players, p2: { ...state.players.p2, roster: state.players.p1.roster } } },
      { ...state, outcomes: [{ ...outcome, paid: 10 }] },
      { ...state, outcomes: [{ ...outcome, kind: 'discarded' }] },
      { ...state, outcomes: [{ ...outcome, p1Bid: 17 }] },
      { ...state, outcomes: [outcome, outcome] },
    ]
    localStorage.setItem(MATCH_STORAGE_KEY, '{not json')
    expect(loadMatch(localStorage)).toEqual({ kind: 'invalid' })
    for (const value of invalid) {
      expect(validateMatchState(value).length).toBeGreaterThan(0)
      localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(value))
      expect(loadMatch(localStorage)).toEqual({ kind: 'invalid' })
    }
    expect(saveMatch(localStorage, startMatch())).toBe(true)
    expect(loadMatch(localStorage).kind).toBe('ready')
  })

  it('handles inaccessible storage without blocking play', () => {
    function blocked(): never { throw new Error('Storage unavailable') }
    expect(saveMatch({ setItem: blocked, removeItem: blocked }, startMatch())).toBe(false)
    expect(saveMatch({ setItem: blocked, removeItem: blocked }, null)).toBe(false)
    expect(loadMatch({ getItem: blocked })).toEqual({ kind: 'unavailable' })
  })

  it('recognizes a finished all-pass match with mandatory assignments', () => {
    let state: MatchState = startMatch()
    while (state.stage !== 'finished') {
      state = nextCard(playRound(state, 0, 0))
    }
    expect(state.outcomes).toHaveLength(12)
    expect(state.forcedPriority).toBe('p2')
    const voted = gameReducer(state, { type: 'SET_LOCAL_VOTE', matchId: state.matchId, vote: 'p2' })!
    expect(validateMatchState(voted)).toEqual([])
    saveMatch(localStorage, voted)
    expect(loadMatch(localStorage)).toEqual({ kind: 'ready', state: voted })
    const rematch = gameReducer(voted, {
      type: 'RESTART_SAME_CATEGORY', matchId: state.matchId, newMatchId: 'all-pass-rematch', seed: 4,
    })
    expect(rematch).toMatchObject({ forcedPriority: 'p1', outcomes: [], localVote: null })
  })
})
