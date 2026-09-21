import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startWorker } from '../../apps/worker/src/lifecycle.js'

const database = vi.hoisted(() => ({ query: vi.fn(), close: vi.fn() }))
vi.mock('@museflow/database', () => ({
  createDatabase: () => ({ pool: { query: database.query }, close: database.close }),
}))

describe('Worker lifecycle', () => {
  afterEach(() => { vi.clearAllMocks(); vi.useRealTimers() })
  const config = { DATABASE_URL: 'postgresql://unused', STORAGE_ROOT: resolve('storage') }
  it('connects before readiness and closes once on repeated shutdown', async () => {
    vi.useFakeTimers()
    database.query.mockResolvedValueOnce({ rows: [] })
    database.close.mockResolvedValue(undefined)
    const worker = await startWorker(config)
    expect(database.query).toHaveBeenCalledWith('select 1')
    expect(vi.getTimerCount()).toBe(1)
    await Promise.all([worker.stop(), worker.stop()])
    expect(database.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('closes on connection failure and redacts driver errors', async () => {
    database.query.mockRejectedValueOnce(new Error('password TEST_SECRET'))
    await expect(startWorker(config)).rejects.toThrow('Worker database connection failed.')
    expect(database.close).toHaveBeenCalledTimes(1)
  })
})
