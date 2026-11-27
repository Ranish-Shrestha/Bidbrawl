import assert from 'node:assert/strict'
import { it } from 'vitest'
import { categories } from '../../data/categories'
import { createSeededRandom } from '../deck'
import { validateMatchState } from '../matchValidation'
import { getMaxLegalBid } from '../rules'
import type { MatchState, PlayerState } from '../types'
import { nextCard, playRound, startMatch } from './fixtures'

function checkInvariants(state: MatchState) {
  const players = Object.values(state.players)
  for (const player of players) {
    assert.ok(player.roster.length <= 5)
    assert.ok(Number.isInteger(player.budgetRemaining) && player.budgetRemaining >= 5 - player.roster.length)
    let spent = 0
    for (const pick of player.roster) {
      assert.ok(Number.isInteger(pick.paid) && pick.paid > 0)
      if (pick.acquisition === 'mandatory') assert.equal(pick.paid, 1)
      spent += pick.paid
    }
    assert.equal(spent + player.budgetRemaining, 20)
  }

  const acquired = players.flatMap(({ roster }) => roster.map(({ itemId }) => itemId))
  const discarded = state.outcomes.filter(({ kind }) => kind === 'discarded').map(({ itemId }) => itemId)
  const processed = new Set([...acquired, ...discarded])
  assert.ok(discarded.length <= 2)
  assert.equal(acquired.length + discarded.length, state.outcomes.length)
  assert.equal(processed.size, state.outcomes.length)
  assert.deepEqual(processed, new Set(state.deck.slice(0, state.outcomes.length)))
  assert.ok(state.deck.length - processed.size >= 10 - acquired.length)
  assert.equal(state.pendingP1Bid, null)
}

it('completes 1,000 seeded random legal matches with all invariants intact', () => {
  for (let seed = 0; seed < 1_000; seed += 1) {
    const random = createSeededRandom(seed ^ 0x5190fa2e)
    const categoryId = categories[seed % categories.length]!.id
    const passChance = (seed % 9) / 10
    const bid = (player: PlayerState) => {
      const max = getMaxLegalBid(player)
      if (max === null) return null
      return random() < passChance ? 0 : 1 + Math.floor(random() * max)
    }

    try {
      let state = startMatch({ seed, categoryId })
      checkInvariants(state)
      for (let round = 0; round < 12 && state.stage !== 'finished'; round += 1) {
        state = playRound(state, bid(state.players.p1), bid(state.players.p2))
        checkInvariants(state)
        state = nextCard(state)
      }
      assert.equal(state.stage, 'finished')
      assert.equal(state.players.p1.roster.length, 5)
      assert.equal(state.players.p2.roster.length, 5)
      assert.deepEqual(validateMatchState(state), [])
    } catch (error) {
      throw new Error(`Simulation failed with seed ${seed} in ${categoryId}.`, { cause: error })
    }
  }
}, 15_000)
