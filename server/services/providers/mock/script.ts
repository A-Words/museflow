import type { ProviderErrorCode, UnknownReason } from '../../../../shared/contracts/provider/common.js'

// A programmable mock script drives every sample outcome: success, explicit failure and an
// unknown external result. The same mechanism covers repeated or out-of-order callbacks,
// because the task service reads the normalized events, not the script.
//
// Mock adapters are samples for contract review. They never replace a real provider
// verification, and every result they produce is marked sourceMode: 'mock'.

export type MockOperation = 'generate' | 'stream' | 'submit' | 'query' | 'cancel' | 'synthesize'

export type MockStep =
  | { outcome: 'completed' }
  | { outcome: 'accepted' }
  | { outcome: 'canceled' }
  | { outcome: 'rejected'; code: ProviderErrorCode; message: string }
  | { outcome: 'unknown'; reason: UnknownReason; message?: string }

export interface MockScriptCall {
  operation: MockOperation
  requestKey: string
  requestId?: string
}

export interface MockScriptOptions {
  /** Steps consumed in call order when no per-operation queue is configured. */
  steps?: readonly MockStep[]
  /** Per-operation queues, consumed before the shared `steps` queue. */
  perOperation?: Partial<Record<MockOperation, readonly MockStep[]>>
  /** Simulated latency; keep 0 in unit tests. */
  latencyMs?: number
  /** Injectable clock so snapshots and observations stay reproducible. */
  now?: () => string
}

export interface MockScript {
  readonly latencyMs: number
  readonly calls: MockScriptCall[]
  /** Next step for the operation, defaulting to a successful completion. */
  next(operation: MockOperation): MockStep
  wait(): Promise<void>
  now(): string
}

export function createMockScript(options: MockScriptOptions = {}): MockScript {
  const queues = new Map<MockOperation, MockStep[]>()
  for (const [operation, steps] of Object.entries(options.perOperation ?? {})) {
    if (steps) queues.set(operation as MockOperation, [...steps])
  }
  const fallback = [...(options.steps ?? [])]
  const latencyMs = options.latencyMs ?? 0
  const clock = options.now ?? (() => new Date().toISOString())

  return {
    latencyMs,
    calls: [],
    next(operation) {
      const step = queues.get(operation)?.shift() ?? fallback.shift()
      return step ?? { outcome: 'completed' }
    },
    async wait() {
      if (latencyMs > 0) await new Promise(resolve => setTimeout(resolve, latencyMs))
    },
    now: () => clock(),
  }
}
