import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { MATCH_STORAGE_KEY } from './game/persistence'

describe('Local match UI and storage', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/setup')
  })

  it('keeps a locked bid out of the handoff and second bidder UI, including after reload', async () => {
    const user = userEvent.setup()
    const app = render(<App />)
    await user.click(screen.getByRole('radio', { name: 'Superpowers' }))
    await user.click(screen.getByRole('button', { name: 'Start Match' }))
    await user.click(screen.getByRole('button', { name: 'Begin Bidding' }))
    for (let i = 0; i < 5; i += 1) await user.click(screen.getByRole('button', { name: 'Increase bid' }))
    await user.click(screen.getByRole('button', { name: 'Lock in $5' }))

    expect(screen.getByRole('dialog', { name: 'Pass the device to Player 2' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { hidden: true })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('$5')
    expect(window.location.pathname).toBe('/match')
    expect(window.location.search).toBe('')

    app.unmount()
    render(<App />)
    const gate = screen.getByRole('dialog', { name: 'Resume match privately' })
    expect(document.body.textContent).not.toContain('$5')
    await user.click(within(gate).getByRole('button', { name: 'Resume privately' }))
    await user.click(screen.getByRole('button', { name: 'I’m ready' }))
    expect(screen.getByRole('slider')).toHaveValue('0')
    expect(document.body.textContent).not.toContain('$5')
    await user.click(screen.getByRole('button', { name: 'Pass' }))
    expect(screen.getByRole('heading', { name: 'Player 1 won this card' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Revealed bids' })).getByText('$5')).toBeInTheDocument()
  })

  it('requires confirmation to quit and recovers from a corrupt save', async () => {
    const user = userEvent.setup()
    localStorage.setItem(MATCH_STORAGE_KEY, '{broken')
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('could not be restored')
    await user.click(screen.getByRole('radio', { name: 'Gaming Setup' }))
    await user.click(screen.getByRole('button', { name: 'Start Match' }))
    await user.click(screen.getByRole('button', { name: 'Exit match' }))
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(window.location.pathname).toBe('/match')
    expect(localStorage.getItem(MATCH_STORAGE_KEY)).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Exit match' }))
    await user.click(screen.getByRole('button', { name: 'Quit Match' }))
    expect(window.location.pathname).toBe('/')
    expect(localStorage.getItem(MATCH_STORAGE_KEY)).toBeNull()
    expect(screen.getByRole('button', { name: 'Start Local Game' })).toBeInTheDocument()
  })

  it('covers an unfinished private bid when leaving the page', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('radio', { name: 'Dream Vacation' }))
    await user.click(screen.getByRole('button', { name: 'Start Match' }))
    await user.click(screen.getByRole('button', { name: 'Begin Bidding' }))
    await user.click(screen.getByRole('button', { name: 'Increase bid' }))
    expect(screen.getByRole('slider')).toHaveValue('1')

    fireEvent(window, new Event('pagehide'))
    const resume = screen.getByRole('dialog', { name: 'Resume match privately' })
    expect(screen.queryByRole('slider', { hidden: true })).not.toBeInTheDocument()
    await user.click(within(resume).getByRole('button', { name: 'Resume privately' }))
    expect(screen.getByRole('slider')).toHaveValue('0')
  })
})
