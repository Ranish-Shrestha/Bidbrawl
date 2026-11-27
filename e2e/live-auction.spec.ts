import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 320, height: 760 }, reducedMotion: 'reduce' })

test('plays Live Auction, restores a bid, and exports a playable portrait replay', async ({ page }) => {
  test.setTimeout(60_000)
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  await page.goto('/')
  await button('Start Local Game').click()
  await page.getByRole('link', { name: 'Live Auction', exact: true }).click()
  await expect(page).toHaveURL(/\/live$/)
  await expect(page.getByRole('link', { name: 'Live Auction', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByText('Dream Vacation', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Player 1' }).fill('Alex')
  await page.getByRole('textbox', { name: 'Player 2' }).fill('Sam')
  await button('Start Match').click()
  await expect(page.getByRole('heading', { name: 'Mystery card' })).toBeVisible()

  await button('Creator View').click()
  const frame = page.getByRole('group', { name: '9:16 Creator frame' })
  await expect(frame).toBeVisible()
  const bounds = (await frame.boundingBox())!
  expect(bounds.width / bounds.height).toBeCloseTo(9 / 16, 2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await expect(frame.getByText('$20', { exact: true })).toHaveCount(2)
  await expect(frame.getByRole('button', { name: 'Reveal Card' })).toHaveCount(0)
  await page.setViewportSize({ width: 1280, height: 900 })
  const desktopFrame = (await frame.boundingBox())!
  expect(desktopFrame.width / desktopFrame.height).toBeCloseTo(9 / 16, 2)
  await page.setViewportSize({ width: 320, height: 760 })
  await button('Reveal Card').click()
  await expect(page.getByRole('heading', { name: 'Mystery card' })).toHaveCount(0)

  await button('Open at $1').click()
  await expect(frame.getByText('Alex leads at $1')).toBeVisible()
  await page.getByRole('slider', { name: /Raise amount/ }).press('ArrowRight')
  await button('Raise to $3').click()
  await expect(frame.getByText('Sam leads at $3')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Sam leads at $3')).toBeVisible()
  await button('Pass').click()
  await expect(page.getByText('Sam takes the card for $3')).toBeVisible()

  await button('Next Card').click()
  await button('Reveal Card').click()
  await expect(page.getByText('Sam · Player 2 to act')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await button('Leave it to other player').click()
  await expect(page.getByText('Alex · Player 1 to act')).toBeVisible()
  await expect(page.getByText('$20', { exact: true })).toBeVisible()
  await expect(button('Pass')).toBeVisible()
  await button('Buy for $1').click()
  await expect(page.getByText('Alex takes the card for $1')).toBeVisible()

  for (let round = 3; round <= 12; round++) {
    await button('Next Card').click()
    await expect(page.getByRole('heading', { name: 'Mystery card' })).toBeVisible()
    await button('Reveal Card').click()
    await button('Leave it to other player').or(button('Pass')).click()
    if (await button('Buy for $1').isVisible()) await button('Pass').click()
  }
  await button('View Final Showdown').click()
  for (const seat of ['Player 1', 'Player 2']) {
    await expect(page.getByRole('list', { name: `${seat} lineup` }).getByRole('listitem')).toHaveCount(5)
  }
  const file = page.waitForEvent('download')
  await button('Download Replay JSON').click()
  const download = await file
  const replayFile = await readFile(await download.path())
  const replay = JSON.parse(replayFile.toString('utf8'))
  expect(replay.mode).toBe('live-auction')
  expect(replay.rounds).toHaveLength(12)
  expect(replay.rounds[0].outcome).toMatchObject({ winner: 'p2', paid: 3 })
  expect(replay.rounds[0].actions).toContainEqual({ type: 'RAISE', player: 'p2', amount: 3 })
  expect(replay).not.toHaveProperty('deck')

  await page.getByRole('link', { name: 'Replay Studio' }).click()
  await expect(page.getByRole('heading', { name: 'Replay Studio' })).toBeVisible()
  const preview = page.getByRole('group', { name: '9:16 replay preview' })
  await expect(preview.getByText('Alex opens')).toBeVisible()
  const upload = page.getByLabel('Open replay JSON')
  await upload.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1}') })
  await expect(page.getByRole('alert')).toContainText('isn’t a valid finished Live Auction replay')
  await upload.setInputFiles({ name: 'auction.json', mimeType: 'application/json', buffer: replayFile })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await button('Next event').click()
  await expect(preview.getByText('Alex offers $1')).toBeVisible()
  await page.getByLabel('Jump to a round').selectOption('2')
  await expect(preview.getByText('Sam opens')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  await button('Create Video').click()
  await button('Cancel Export').click()
  await expect(page.getByText('Video export cancelled.')).toBeVisible()
  await button('Create Video').click()
  await expect(button('Save Video')).toBeVisible({ timeout: 12_000 })
  const videoFile = page.waitForEvent('download')
  await button('Save Video').click()
  const videoDownload = await videoFile
  expect(videoDownload.suggestedFilename()).toMatch(/^bid-brawl-replay\.(webm|mp4)$/)
  const encoded = await readFile(await videoDownload.path())
  const mime = videoDownload.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm'
  expect(encoded.byteLength).toBeGreaterThan(1000)
  const metadata = await page.evaluate(async ({ bytes, type }) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }))
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('Replay video could not be decoded'))
        video.src = url
      })
      return { width: video.videoWidth, height: video.videoHeight, duration: video.duration }
    } finally { URL.revokeObjectURL(url) }
  }, { bytes: Array.from(encoded), type: mime })
  expect(metadata).toMatchObject({ width: 540, height: 960 })
  expect(metadata.duration).toBeGreaterThan(1)
  expect(metadata.duration).toBeLessThan(8)

  await page.addInitScript(() => Object.defineProperty(window, 'MediaRecorder', { value: undefined, configurable: true }))
  await page.reload()
  await expect(page.getByText(/Video export is unavailable in this browser/)).toBeVisible()
  await button('Play Replay').click()
  await expect(preview.getByText('Alex offers $1')).toBeVisible()
  await button('Pause').click()

  await page.goto('/live')
  await button('Rematch').click()
  await expect(page.getByRole('heading', { name: 'Mystery card' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Live Auction match' }).getByText('$20', { exact: true })).toHaveCount(2)
})
