import { useLayoutEffect, useReducer, useState } from 'react'
import { loadMatch, saveMatch } from './persistence'
import { gameReducer } from './reducer'
import type { GameAction, MatchState } from './types'

type Session = {
  match: MatchState | null
  resume: (() => MatchState) | null
  invalidSave: boolean
  storageUnavailable: boolean
  changed: boolean
}

type Action = GameAction | { type: 'RESUME_PRIVATE' } | { type: 'CLEAR_PRIVATE' }

function browserStorage(): Storage | null {
  try { return window.localStorage } catch { return null }
}

function initialize(): Session {
  const storage = browserStorage()
  const saved = storage ? loadMatch(storage) : { kind: 'unavailable' as const }
  return {
    match: saved.kind === 'ready' ? saved.state : null,
    resume: saved.kind === 'private' ? saved.resume : null,
    invalidSave: saved.kind === 'invalid',
    storageUnavailable: saved.kind === 'unavailable',
    changed: false,
  }
}

function update(session: Session, action: Action): Session {
  if (action.type === 'RESUME_PRIVATE') {
    return session.resume ? { ...session, match: session.resume(), resume: null } : session
  }
  if (action.type === 'CLEAR_PRIVATE') {
    return session.resume ? { ...session, resume: null, changed: true } : session
  }
  if (session.resume) return session

  const match = gameReducer(session.match, action)
  return match === session.match ? session : { ...session, match, invalidSave: false, changed: true }
}

export function useLocalMatch() {
  const [session, dispatch] = useReducer(update, undefined, initialize)
  const [storageFailed, setStorageFailed] = useState(session.storageUnavailable)
  const { match, changed } = session

  useLayoutEffect(() => {
    if (!changed) return
    const storage = browserStorage()
    const saved = storage ? saveMatch(storage, match) : false
    queueMicrotask(() => setStorageFailed(!saved))
  }, [match, changed])

  return { ...session, dispatch, storageFailed }
}

export function newMatchIdentity() {
  const [seed, ...idParts] = crypto.getRandomValues(new Uint32Array(5))
  return { seed: seed!, matchId: idParts.map((part) => part.toString(16).padStart(8, '0')).join('') }
}
