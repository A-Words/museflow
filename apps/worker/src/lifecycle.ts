import { createDatabase } from '@museflow/database'
import type { parseWorkerConfig } from './config.js'

export async function startWorker(config: ReturnType<typeof parseWorkerConfig>) {
  const database = createDatabase(config.DATABASE_URL)
  try {
    await database.pool.query('select 1')
  }
  catch {
    await database.close()
    throw new Error('Worker database connection failed. Check DATABASE_URL and PostgreSQL availability.')
  }

  // Keep the standalone process alive. Task polling is owned by a later issue.
  const keepAlive = setInterval(() => {}, 60_000)
  let stopping: Promise<void> | undefined
  return {
    stop() {
      stopping ??= (async () => {
        clearInterval(keepAlive)
        await database.close()
      })()
      return stopping
    },
  }
}
