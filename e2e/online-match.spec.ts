import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function lock(page: Page, amount: number) {
  if (amount === 0) { await button(page, 'Pass').click(); return }
  const slider = page.getByRole('slider', { name: 'Bid amount' })
  for (let i = 0; i < amount; i++) await slider.press('ArrowRight')
  await button(page, `Lock in $${amount}`).click()
}

test('two independent sessions draft, reconnect, compare lineups and vote online', async ({ browser, baseURL }) => {
  test.setTimeout(90_000)
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext({ baseURL: baseURL! }),
    browser.newContext({ baseURL: baseURL!, viewport: { width: 320, height: 760 }, reducedMotion: 'reduce' }),
  ])
  try {
    const [host, guest] = await Promise.all([hostContext.newPage(), guestContext.newPage()])
    await host.goto('/')
    await host.getByRole('link', { name: 'Play Online' }).click()
    await host.getByRole('textbox', { name: 'Your display name' }).fill('Alex')
    await button(host, 'Create Room').click()
    await expect(button(host, 'Start Match')).toBeDisabled()
    const invite = await host.getByRole('textbox', { name: 'Invite link' }).inputValue()
    expect(invite).toContain('#invite=')

    await guest.goto(invite)
    await expect(guest.getByRole('heading', { name: 'Join private room' })).toBeVisible()
    expect(new URL(guest.url()).hash).toBe('')
    await guest.reload()
    await expect(guest.getByRole('heading', { name: 'Join private room' })).toBeVisible()
    expect(new URL(guest.url()).hash).toBe('')
    await guest.getByRole('textbox', { name: 'Your display name' }).fill('Sam')
    await button(guest, 'Join Room').click()
    await expect(guest.getByText('Waiting for the host to start.')).toBeVisible()
    expect(await guest.evaluate(() => history.state === null)).toBe(true)
    await button(host, 'Start Match').click()
    await expect(guest.getByRole('slider')).toBeVisible()

    await lock(host, 5)
    await expect(host.getByText('Your bid is locked. Waiting for the round to resolve.')).toBeVisible()
    await expect(guest.locator('main')).not.toContainText('$5')
    await guest.reload()
    await expect(guest.getByRole('slider')).toHaveValue('0')
    await expect(guest.locator('main')).not.toContainText('$5')
    await lock(guest, 3)
    await expect(host.getByRole('heading', { name: 'Alex won this card' })).toBeVisible({ timeout: 8_000 })
    await expect(guest.getByRole('group', { name: 'Revealed bids' })).toContainText('$5')
    await expect(guest.getByRole('group', { name: 'Revealed bids' })).toContainText('$3')

    for (let round = 2; round <= 10; round++) {
      const advancing = round <= 5 ? host : guest
      await button(advancing, 'Next Mystery Card').click({ timeout: 8_000 })
      if (round <= 5) await Promise.all([lock(host, 1), lock(guest, 0)])
      else await lock(guest, 1)
    }
    await button(guest, 'View Final Showdown').click()
    for (const page of [host, guest]) {
      await expect(page.getByRole('heading', { name: 'Final Showdown' })).toBeVisible({ timeout: 8_000 })
      for (const seat of ['Player 1', 'Player 2']) {
        await expect(page.getByRole('list', { name: `${seat} lineup` }).getByRole('listitem')).toHaveCount(5)
      }
    }
    expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
    await guest.getByRole('button', { name: /Vote for Sam/ }).click()
    await expect(guest.getByRole('button', { name: /Vote for Sam/ })).toBeDisabled()
    await expect(host.getByText(/Room votes · Alex 0 · Sam 1/)).toBeVisible({ timeout: 8_000 })
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()])
  }
})
