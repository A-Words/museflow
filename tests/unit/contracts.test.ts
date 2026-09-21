import { describe, expect, it } from 'vitest'
import { healthSchema } from '@museflow/contracts'

describe('public health contract', () => {
  it('accepts Web liveness and rejects false readiness claims', () => {
    expect(healthSchema.parse({ status: 'ok', service: 'web' })).toEqual({ status: 'ok', service: 'web' })
    expect(healthSchema.safeParse({ status: 'ready', service: 'database' }).success).toBe(false)
  })
})
