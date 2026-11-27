import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4173'
const channel = process.env.PLAYWRIGHT_CHANNEL

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  globalSetup: './e2e/server.ts',
  use: { baseURL, trace: 'retain-on-failure', ...(channel ? { channel } : {}) },
})
