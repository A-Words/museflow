import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000 })
  // pg removes failed idle clients before emitting this event. A later query
  // can acquire a new connection; never log the driver error or attached client.
  pool.on('error', () => {
    console.error('Database idle connection lost. The pool will reconnect on the next query; no query was retried.')
  })
  const db = drizzle(pool)
  return { db, pool, close: () => pool.end() }
}
