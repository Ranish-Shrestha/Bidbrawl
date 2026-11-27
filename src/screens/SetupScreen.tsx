import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, Check, Coins, Layers, Play, UserRound } from 'lucide-react'
import { ScreenHeading } from '../components/ScreenHeading'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { categories } from '../data/categories'
import { normalizePlayerName } from '../game/names'
import { DECK_SIZE, ROSTER_SIZE, STARTING_BUDGET } from '../game/types'
import type { PlayerId } from '../game/types'

const tones = ['violet', 'cyan', 'gold', 'danger', 'raised', 'success', 'danger', 'cyan']
const players = [
  { id: 'p1', label: 'Player 1' },
  { id: 'p2', label: 'Player 2' },
] as const

function nameError(value: string) {
  const normalized = normalizePlayerName(value)
  if (!normalized) return 'Enter a display name using visible characters.'
  if (normalized !== value.trim().normalize('NFC')) return 'Use up to 20 characters.'
  return null
}

type SetupProps = {
  onBack: () => void
  onStart: (categoryId: string, names: Record<PlayerId, string>) => void
  error: string | null
  mode?: 'secret' | 'live'
}

export function SetupScreen({ onBack, onStart, error, mode = 'secret' }: SetupProps) {
  const [categoryId, setCategory] = useState('')
  const [names, setNames] = useState({ p1: 'Player 1', p2: 'Player 2' })
  const errors = { p1: nameError(names.p1), p2: nameError(names.p2) }
  const canStart = Boolean(categoryId && !errors.p1 && !errors.p2)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canStart) onStart(categoryId, names)
  }

  return (
    <section className="game-page setup-page" aria-labelledby="setup-title">
      <div className="game-toolbar">
        <Button variant="quiet" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" /> Back</Button>
        <span className="mode-label"><span aria-hidden="true" /> {mode === 'live' ? 'Local Live Auction' : 'Local Secret Bid'}</span>
      </div>
      <div className="game-intro">
        <ScreenHeading id="setup-title">Choose a category.</ScreenHeading>
        <p>{mode === 'live' ? 'Pick a theme, then take turns raising or passing with both players watching.'
          : 'Pick the theme for your draft, then pass one device between two players.'}</p>
      </div>
      <nav className="mode-choice" aria-label="Local game mode">
        <a className="button button--secondary" href="/setup" aria-current={mode === 'secret' ? 'page' : undefined}
          onClick={(event) => { if (mode === 'secret') event.preventDefault() }}>Secret Bid</a>
        <a className="button button--secondary" href="/live" aria-current={mode === 'live' ? 'page' : undefined}
          onClick={(event) => { if (mode === 'live') event.preventDefault() }}>Live Auction</a>
      </nav>
      <form className="setup-form" onSubmit={submit}>
        <fieldset className="category-grid">
          <legend className="sr-only">Category</legend>
          {categories.map((category, index) => (
            <label key={category.id} className={`category-option tone-${tones[index]}`}>
              <input className="sr-only" type="radio" name="category" value={category.id}
                checked={categoryId === category.id} onChange={() => setCategory(category.id)}
                aria-labelledby={`label-${category.id}`} aria-describedby={`description-${category.id}`} />
              <span className="category-option__emoji" aria-hidden="true">{category.emoji}</span>
              <span className="category-option__check" aria-hidden="true"><Check size={16} /></span>
              <strong id={`label-${category.id}`}>{category.title}</strong>
              <span id={`description-${category.id}`} className="category-option__description">{category.description}</span>
            </label>
          ))}
        </fieldset>
        <Card className="setup-players">
          <h2><UserRound size={20} aria-hidden="true" /> Players</h2>
          <div className="setup-players__fields">
            {players.map(({ id, label }) => (
              <div key={id} className="setup-field">
                <label htmlFor={`name-${id}`}>{label}</label>
                <input id={`name-${id}`} name={id} value={names[id]} autoComplete="off" enterKeyHint="done"
                  aria-invalid={Boolean(errors[id])} aria-describedby={errors[id] ? `error-${id}` : undefined}
                  onChange={(event) => setNames({ ...names, [id]: event.target.value })} />
                {errors[id] && <p id={`error-${id}`} className="field-error">{errors[id]}</p>}
              </div>
            ))}
          </div>
        </Card>
        <div className="setup-submit">
          <p><Layers size={17} aria-hidden="true" /> {DECK_SIZE} cards · {ROSTER_SIZE} picks each <Coins size={17} aria-hidden="true" /> ${STARTING_BUDGET} each</p>
          {error && <p className="field-error" role="alert">{error}</p>}
          <Button type="submit" disabled={!canStart}><Play size={17} fill="currentColor" aria-hidden="true" /> Start Match</Button>
        </div>
      </form>
    </section>
  )
}
