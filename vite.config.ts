import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
const socialImage = productionHost && /^[a-z0-9.-]+$/i.test(productionHost)
  ? `https://${productionHost}/social-card.png`
  : '/social-card.png'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'social-image-url',
      transformIndexHtml: (html) => html.replace('content="/social-card.png"', `content="${socialImage}"`),
    },
  ],
  test: {
    pool: 'threads',
    maxWorkers: 2,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
