import { categories } from '../data/categories'
import { initializeLiveAuction, reduceLiveAuction } from './liveAuction'
import type { LiveAuction, LiveCommand } from './liveAuction'
import { DECK_SIZE, STARTING_BUDGET } from './types'

export const LIVE_STORAGE_KEY = 'muted20draft:live:v1'
const maxCommands = DECK_SIZE * (STARTING_BUDGET + 3)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readCommand(value: unknown): LiveCommand | null {
  if (!isRecord(value)) return null
  if (value.type === 'REVEAL' || value.type === 'PASS' || value.type === 'NEXT') return { type: value.type }
  return value.type === 'RAISE' && typeof value.amount === 'number' ? { type: 'RAISE', amount: value.amount } : null
}

export function decodeLiveAuction(text: string): LiveAuction | null {
  let value: unknown
  try { value = JSON.parse(text) } catch { return null }
  if (!isRecord(value) || value.version !== 1 || typeof value.matchId !== 'string' || !isRecord(value.names) ||
      typeof value.names.p1 !== 'string' || typeof value.names.p2 !== 'string' || !Array.isArray(value.deck) ||
      !value.deck.every((item): item is string => typeof item === 'string') || !Array.isArray(value.commands) ||
      value.commands.length > maxCommands) return null

  const category = categories.find(({ id }) => id === value.categoryId)
  if (!category) return null
  let state = initializeLiveAuction(category, value.matchId, value.deck, { p1: value.names.p1, p2: value.names.p2 })
  if (!state) return null
  for (const entry of value.commands as readonly unknown[]) {
    const command = readCommand(entry)
    if (!command) return null
    const next: LiveAuction = reduceLiveAuction(state, { ...command, matchId: state.matchId, revision: state.history.length })
    if (next === state) return null
    state = next
  }
  if (value.vote === null) return state
  if (state.stage !== 'finished' || (value.vote !== 'p1' && value.vote !== 'p2' && value.vote !== 'tie')) return null
  return { ...state, vote: value.vote }
}

export function encodeLiveAuction(state: LiveAuction): string {
  return JSON.stringify({ version: 1, matchId: state.matchId, categoryId: state.categoryId, deck: state.deck,
    names: { p1: state.players.p1.name, p2: state.players.p2.name }, commands: state.history.map(({ command }) => command), vote: state.vote })
}

export function loadLiveAuction(): { state: LiveAuction | null; status: 'ok' | 'invalid' | 'unavailable' } {
  try {
    const raw = window.localStorage.getItem(LIVE_STORAGE_KEY)
    if (raw === null) return { state: null, status: 'ok' }
    const state = decodeLiveAuction(raw)
    return { state, status: state ? 'ok' : 'invalid' }
  } catch { return { state: null, status: 'unavailable' } }
}

export function saveLiveAuction(state: LiveAuction | null): boolean {
  try {
    if (state) window.localStorage.setItem(LIVE_STORAGE_KEY, encodeLiveAuction(state))
    else window.localStorage.removeItem(LIVE_STORAGE_KEY)
    return true
  } catch { return false }
}
