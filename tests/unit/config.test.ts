import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWorkerConfig } from '../../apps/worker/src/config.js'
import { parseServerConfig } from '../../apps/web/server/services/config.js'

describe('configuration', () => {
  const url = 'postgresql://example:TEST_SECRET@127.0.0.1:5432/test'
  const storage = resolve('storage')
  it('accepts explicit PostgreSQL and absolute storage configuration', () => {
    expect(parseWorkerConfig({ DATABASE_URL: url, STORAGE_ROOT: storage }).STORAGE_ROOT).toBe(storage)
    expect(parseServerConfig({ databaseUrl: url, storageRoot: storage }).storageRoot).toBe(storage)
  })
  it('names missing variables with setup instructions', () => {
    expect(() => parseWorkerConfig({})).toThrow(/DATABASE_URL, STORAGE_ROOT.*\.env.example/)
    expect(() => parseServerConfig({})).toThrow(/NUXT_DATABASE_URL, NUXT_STORAGE_ROOT.*\.env.example/)
  })
  it('rejects malformed URLs and relative paths without echoing values', () => {
    for (const parse of [
      () => parseWorkerConfig({ DATABASE_URL: 'https://TEST_SECRET', STORAGE_ROOT: 'relative/TEST_SECRET' }),
      () => parseServerConfig({ databaseUrl: 'https://TEST_SECRET', storageRoot: 'relative/TEST_SECRET' }),
    ]) {
      expect(parse).toThrow(/Invalid configuration/)
      try { parse() } catch (error) { expect(String(error)).not.toContain('TEST_SECRET') }
    }
  })
})
