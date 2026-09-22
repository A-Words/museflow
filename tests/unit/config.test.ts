import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseServerConfig } from '../../server/services/config.js'

describe('configuration', () => {
  const url = 'postgresql://example:TEST_SECRET@127.0.0.1:5432/test'
  const storage = resolve('storage')
  it('accepts explicit PostgreSQL and absolute storage configuration', () => {
    expect(parseServerConfig({ databaseUrl: url, storageRoot: storage }).storageRoot).toBe(storage)
  })
  it('names missing variables with setup instructions', () => {
    expect(() => parseServerConfig({})).toThrow(/NUXT_DATABASE_URL, NUXT_STORAGE_ROOT.*\.env.example/)
  })
  it('rejects malformed URLs and relative paths without echoing values', () => {
    for (const parse of [
      () => parseServerConfig({ databaseUrl: 'https://TEST_SECRET', storageRoot: 'relative/TEST_SECRET' }),
    ]) {
      expect(parse).toThrow(/Invalid configuration/)
      try { parse() } catch (error) { expect(String(error)).not.toContain('TEST_SECRET') }
    }
  })
})
