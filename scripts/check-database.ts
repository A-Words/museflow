import { randomUUID } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDatabase } from '../server/database/index.js'
import { authSchema, user } from '../server/database/schema.js'

const url = process.env.TEST_DATABASE_URL
if (!url || !/^postgres(?:ql)?:\/\//.test(url) || !/test/i.test(new URL(url).pathname)) {
  console.error('Set TEST_DATABASE_URL to an isolated PostgreSQL database whose name contains "test".')
  process.exitCode = 1
}
else {
  const database = createDatabase(url)
  try {
    await migrate(database.db, { migrationsFolder: './server/database/migrations' })
    await migrate(database.db, { migrationsFolder: './server/database/migrations' })
    const auth = betterAuth({
      database: drizzleAdapter(database.db, { provider: 'pg', schema: authSchema }),
      baseURL: 'http://127.0.0.1:3000',
      secret: 'mf05-database-test-secret-at-least-32-characters',
      emailAndPassword: { enabled: true },
    })
    const authEmail = `${randomUUID()}@example.test`
    try {
      await auth.api.signUpEmail({ body: { name: 'Test Auth', email: authEmail, password: 'test-only-password-123!' } })
      const rows = await database.db.select({ id: user.id }).from(user).where(eq(user.email, authEmail)).limit(1)
      if (!rows[0]) throw new Error('Better Auth did not create a user')
    }
    finally {
      await database.db.delete(user).where(eq(user.email, authEmail))
    }
    const client = await database.pool.connect()
    try {
      const ownerA = randomUUID()
      const ownerB = randomUUID()
      const conversationId = randomUUID()
      await client.query('BEGIN')
      await client.query('INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)', [ownerA, 'Test A', `${ownerA}@example.test`, ownerB, 'Test B', `${ownerB}@example.test`])
      await client.query('INSERT INTO conversations (id, owner_id, title) VALUES ($1, $2, $3)', [conversationId, ownerA, 'Test'])
      await expectSqlState(client, '23503', 'INSERT INTO messages (conversation_id, owner_id, role, parts, status, request_id) VALUES ($1, $2, $3, $4, $5, $6)', [conversationId, ownerB, 'user', '[]', 'completed', randomUUID()])
      const toolCallId = randomUUID()
      await client.query('INSERT INTO tool_calls (id, owner_id, conversation_id, tool_name, input_snapshot, input_hash, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [toolCallId, ownerA, conversationId, 'lyrics.generate', '{}', 'test-hash', 'proposed'])
      await expectSqlState(client, '23503', 'INSERT INTO quotes (owner_id, tool_call_id, input_hash, input_snapshot, provider_snapshot, capability_snapshot, price_version, currency, amount, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + interval \'1 hour\')', [ownerB, toolCallId, 'test-hash', '{}', '{}', '{}', 1, 'creation', 1])
      const quoteId = randomUUID()
      await client.query('INSERT INTO quotes (id, owner_id, tool_call_id, input_hash, input_snapshot, provider_snapshot, capability_snapshot, price_version, currency, amount, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + interval \'1 hour\')', [quoteId, ownerA, toolCallId, 'test-hash', '{}', '{}', '{}', 1, 'creation', 1])
      const otherToolCallId = randomUUID()
      await client.query('INSERT INTO tool_calls (id, owner_id, conversation_id, tool_name, input_snapshot, input_hash, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [otherToolCallId, ownerA, conversationId, 'lyrics.generate', '{}', 'other-hash', 'proposed'])
      const taskSql = 'INSERT INTO generation_tasks (id, owner_id, conversation_id, tool_call_id, quote_id, tool_name, status, source_mode, input_snapshot, provider_snapshot, entitlement_snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)'
      await expectSqlState(client, '23503', taskSql, [randomUUID(), ownerA, conversationId, otherToolCallId, quoteId, 'lyrics.generate', 'pending', 'mock', '{}', '{}', '{}'])
      const taskId = randomUUID()
      await client.query(taskSql, [taskId, ownerA, conversationId, toolCallId, quoteId, 'lyrics.generate', 'pending', 'mock', '{}', '{}', '{}'])
      const otherConversationId = randomUUID()
      const otherOwnerToolCallId = randomUUID()
      const otherQuoteId = randomUUID()
      const otherTaskId = randomUUID()
      await client.query('INSERT INTO conversations (id, owner_id, title) VALUES ($1, $2, $3)', [otherConversationId, ownerB, 'Other user'])
      await client.query('INSERT INTO tool_calls (id, owner_id, conversation_id, tool_name, input_snapshot, input_hash, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [otherOwnerToolCallId, ownerB, otherConversationId, 'lyrics.generate', '{}', 'other-owner-hash', 'proposed'])
      await client.query('INSERT INTO quotes (id, owner_id, tool_call_id, input_hash, input_snapshot, provider_snapshot, capability_snapshot, price_version, currency, amount, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + interval \'1 hour\')', [otherQuoteId, ownerB, otherOwnerToolCallId, 'other-owner-hash', '{}', '{}', '{}', 1, 'creation', 1])
      await client.query(taskSql, [otherTaskId, ownerB, otherConversationId, otherOwnerToolCallId, otherQuoteId, 'lyrics.generate', 'pending', 'mock', '{}', '{}', '{}'])
      await expectSqlState(client, '23503', 'UPDATE generation_tasks SET retry_of_task_id = $1 WHERE id = $2', [otherTaskId, taskId])
      await expectSqlState(client, '23514', 'INSERT INTO assets (owner_id, task_id, kind, title, source_mode, status) VALUES ($1, $2, $3, $4, $5, $6)', [ownerA, taskId, 'lyrics', 'Missing slot', 'mock', 'ready'])
      const assetId = randomUUID()
      await client.query('INSERT INTO assets (id, owner_id, kind, title, source_mode, status) VALUES ($1, $2, $3, $4, $5, $6)', [assetId, ownerA, 'lyrics', 'Test asset', 'manual', 'ready'])
      await expectSqlState(client, '23503', 'INSERT INTO assets (owner_id, kind, title, source_mode, status, parent_asset_id) VALUES ($1, $2, $3, $4, $5, $6)', [ownerB, 'lyrics', 'Wrong owner', 'manual', 'ready', assetId])
      const configId = randomUUID()
      await client.query('INSERT INTO provider_configs (id, provider_key, version, kind, adapter_id, model_id, credential_ref, capabilities, parameter_mapping, source_mode) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [configId, `test-${configId}`, 1, 'text', 'mock-text', 'mock', 'env:TEST_ONLY', '{}', '{}', 'mock'])
      await expectSqlState(client, '23503', 'INSERT INTO provider_defaults (kind, provider_config_id, version) VALUES ($1, $2, $3)', ['music', configId, 1])
      await expectSqlState(client, '23514', 'INSERT INTO credit_accounts (owner_id, currency, available) VALUES ($1, $2, $3)', [ownerA, 'creation', '-1'])
      const wallet = await client.query<{ id: string }>('INSERT INTO credit_accounts (owner_id, currency) VALUES ($1, $2) RETURNING id', [ownerA, 'creation'])
      await expectSqlState(client, '23505', 'INSERT INTO credit_accounts (owner_id, currency) VALUES ($1, $2)', [ownerA, 'creation'])
      const otherWallet = await client.query<{ id: string }>('INSERT INTO credit_accounts (owner_id, currency) VALUES ($1, $2) RETURNING id', [ownerB, 'creation'])
      await expectSqlState(client, '23503', 'INSERT INTO credit_reservations (owner_id, task_id, account_id, amount) VALUES ($1, $2, $3, $4)', [ownerA, taskId, otherWallet.rows[0]!.id, 1])
      const entryId = randomUUID()
      await expectSqlState(client, '23503', 'INSERT INTO credit_entries (owner_id, account_id, kind, available_delta, held_delta, operation_key) VALUES ($1, $2, $3, $4, $5, $6)', [ownerB, wallet.rows[0]!.id, 'adjustment', 0, 0, `wrong-owner-${entryId}`])
      await client.query('INSERT INTO credit_entries (id, owner_id, account_id, kind, available_delta, held_delta, operation_key) VALUES ($1, $2, $3, $4, $5, $6, $7)', [entryId, ownerA, wallet.rows[0]!.id, 'adjustment', 0, 0, `test-${entryId}`])
      await expectSqlState(client, 'P0001', 'UPDATE credit_entries SET reason = $1 WHERE id = $2', ['mutated', entryId])
      await expectSqlState(client, 'P0001', 'TRUNCATE credit_entries', [])
      const auditId = randomUUID()
      await client.query('INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, change_summary, request_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [auditId, ownerA, 'test', 'user', ownerA, '{}', randomUUID()])
      await expectSqlState(client, 'P0001', 'UPDATE audit_logs SET reason = $1 WHERE id = $2', ['mutated', auditId])
      await expectSqlState(client, 'P0001', 'TRUNCATE audit_logs', [])
      await client.query('ROLLBACK')
    }
    catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
    finally {
      client.release()
    }
    console.info('PostgreSQL migrations, Better Auth sign-up, ownership, retry linkage, asset slots, Provider matching, nonnegative balance, uniqueness and append-only checks passed.')
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

/** Assert a constraint failure without aborting the surrounding rollback-only test transaction. */
async function expectSqlState(client: import('pg').PoolClient, expected: string, statement: string, values: unknown[]) {
  await client.query('SAVEPOINT expected_failure')
  try {
    await client.query(statement, values)
    throw new Error(`Expected SQLSTATE ${expected}`)
  }
  catch (error) {
    if ((error as { code?: string }).code !== expected) throw error
  }
  finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_failure')
    await client.query('RELEASE SAVEPOINT expected_failure')
  }
}
