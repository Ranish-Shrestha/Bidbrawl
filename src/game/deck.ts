import { getActiveItems, validateCategory } from '../data/validateCategories.js'
import { DECK_SIZE } from './types.js'
import type { Category } from './types.js'

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  // Mulberry32 produces a reproducible sequence of numbers in [0, 1).
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }
}

export function createDeck(category: Category, random: () => number): readonly string[] | null {
  if (validateCategory(category).length > 0) return null

  const deck = getActiveItems(category).map((item) => item.id)
  // The first 12 positions of a partial Fisher–Yates shuffle are the draw.
  for (let index = 0; index < DECK_SIZE; index += 1) {
    const value = random()
    if (!(value >= 0 && value < 1)) return null
    const swapIndex = index + Math.floor(value * (deck.length - index))
    const current = deck[index]!
    deck[index] = deck[swapIndex]!
    deck[swapIndex] = current
  }
  return deck.slice(0, DECK_SIZE)
}
