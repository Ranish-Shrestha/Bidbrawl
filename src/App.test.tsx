import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'

describe('Home and local draft navigation', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/')
  })
  it('shows the match essentials and opens How to Play from the hero', async () => {
    const user = userEvent.setup()
    render(<App />)

    const main = within(screen.getByRole('main'))
    expect(main.getByRole('heading', { name: 'Build your dream lineup.' })).toBeInTheDocument()
    expect(main.getByRole('list', { name: 'Match essentials' })).toHaveTextContent('$20 budget')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(main.getByRole('button', { name: 'How to Play' }))
    const rules = within(screen.getByRole('dialog', { name: 'How to Play' }))
    expect(rules.getByRole('heading', { name: 'How to Play' })).toHaveFocus()
    expect(rules.getAllByRole('listitem')).toHaveLength(3)

    const summary = rules.getByText('Detailed rules')
    const details = summary.closest('details')
    expect(details).not.toHaveAttribute('open')
    await user.click(summary)
    expect(details).toHaveAttribute('open')
    expect(rules.getByText(/opening limit is \$16/)).toBeInTheDocument()
    expect(rules.getByText(/the player with more open slots gets it for \$1/)).toBeInTheDocument()

    await user.click(rules.getByRole('button', { name: 'Close dialog' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('responds to native cancellation when rules were opened from the header', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'How to Play' }))
    fireEvent(screen.getByRole('dialog', { name: 'How to Play' }), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('validates setup and enters a real local match', async () => {
    const user = userEvent.setup()
    render(<App />)

    const start = screen.getByRole('button', { name: 'Start Local Game' })
    await user.click(start)
    expect(window.location.pathname).toBe('/setup')
    expect(screen.getByRole('heading', { name: 'Choose a category.' })).toHaveFocus()
    const startMatch = screen.getByRole('button', { name: 'Start Match' })
    expect(startMatch).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: 'Dream Vacation' }))
    const player1 = screen.getByRole('textbox', { name: 'Player 1' })
    await user.clear(player1)
    expect(startMatch).toBeDisabled()
    await user.type(player1, 'Alex')
    await user.click(startMatch)
    expect(window.location.pathname).toBe('/match')
    expect(screen.getByText('Card 1 / 12')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Secret Bid match' })).getAllByText('$20')).toHaveLength(2)
  })
})
