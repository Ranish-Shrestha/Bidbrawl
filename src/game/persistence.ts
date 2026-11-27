import { parseMatchState } from './matchValidation'
import { isPrivateStage } from './selectors'
import { MATCH_SCHEMA_VERSION } from './types'
import type { Category, MatchState } from './types'

export const MATCH_STORAGE_KEY = `muted20draft:match:v${MATCH_SCHEMA_VERSION}`

export type SavedMatch =
  | { kind: 'empty' | 'invalid' | 'unavailable' }
  | { kind: 'ready'; state: MatchState }
  | { kind: 'private'; resume: () => MatchState }

export function saveMatch(storage: Pick<Storage, 'setItem' | 'removeItem'>, state: MatchState | null): boolean {
  try {
    if (state === null) storage.removeItem(MATCH_STORAGE_KEY)
    else storage.setItem(MATCH_STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function loadMatch(storage: Pick<Storage, 'getItem'>, catalog?: readonly Category[]): SavedMatch {
  let raw: string | null
  try {
    raw = storage.getItem(MATCH_STORAGE_KEY)
  } catch {
    return { kind: 'unavailable' }
  }

  if (raw === null) return { kind: 'empty' }

  let saved: unknown
  try {
    saved = JSON.parse(raw)
  } catch {
    return { kind: 'invalid' }
  }

  const result = parseMatchState(saved, catalog)
  if (!result.valid) return { kind: 'invalid' }
  const state = result.state
  return isPrivateStage(state.stage) ? { kind: 'private', resume: () => state } : { kind: 'ready', state }
}
