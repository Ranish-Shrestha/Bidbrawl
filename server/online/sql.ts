import { Pool } from '@neondatabase/serverless'

export type Sql = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>
}

export type Database = {
  transaction<T>(work: (sql: Sql) => Promise<T>): Promise<T>
}

export function withNeon(connectionString: string): Database & { close: () => Promise<void> } {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5_000 })
  return {
    async transaction(work) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        try {
          const result = await work({ query: (statement, values) => client.query(statement, values) })
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        }
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

export async function databaseTime(sql: Sql): Promise<number> {
  const { rows } = await sql.query<{ now_ms: number }>(
    'SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::double precision AS now_ms',
  )
  const now = rows[0]?.now_ms
  if (!Number.isSafeInteger(now)) throw new Error('Database clock unavailable')
  return now!
}
