import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true })
}

async function startMatch(page: Page) {
  await page.goto('/')
  await expect(page).toHaveTitle('Bid Brawl')
  await expect(page.getByRole('link', { name: 'Bid Brawl home' })).toHaveText('Bid Brawl')
  await button(page, 'Start Local Game').click()
  await expect(page).toHaveURL(/\/setup$/)
  await expect(button(page, 'Start Match')).toBeDisabled()
  const theme = page.getByRole('radio', { name: 'Dream Vacation' })
  await theme.focus()
  await theme.press('Space')
  await expect(theme).toBeChecked()
  await page.getByRole('textbox', { name: 'Player 1' }).fill('Alex')
  await page.getByRole('textbox', { name: 'Player 2' }).fill('Sam')
  await button(page, 'Start Match').click()
  await expect(page).toHaveURL(/\/match$/)
}

async function lock(page: Page, amount: number) {
  if (amount === 0) {
    await button(page, 'Pass').click()
    return
  }
  const slider = page.getByRole('slider', { name: 'Bid amount' })
  for (let i = 0; i < amount; i += 1) await slider.press('ArrowRight')
  await button(page, `Lock in $${amount}`).click()
}

test('drafts two lineups, restores private turns, shares, votes and rematches', async ({ page, context }, testInfo) => {
  await startMatch(page)
  await expect(page.locator('.mystery-card__face')).toHaveCSS('animation-name', 'reveal-front')
  const sound = button(page, 'Sound effects')
  await expect(sound).toHaveAttribute('aria-pressed', 'false')
  await sound.click()
  await expect(sound).toHaveAttribute('aria-pressed', 'true')
  await sound.click()
  await expect(sound).toHaveAttribute('aria-pressed', 'false')
  await button(page, 'Begin Bidding').click()
  await expect(page.getByRole('heading', { name: 'Alex’s bid' })).toBeFocused()
  await expect(page.getByRole('slider')).toHaveAttribute('max', '16')
  await lock(page, 5)
  const handoff = page.getByRole('dialog', { name: 'Pass the device to Sam' })
  await expect(handoff).toBeVisible()
  await expect(page.locator('input[type=range]')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('$5')
  await expect(page).toHaveURL(/\/match$/)

  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Resume match privately' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('$5')
  await button(page, 'Resume privately').click()
  await expect(handoff).toBeVisible()
  await button(page, 'I’m ready').click()
  await expect(page.getByRole('slider')).toHaveValue('0')
  await button(page, 'Increase bid').click()
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Resume match privately' })).toBeVisible()
  await button(page, 'Resume privately').click()
  await expect(page.getByRole('heading', { name: 'Sam’s bid' })).toBeFocused()
  await expect(page.getByRole('slider')).toHaveValue('0')
  await expect(page.locator('body')).not.toContainText('$5')

  await lock(page, 3)
  await expect(page.getByRole('heading', { name: 'Alex won this card' })).toBeVisible()
  const bids = page.getByRole('group', { name: 'Revealed bids' })
  await expect(bids).toContainText('$5')
  await expect(bids).toContainText('$3')
  await button(page, 'Applaud').click()
  await expect(button(page, 'Applaud')).toHaveAttribute('aria-pressed', 'true')
  await expect(bids).toContainText('$5')
  for (let round = 2; round <= 10; round += 1) {
    await button(page, 'Next Mystery Card').click()
    await expect(button(page, 'Applaud')).toHaveCount(0)
    await button(page, 'Begin Bidding').click()
    await expect(page.getByRole('heading', { name: round <= 5 ? 'Alex’s bid' : 'Sam’s bid' })).toBeVisible()
    await lock(page, 1)
    if (round <= 5) {
      await button(page, 'I’m ready').click()
      await lock(page, 0)
    }
  }

  await button(page, 'View Final Showdown').click()
  await expect(page).toHaveURL(/\/results$/)
  const first = page.getByRole('list', { name: 'Player 1 lineup' })
  const second = page.getByRole('list', { name: 'Player 2 lineup' })
  await expect(first.getByRole('listitem')).toHaveCount(5)
  await expect(second.getByRole('listitem')).toHaveCount(5)
  await expect(first.locator('..')).toContainText('Spent$9')
  await expect(second.locator('..')).toContainText('Spent$5')
  await page.getByRole('button', { name: /Vote for Alex/ }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: /Vote for Alex/ })).toHaveAttribute('aria-pressed', 'true')

  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const share = button(page, 'Share Results')
  await share.click()
  const shareDialog = page.getByRole('dialog', { name: 'Share results' })
  await expect(shareDialog).toBeVisible()
  await button(page, 'Copy Text').click()
  await expect(shareDialog.getByRole('status')).toHaveText('Result text copied.')
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain('Player 1 · Alex')
  expect(text).toContain('Spent $9 · $11 remaining')
  expect(text).not.toMatch(/vote|\$3/i)

  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }))
  await button(page, 'Copy Text').click()
  const manual = shareDialog.getByRole('textbox', { name: 'Result text' })
  await expect(manual).toBeFocused()
  await expect(manual).toHaveValue(text.replace(/\r\n/g, '\n'))

  const downloadEvent = page.waitForEvent('download')
  await button(page, 'Download PNG').click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('bid-brawl-showdown.png')
  const pngPath = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(pngPath)
  const png = await readFile(pngPath)
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1350])
  await page.keyboard.press('Escape')
  await expect(shareDialog).toBeHidden()
  await expect(share).toBeFocused()

  await button(page, 'Rematch').click()
  await expect(page).toHaveURL(/\/match$/)
  await expect(page.getByText('Card 1 / 12')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Secret Bid match' }).getByText('$20', { exact: true })).toHaveCount(2)
  await expect(page.getByText('0/5 picks', { exact: true })).toHaveCount(2)
})

test.describe('320px with reduced motion', () => {
  test.use({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })

  test('completes an all-pass game with two discards and ten mandatory assignments', async ({ page }) => {
    await startMatch(page)
    for (let round = 1; round <= 12; round += 1) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
      await expect(page.locator('.mystery-card__face')).toHaveCSS('animation-name', 'none')
      await button(page, 'Begin Bidding').click()
      const slider = page.getByRole('slider')
      await expect(slider).toBeVisible()
      expect((await button(page, 'Pass').boundingBox())?.height).toBeGreaterThanOrEqual(44)
      await lock(page, 0)
      if (round < 12) {
        expect(await page.locator('.privacy-screen').evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
        await button(page, 'I’m ready').click()
        await lock(page, 0)
      }
      if (round <= 2) await expect(page.getByRole('heading', { name: 'Card discarded' })).toBeVisible()
      else await expect(page.getByText(/was assigned for \$1/)).toBeVisible()
      await expect(page.locator('.round-outcome')).toHaveCSS('animation-name', 'none')
      await button(page, round === 12 ? 'View Final Showdown' : 'Next Mystery Card').click()
    }
    await expect(page.getByRole('heading', { name: 'Final Showdown' })).toBeVisible()
    await expect(page.getByText(/Dream Vacation · 2 discarded/)).toBeVisible()
    await expect(page.getByText('$15', { exact: true })).toHaveCount(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

    await button(page, 'New Category').click()
    await expect(page).toHaveURL(/\/setup$/)
    await expect(button(page, 'Start Match')).toBeDisabled()
  })
})

test('browser Back asks before clearing the current match', async ({ page }) => {
  await startMatch(page)
  await page.goBack()
  const quit = page.getByRole('dialog', { name: 'Quit this match?' })
  await expect(quit).toBeVisible()
  await button(page, 'Keep playing').click()
  await expect(quit).toBeHidden()
  await expect(page).toHaveURL(/\/match$/)
  await page.goBack()
  await expect(quit).toBeVisible()
  await button(page, 'Quit Match').click()
  await expect(page).toHaveURL(/\/$/)
  await page.reload()
  await expect(button(page, 'Start Local Game')).toBeVisible()
  await button(page, 'Privacy').click()
  await expect(page.getByRole('dialog', { name: 'Privacy' })).toContainText('saved in this browser')
})
