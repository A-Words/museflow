import type { ProviderConfig, ProviderError } from '../../../../shared/contracts/provider/common.js'
import type {
  MusicCancelResult,
  MusicQueryResult,
  MusicSubmitResult,
} from '../../../../shared/contracts/provider/music.js'
import {
  musicCancelResultSchema,
  musicQueryResultSchema,
  musicSubmitResultSchema,
} from '../../../../shared/contracts/provider/music.js'
import type { MusicProviderPort } from '../../../../shared/contracts/provider/ports.js'
import {
  checkAllCapabilities,
  deriveMusicRequirements,
  providerError,
} from '../../../../shared/contracts/provider/routing.js'
import { mockAudioArtifact } from './media.js'
import { createMockScript, type MockScript } from './script.js'

// Music mock. Submission is asynchronous for every music configuration in this project, so
// an accepted result carries a vendor request id and is never reported as success. The lite
// configuration declares no query and no cancel ability, and the mock answers those calls
// with an explicit refusal instead of inventing a status.

export function createMockMusicPort(
  config: ProviderConfig,
  script: MockScript = createMockScript(),
): MusicProviderPort {
  // Parameters confirmed at submit time are recalled for query and cancel, so a delivered
  // result keeps the values of the original request instead of falling back to defaults. The
  // vendor request id is recorded as well, so a query or cancel has to address the request with
  // the id it was accepted with instead of any id that carries the same request key.
  const issued = new Map<
    string,
    { requestId?: string; durationSeconds?: number; format?: string; language?: string }
  >()
  const querySupported = config.capabilities.supports.query
  const cancelSupported = config.capabilities.supports.cancel
  const asyncSupported = config.capabilities.modes.includes('async')
  if (config.sourceMode !== 'mock') {
    throw new Error(`createMockMusicPort only accepts mock configurations, received ${config.providerKey}`)
  }

  function refused(error: ProviderError, requestKey: string, observedAt: string, requestId?: string) {
    return {
      outcome: 'rejected' as const,
      error,
      requestKey,
      ...(requestId ? { requestId } : {}),
      sourceMode: config.sourceMode,
      observedAt,
    }
  }

  function completed(input: {
    requestKey: string
    observedAt: string
    requestId?: string
    durationSeconds?: number
    format?: string
    language?: string
  }) {
    const durationMs = input.durationSeconds ? input.durationSeconds * 1_000 : 3_000
    return {
      outcome: 'completed' as const,
      requestKey: input.requestKey,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      artifacts: [
        mockAudioArtifact({
          config,
          requestKey: input.requestKey,
          observedAt: input.observedAt,
          format: input.format,
          durationMs,
        }),
      ],
      durationMs,
      ...(input.format ? { format: input.format } : {}),
      ...(input.language ? { language: input.language } : {}),
      usage: { audioMs: durationMs },
      sourceMode: config.sourceMode,
      observedAt: input.observedAt,
    }
  }

  function accepted(requestKey: string, observedAt: string, requestId: string) {
    return {
      outcome: 'accepted' as const,
      requestKey,
      requestId,
      providerStatus: 'running' as const,
      estimatedSeconds: 120,
      sourceMode: config.sourceMode,
      observedAt,
    }
  }

  function canceled(requestKey: string, observedAt: string, requestId?: string) {
    return {
      outcome: 'canceled' as const,
      requestKey,
      ...(requestId ? { requestId } : {}),
      sourceMode: config.sourceMode,
      observedAt,
    }
  }

  function unknownResult(
    reason: 'response-lost' | 'timeout-detached' | 'unparsable-response' | 'query-unavailable',
    message: string,
    requestKey: string,
    observedAt: string,
    requestId?: string,
  ) {
    return {
      outcome: 'unknown' as const,
      reason,
      message,
      retryable: false as const,
      requestKey,
      ...(requestId ? { requestId } : {}),
      sourceMode: config.sourceMode,
      observedAt,
    }
  }

  return {
    adapterId: config.adapterId,
    config,
    sourceMode: config.sourceMode,
    capabilities: () => config.capabilities,

    async submit(input): Promise<MusicSubmitResult> {
      script.calls.push({ operation: 'submit', requestKey: input.requestKey })
      await script.wait()
      const observedAt = script.now()
      const check = checkAllCapabilities(config.capabilities, deriveMusicRequirements(input))
      if (!check.ok) return musicSubmitResultSchema.parse(refused(check.error, input.requestKey, observedAt))

      const step = script.next('submit')
      switch (step.outcome) {
        case 'completed':
          issued.set(input.requestKey, {
            durationSeconds: input.durationSeconds,
            format: input.format,
            language: input.language,
          })
          return musicSubmitResultSchema.parse(
            completed({
              requestKey: input.requestKey,
              observedAt,
              durationSeconds: input.durationSeconds,
              format: input.format,
              language: input.language,
            }),
          )
        case 'accepted': {
          // A synchronous-only configuration cannot hand back an accepted request: nothing in
          // the contract would let the caller complete or query it.
          if (!asyncSupported) {
            return musicSubmitResultSchema.parse(
              refused(
                providerError(
                  'UNSUPPORTED_CAPABILITY',
                  `Configuration ${config.providerKey} cannot accept an asynchronous submission`,
                ),
                input.requestKey,
                observedAt,
              ),
            )
          }
          const requestId = `mock-request-${input.requestKey}`
          issued.set(input.requestKey, {
            requestId,
            durationSeconds: input.durationSeconds,
            format: input.format,
            language: input.language,
          })
          return musicSubmitResultSchema.parse(accepted(input.requestKey, observedAt, requestId))
        }
        case 'rejected':
          return musicSubmitResultSchema.parse(refused(providerError(step.code, step.message), input.requestKey, observedAt))
        case 'unknown':
          return musicSubmitResultSchema.parse(
            unknownResult(
              step.reason,
              step.message ?? 'The submission result is unknown; query the original request instead of resubmitting',
              input.requestKey,
              observedAt,
            ),
          )
        case 'canceled':
          return musicSubmitResultSchema.parse(
            refused(
              providerError('INTERNAL_ERROR', 'A submission cannot come back as canceled'),
              input.requestKey,
              observedAt,
            ),
          )
      }
    },

    async query(input): Promise<MusicQueryResult> {
      script.calls.push({ operation: 'query', requestKey: input.requestKey, requestId: input.requestId })
      await script.wait()
      const observedAt = script.now()
      if (!querySupported) {
        return musicQueryResultSchema.parse(
          refused(
            providerError('UNSUPPORTED_CAPABILITY', `Configuration ${config.providerKey} cannot query a request`),
            input.requestKey,
            observedAt,
            input.requestId,
          ),
        )
      }

      const step = script.next('query')
      const recalled = issued.get(input.requestKey)
      if (
        (step.outcome === 'completed' || step.outcome === 'accepted' || step.outcome === 'canceled') &&
        (!recalled || recalled.requestId !== input.requestId)
      ) {
        return musicQueryResultSchema.parse(
          unknownResult(
            'query-unavailable',
            'The mock port cannot confirm this request id; the original status cannot be confirmed',
            input.requestKey,
            observedAt,
            input.requestId,
          ),
        )
      }
      switch (step.outcome) {
        case 'completed': {
          if (!recalled) throw new Error('A completed query must have an issued request')
          return musicQueryResultSchema.parse(
            completed({
              requestKey: input.requestKey,
              requestId: input.requestId,
              observedAt,
              durationSeconds: recalled.durationSeconds,
              format: recalled.format,
              language: recalled.language,
            }),
          )
        }
        case 'accepted':
          return musicQueryResultSchema.parse(accepted(input.requestKey, observedAt, input.requestId))
        case 'canceled':
          return musicQueryResultSchema.parse(canceled(input.requestKey, observedAt, input.requestId))
        case 'rejected':
          return musicQueryResultSchema.parse(
            refused(providerError(step.code, step.message), input.requestKey, observedAt, input.requestId),
          )
        case 'unknown':
          return musicQueryResultSchema.parse(
            unknownResult(
              step.reason,
              step.message ?? 'The original request could not be confirmed',
              input.requestKey,
              observedAt,
              input.requestId,
            ),
          )
      }
    },

    async cancel(input): Promise<MusicCancelResult> {
      script.calls.push({ operation: 'cancel', requestKey: input.requestKey, requestId: input.requestId })
      await script.wait()
      const observedAt = script.now()
      if (!cancelSupported) {
        return musicCancelResultSchema.parse(
          refused(
            providerError(
              'CANCEL_NOT_SUPPORTED',
              `Configuration ${config.providerKey} cannot cancel a running request`,
            ),
            input.requestKey,
            observedAt,
            input.requestId,
          ),
        )
      }

      const step = script.next('cancel')
      switch (step.outcome) {
        case 'canceled': {
          const recalled = issued.get(input.requestKey)
          if (!recalled || recalled.requestId !== input.requestId) {
            return musicCancelResultSchema.parse(
              unknownResult('query-unavailable', 'The mock port cannot confirm this request id; the cancellation cannot be confirmed', input.requestKey, observedAt, input.requestId),
            )
          }
          return musicCancelResultSchema.parse(canceled(input.requestKey, observedAt, input.requestId))
        }
        case 'completed': {
          const recalled = issued.get(input.requestKey)
          if (!recalled || recalled.requestId !== input.requestId) {
            // The cancellation cannot be confirmed for a request this port never accepted or for
            // a different vendor id, and the original request may still be running, so it stays
            // unknown.
            return musicCancelResultSchema.parse(
              unknownResult(
                'query-unavailable',
                'The mock port cannot confirm this request id; the cancellation cannot be confirmed',
                input.requestKey,
                observedAt,
                input.requestId,
              ),
            )
          }
          return musicCancelResultSchema.parse(
            completed({
              requestKey: input.requestKey,
              requestId: input.requestId,
              observedAt,
              durationSeconds: recalled.durationSeconds,
              format: recalled.format,
              language: recalled.language,
            }),
          )
        }
        case 'rejected':
          return musicCancelResultSchema.parse(
            refused(providerError(step.code, step.message), input.requestKey, observedAt, input.requestId),
          )
        case 'unknown':
          return musicCancelResultSchema.parse(
            unknownResult(
              step.reason,
              step.message ?? 'The cancellation could not be confirmed; the original request keeps running',
              input.requestKey,
              observedAt,
              input.requestId,
            ),
          )
        case 'accepted':
          return musicCancelResultSchema.parse(
            refused(
              providerError('INTERNAL_ERROR', 'A cancel request cannot come back as accepted'),
              input.requestKey,
              observedAt,
              input.requestId,
            ),
          )
      }
    },
  }
}
