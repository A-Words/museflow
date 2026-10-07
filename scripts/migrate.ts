import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDatabase } from '../server/database/index.js'

const url = process.env.NUXT_DATABASE_URL
if (!url || !/^postgres(?:ql)?:\/\//.test(url)) {
  console.error('Set NUXT_DATABASE_URL to the target PostgreSQL database URL.')
  process.exitCode = 1
}
else {
  const database = createDatabase(url)
  try {
    await migrate(database.db, { migrationsFolder: './server/database/migrations' })
    console.info('Database migrations applied.')
  }
  catch {
    console.error('Database migration failed. Check PostgreSQL availability and migration state; credentials are omitted.')
    process.exitCode = 1
  }
  finally {
    await database.close()
  }
}
