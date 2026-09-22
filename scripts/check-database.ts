import { createDatabase } from '../server/database/index.js'

const url = process.env.TEST_DATABASE_URL
if (!url || !/^postgres(?:ql)?:\/\//.test(url)) {
  console.error('Set TEST_DATABASE_URL to an explicit PostgreSQL test database URL. See .env.example.')
  process.exitCode = 1
}
else {
  const database = createDatabase(url)
  try {
    const result = await database.db.execute('select 1 as connected')
    if (result.rows[0]?.connected !== 1) throw new Error('Unexpected query result')
    console.info('PostgreSQL + Drizzle connection check passed.')
  }
  catch {
    console.error('Database check failed. Check TEST_DATABASE_URL and PostgreSQL availability; credentials are omitted.')
    process.exitCode = 1
  }
  finally {
    await database.close()
    console.info('Database pool closed.')
  }
}
