import type { ProviderConfig, ProviderError } from '../../../../shared/contracts/provider/common.js'
import {
  speechCancelResultSchema,
  speechQueryResultSchema,
  speechSynthesizeResultSchema,
} from '../../../../shared/contracts/provider/speech.js'
import type { SpeechProviderPort } from '../../../../shared/contracts/provider/ports.js'
import {
  checkAllCapabilities,
  deriveSpeechRequirements,
  providerError,
  voiceKindOf,
} from '../../../../shared/contracts/provider/routing.js'
import { mockAudioArtifact } from './media.js'
import { createMockScript, type MockScript } from './script.js'

// Speech mock. The voice reference decides the required voice kind ('cloned:' prefixes a
// cloned profile), which the shared requirement set already carries, so the quote path and
// this port check the same requirement. A configuration without the async mode refuses an
// asynchronous script step instead of returning an accepted request it could never complete.
//
// The port only knows the requests it issued itself. Anything else is reported as `unknown`
// instead of being answered with a placeholder voice.

export function createMockSpeechPort(
  config: ProviderConfig,
  script: MockScript = createMockScript(),
): SpeechProviderPort {
  // Voice metadata confirmed at submit time is recalled for query and cancel, so a delivered
  // artifact can be checked against the confirmed request instead of a guessed voice.
  const issued = new Map<
    string,
    { voiceRef: string; voiceKind: 'preset' | 'cloned'; language: string; format?: string; characters: number }
  >()
  const querySupported = config.capabilities.supports.query
  const cancelSupported = config.capabilities.supports.cancel
  const asyncSupported = config.capabilities.modes.includes('async')
  if (config.sourceMode !== 'mock') {
    throw new Error(`createMockSpeechPort only accepts mock configurations, received ${config.providerKey}`)
  }

  const observedAtOf = (): string => script.now()

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

  function accepted(requestKey: string, observedAt: string, requestId: string) {
    return {
      outcome: 'accepted' as const,
      requestKey,
      requestId,
      providerStatus: 'queued' as const,
      estimatedSeconds: 15,
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

  function completed(input: {
    requestKey: string
    observedAt: string
    requestId?: string
    voiceRef: string
    voiceKind: 'preset' | 'cloned'
    language: string
    format?: string
    characters: number
  }) {
    // Rough duration model for the mock: enough to look plausible in a demo, and never
    // presented as measured audio metadata.
    const durationMs = Math.max(1_000, Math.round(input.characters * 80))
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
      voiceRef: input.voiceRef,
      voiceKind: input.voiceKind,
      language: input.language,
      ...(input.format ? { format: input.format } : {}),
      durationMs,
      usage: { characters: input.characters, audioMs: durationMs },
      sourceMode: config.sourceMode,
      observedAt: input.observedAt,
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

    async synthesize(input) {
      script.calls.push({ operation: 'synthesize', requestKey: input.requestKey })
      await script.wait()
      const observedAt = observedAtOf()
      const voiceKind = voiceKindOf(input.voiceRef)
      // deriveSpeechRequirements already derives voiceKind from the voice reference, so the
      // port and the quote path check exactly the same requirement set.
      const check = checkAllCapabilities(config.capabilities, deriveSpeechRequirements(input))
      if (!check.ok) return speechSynthesizeResultSchema.parse(refused(check.error, input.requestKey, observedAt))

      const step = script.next('synthesize')
      switch (step.outcome) {
        case 'completed':
          issued.set(input.requestKey, {
            voiceRef: input.voiceRef,
            voiceKind,
            language: input.language,
            format: input.format,
            characters: input.text.length,
          })
          return speechSynthesizeResultSchema.parse(
            completed({
              requestKey: input.requestKey,
              observedAt,
              voiceRef: input.voiceRef,
              voiceKind,
              language: input.language,
              format: input.format,
              characters: input.text.length,
            }),
          )
        case 'accepted':
          if (!asyncSupported) {
            return speechSynthesizeResultSchema.parse(
              refused(
                providerError(
                  'UNSUPPORTED_CAPABILITY',
                  `Configuration ${config.providerKey} cannot accept an asynchronous synthesis`,
                ),
                input.requestKey,
                observedAt,
              ),
            )
          }
          issued.set(input.requestKey, {
            voiceRef: input.voiceRef,
            voiceKind,
            language: input.language,
            format: input.format,
            characters: input.text.length,
          })
          return speechSynthesizeResultSchema.parse(
            accepted(input.requestKey, observedAt, `mock-request-${input.requestKey}`),
          )
        case 'rejected':
          return speechSynthesizeResultSchema.parse(
            refused(providerError(step.code, step.message), input.requestKey, observedAt),
          )
        case 'unknown':
          return speechSynthesizeResultSchema.parse(
            unknownResult(
              step.reason,
              step.message ?? 'The synthesis result is unknown; query the original request instead of resubmitting',
              input.requestKey,
              observedAt,
            ),
          )
        case 'canceled':
          return speechSynthesizeResultSchema.parse(
            refused(
              providerError('INTERNAL_ERROR', 'A synthesis cannot come back as canceled'),
              input.requestKey,
              observedAt,
            ),
          )
      }
    },

    async query(input) {
      script.calls.push({ operation: 'query', requestKey: input.requestKey, requestId: input.requestId })
      await script.wait()
      const observedAt = observedAtOf()
      if (!querySupported) {
        return speechQueryResultSchema.parse(
          refused(
            providerError('UNSUPPORTED_CAPABILITY', `Configuration ${config.providerKey} cannot query a request`),
            input.requestKey,
            observedAt,
            input.requestId,
          ),
        )
      }

      const step = script.next('query')
      switch (step.outcome) {
        case 'completed': {
          const recalled = issued.get(input.requestKey)
          if (!recalled) {
            // Reporting a placeholder voice here would claim a confirmation that never
            // happened, so an unknown request is reported as unconfirmable instead.
            return speechQueryResultSchema.parse(
              unknownResult(
                'query-unavailable',
                'The mock port has no record of this request; the original result cannot be confirmed',
                input.requestKey,
                observedAt,
                input.requestId,
              ),
            )
          }
          return speechQueryResultSchema.parse(
            completed({
              requestKey: input.requestKey,
              requestId: input.requestId,
              observedAt,
              voiceRef: recalled.voiceRef,
              voiceKind: recalled.voiceKind,
              language: recalled.language,
              format: recalled.format,
              characters: recalled.characters,
            }),
          )
        }
        case 'accepted':
          return speechQueryResultSchema.parse(accepted(input.requestKey, observedAt, input.requestId))
        case 'canceled':
          return speechQueryResultSchema.parse(canceled(input.requestKey, observedAt, input.requestId))
        case 'rejected':
          return speechQueryResultSchema.parse(
            refused(providerError(step.code, step.message), input.requestKey, observedAt, input.requestId),
          )
        case 'unknown':
          return speechQueryResultSchema.parse(
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

    async cancel(input) {
      script.calls.push({ operation: 'cancel', requestKey: input.requestKey, requestId: input.requestId })
      await script.wait()
      const observedAt = observedAtOf()
      if (!cancelSupported) {
        return speechCancelResultSchema.parse(
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
        case 'canceled':
          return speechCancelResultSchema.parse(canceled(input.requestKey, observedAt, input.requestId))
        case 'completed': {
          const recalled = issued.get(input.requestKey)
          if (!recalled) {
            // The cancellation cannot be confirmed for a request this port never issued, and
            // the original request may still be running, so it stays unknown.
            return speechCancelResultSchema.parse(
              unknownResult(
                'query-unavailable',
                'The mock port has no record of this request; the cancellation cannot be confirmed',
                input.requestKey,
                observedAt,
                input.requestId,
              ),
            )
          }
          return speechCancelResultSchema.parse(
            completed({
              requestKey: input.requestKey,
              requestId: input.requestId,
              observedAt,
              voiceRef: recalled.voiceRef,
              voiceKind: recalled.voiceKind,
              language: recalled.language,
              format: recalled.format,
              characters: recalled.characters,
            }),
          )
        }
        case 'rejected':
          return speechCancelResultSchema.parse(
            refused(providerError(step.code, step.message), input.requestKey, observedAt, input.requestId),
          )
        case 'unknown':
          return speechCancelResultSchema.parse(
            unknownResult(
              step.reason,
              step.message ?? 'The cancellation could not be confirmed; the original request keeps running',
              input.requestKey,
              observedAt,
              input.requestId,
            ),
          )
        case 'accepted':
          return speechCancelResultSchema.parse(
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
