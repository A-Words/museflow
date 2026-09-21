import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDatabase } from '@museflow/database'

describe('database pool background errors', () => {
  afterEach(() => vi.restoreAllMocks())

  it('handles repeated idle errors without throwing or logging driver details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const database = createDatabase('postgresql://unused:TEST_SECRET@127.0.0.1:1/unused')
    const error = Object.assign(new Error('connection failed: TEST_SECRET'), {
      client: { connectionParameters: { password: 'TEST_SECRET' } },
    })
    try {
      expect(() => {
        database.pool.emit('error', error, error.client)
        database.pool.emit('error', error, error.client)
      }).not.toThrow()
      expect(log).toHaveBeenCalledTimes(2)
      expect(log.mock.calls).toEqual([
        ['Database idle connection lost. The pool will reconnect on the next query; no query was retried.'],
        ['Database idle connection lost. The pool will reconnect on the next query; no query was retried.'],
      ])
      expect(JSON.stringify(log.mock.calls)).not.toContain('TEST_SECRET')
    }
    finally {
      await database.close()
    }
  })
})
