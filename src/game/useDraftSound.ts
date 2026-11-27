import { useEffect, useRef, useState } from 'react'
import type { MatchState } from './types'

const notes = {
  reveal: [440, 587],
  outcome: [523, 659],
  finished: [523, 659, 784],
} as const

function playNotes(context: AudioContext, frequencies: readonly number[]) {
  const start = context.currentTime
  for (const [index, frequency] of frequencies.entries()) {
    const when = start + index * 0.085
    const tone = context.createOscillator()
    const level = context.createGain()
    tone.type = 'sine'
    tone.frequency.value = frequency
    tone.connect(level).connect(context.destination)
    level.gain.setValueAtTime(0, when)
    level.gain.linearRampToValueAtTime(0.065, when + 0.02)
    level.gain.exponentialRampToValueAtTime(0.001, when + 0.15)
    tone.start(when)
    tone.stop(when + 0.16)
  }
}

export function useDraftSound(match: Pick<MatchState, 'matchId' | 'deckIndex' | 'stage'> | null) {
  const available = typeof window.AudioContext === 'function'
  const [enabled, setEnabled] = useState(false)
  const context = useRef<AudioContext | null>(null)
  const lastCue = useRef<string | null>(null)
  const stage = match?.stage
  const cue = stage === 'reveal' || stage === 'outcome' || stage === 'finished' ? stage : null
  const cueKey = cue && match ? `${match.matchId}:${match.deckIndex}:${cue}` : null

  useEffect(() => {
    if (!cue || !cueKey || lastCue.current === cueKey) return
    lastCue.current = cueKey
    if (enabled && !document.hidden && context.current?.state === 'running') playNotes(context.current, notes[cue])
  }, [enabled, cue, cueKey])

  useEffect(() => () => {
    const audio = context.current
    context.current = null
    if (audio && audio.state !== 'closed') void audio.close().catch(() => undefined)
  }, [])

  function toggle() {
    if (!available) return
    if (enabled) {
      setEnabled(false)
      void context.current?.suspend().catch(() => undefined)
      return
    }
    try {
      const audio = context.current ?? new AudioContext()
      context.current = audio
      setEnabled(true)
      void audio.resume().catch(() => setEnabled(false))
    } catch {
      setEnabled(false)
    }
  }

  return { available, enabled, toggle }
}
