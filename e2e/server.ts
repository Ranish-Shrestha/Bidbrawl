import type { FullConfig } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createServer } from 'vite'
import { createOnlineApi } from '../server/online/api'

export default async function startServer(config: FullConfig) {
  const url = new URL(config.projects[0]!.use.baseURL!)
  const database = new PGlite()
  await database.exec(await readFile(new URL('../server/online/migrations/001_rooms.sql', import.meta.url), 'utf8'))
  const handleOnline = createOnlineApi({
    database: { transaction: (work) => database.transaction((sql) => work(sql)) },
    origin: url.origin, pepper: 'playwright-only-ephemeral-database-secret',
  })
  const server = await createServer({
    server: { host: url.hostname, port: Number(url.port), strictPort: true },
    plugins: [{
      name: 'online-test-api',
      configureServer(vite) {
        vite.middlewares.use('/api/online', async (request, response, next) => {
          try {
            const headers = new Headers()
            for (const [name, value] of Object.entries(request.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
            const chunks: Buffer[] = []
            for await (const chunk of request) chunks.push(Buffer.from(chunk))
            const method = request.method ?? 'GET'
            const result = await handleOnline(new Request(`${url.origin}${request.originalUrl ?? '/api/online'}`, {
              method, headers, ...(method === 'POST' ? { body: new Uint8Array(Buffer.concat(chunks)) } : {}),
            }))
            response.statusCode = result.status
            for (const [name, value] of result.headers) response.setHeader(name, value)
            response.end(await result.text())
          } catch (error) { next(error) }
        })
      },
    }],
  })

  try {
    await server.listen()
  } catch (error) {
    await server.close()
    await database.close()
    throw error
  }

  return async () => { await server.close(); await database.close() }
}
