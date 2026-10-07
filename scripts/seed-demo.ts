import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { createDatabase } from '../server/database/index.js'
import { account, creditAccounts, providerConfigs, providerDefaults, user } from '../server/database/schema.js'
import { providerConfigFixtures, providerDefaultFixtures } from '../shared/contracts/provider/fixtures.js'

const url = process.env.NUXT_DATABASE_URL
const password = process.env.DEMO_PASSWORD
if (!url || !/^postgres(?:ql)?:\/\//.test(url) || !password || password.length < 12 || process.env.ALLOW_DEMO_SEED !== '1') {
  console.error('Set NUXT_DATABASE_URL, DEMO_PASSWORD (12+ characters), and ALLOW_DEMO_SEED=1 before seeding.')
  process.exitCode = 1
}
else {
  const database = createDatabase(url)
  try {
    const passwordHash = await hashPassword(password)
    await database.db.transaction(async (tx) => {
      for (const [name, email, role] of [
        ['Demo Creator A', 'creator-a@example.test', 'creator'],
        ['Demo Creator B', 'creator-b@example.test', 'creator'],
        ['Demo Administrator', 'admin@example.test', 'admin'],
      ] as const) {
        const inserted = await tx.insert(user).values({ id: randomUUID(), name, email, role, emailVerified: true })
          .onConflictDoNothing({ target: user.email }).returning({ id: user.id })
        // An existing email may belong to a real account. Never attach a demo
        // password or create demo wallets for a user the seed did not create.
        if (!inserted[0]) continue
        const ownerId = inserted[0].id
        await tx.insert(account).values({ id: randomUUID(), accountId: ownerId, providerId: 'credential', userId: ownerId, password: passwordHash })
        for (const currency of ['creation', 'voice'] as const) {
          await tx.insert(creditAccounts).values({ ownerId, currency }).onConflictDoNothing({ target: [creditAccounts.ownerId, creditAccounts.currency] })
        }
      }
      for (const config of providerConfigFixtures) {
        await tx.insert(providerConfigs).values({
          id: config.providerConfigId,
          providerKey: config.providerKey,
          version: config.version,
          kind: config.kind,
          adapterId: config.adapterId,
          modelId: config.modelId,
          baseUrl: config.baseUrl,
          credentialRef: config.credentialRef,
          capabilities: config.capabilities,
          parameterMapping: config.parameterMapping,
          sourceMode: config.sourceMode,
          enabled: config.enabled,
        }).onConflictDoNothing({ target: [providerConfigs.providerKey, providerConfigs.version] })
      }
      for (const entry of providerDefaultFixtures) {
        await tx.insert(providerDefaults).values({ kind: entry.kind, providerConfigId: entry.providerConfigId, version: entry.version }).onConflictDoNothing({ target: providerDefaults.kind })
      }
    })
    console.info('Demo seed completed. Existing email accounts, credentials, balances and defaults were not changed.')
  }
  catch {
    console.error('Demo seed failed. Apply migrations first; credentials are omitted.')
    process.exitCode = 1
  }
  finally {
    await database.close()
  }
}
