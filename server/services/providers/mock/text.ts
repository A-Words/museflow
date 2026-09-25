import type {
  ProviderConfig,
  ProviderError,
  ProviderErrorCode,
  UnknownReason,
} from '../../../../shared/contracts/provider/common.js'
import type { TextGenerateInput, TextResult } from '../../../../shared/contracts/provider/text.js'
import { textResultSchema, textStreamEventSchema } from '../../../../shared/contracts/provider/text.js'
import type { TextProviderPort } from '../../../../shared/contracts/provider/ports.js'
import {
  checkAllCapabilities,
  deriveTextRequirements,
  providerError,
} from '../../../../shared/contracts/provider/routing.js'
import { createMockScript, type MockScript } from './script.js'

// Text mock. It behaves exactly like a real adapter is expected to behave: it validates the
// request against its own declared capabilities, returns a normalized result, and refuses an
// unsupported stream instead of emitting a fake delta. The configuration decides what is
// supported, so two configurations can be switched without touching the caller.

export const mockTextToolName = 'lyrics.generate'

const streamErrorCodes = [
  'UNSUPPORTED_CAPABILITY',
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  'CONTENT_REJECTED',
  'RESULT_UNKNOWN',
  'INTERNAL_ERROR',
] as const
type StreamErrorCode = (typeof streamErrorCodes)[number]

function streamErrorCode(code: ProviderErrorCode): StreamErrorCode {
  return (streamErrorCodes as readonly ProviderErrorCode[]).includes(code) ? (code as StreamErrorCode) : 'INTERNAL_ERROR'
}

export function createMockTextPort(config: ProviderConfig, script: MockScript = createMockScript()): TextProviderPort {
  const streamSupported = config.capabilities.modes.includes('stream')
  const asyncSupported = config.capabilities.modes.includes('async')
  if (config.sourceMode !== 'mock') {
    throw new Error(`createMockTextPort only accepts mock configurations, received ${config.providerKey}`)
  }

  function promptOf(input: TextGenerateInput): string {
    return input.messages[input.messages.length - 1]?.content ?? ''
  }

  function rejected(error: ProviderError, requestKey: string, observedAt: string): TextResult {
    return textResultSchema.parse({
      outcome: 'rejected',
      error,
      requestKey,
      sourceMode: config.sourceMode,
      observedAt,
    })
  }

  function unknown(
    reason: UnknownReason,
    message: string,
    requestKey: string,
    observedAt: string,
  ): TextResult {
    return textResultSchema.parse({
      outcome: 'unknown',
      reason,
      message,
      retryable: false,
      requestKey,
      sourceMode: config.sourceMode,
      observedAt,
    })
  }

  return {
    adapterId: config.adapterId,
    config,
    sourceMode: config.sourceMode,
    capabilities: () => config.capabilities,

    async generate(input: TextGenerateInput): Promise<TextResult> {
      script.calls.push({ operation: 'generate', requestKey: input.requestKey })
      await script.wait()
      const observedAt = script.now()
      const check = checkAllCapabilities(config.capabilities, deriveTextRequirements(input, 'generate'))
      if (!check.ok) return rejected(check.error, input.requestKey, observedAt)

      const step = script.next('generate')
      switch (step.outcome) {
        case 'completed':
          return textResultSchema.parse({
            outcome: 'completed',
            requestKey: input.requestKey,
            text: `[mock ${config.modelId}] ${promptOf(input)}`,
            ...(input.responseFormat === 'json'
              ? { structuredValue: { title: 'mock 歌词草稿', lines: ['第一行', '第二行'] } }
              : {}),
            toolProposals:
              input.responseFormat === 'tool-calls'
                ? [
                    {
                      toolCallId: `${input.requestKey}-call-1`,
                      toolName: input.toolNames?.[0] ?? mockTextToolName,
                      input: { theme: promptOf(input) },
                    },
                  ]
                : [],
            finishReason: input.responseFormat === 'tool-calls' ? 'tool-calls' : 'stop',
            usage: { inputTokens: 16, outputTokens: 32 },
            sourceMode: config.sourceMode,
            observedAt,
          })
        case 'accepted':
          // An accepted request must stay recoverable. Without the async mode the caller could
          // never query or receive it, so the port refuses instead of returning an accepted
          // request that could never complete.
          if (!asyncSupported) {
            return rejected(
              providerError(
                'UNSUPPORTED_CAPABILITY',
                `Configuration ${config.providerKey} cannot accept an asynchronous request`,
              ),
              input.requestKey,
              observedAt,
            )
          }
          return textResultSchema.parse({
            outcome: 'accepted',
            requestKey: input.requestKey,
            requestId: `mock-request-${input.requestKey}`,
            providerStatus: 'queued',
            sourceMode: config.sourceMode,
            observedAt,
          })
        case 'rejected':
          return rejected(providerError(step.code, step.message), input.requestKey, observedAt)
        case 'unknown':
          return unknown(
            step.reason,
            step.message ?? 'No response was observed; the mock request may still be running',
            input.requestKey,
            observedAt,
          )
        case 'canceled':
          return rejected(
            providerError('INTERNAL_ERROR', 'The text port cannot be canceled'),
            input.requestKey,
            observedAt,
          )
      }
    },

    async *stream(input: TextGenerateInput) {
      script.calls.push({ operation: 'stream', requestKey: input.requestKey })
      let sequence = 0
      if (!streamSupported) {
        yield textStreamEventSchema.parse({
          type: 'error',
          sequence: 1,
          code: 'UNSUPPORTED_CAPABILITY',
          message: `Configuration ${config.providerKey} has no stream mode`,
        })
        return
      }
      await script.wait()
      const step = script.next('stream')
      if (step.outcome === 'rejected') {
        yield textStreamEventSchema.parse({
          type: 'error',
          sequence: 1,
          code: streamErrorCode(step.code),
          message: step.message,
        })
        return
      }
      if (step.outcome === 'unknown') {
        yield textStreamEventSchema.parse({
          type: 'error',
          sequence: 1,
          code: 'RESULT_UNKNOWN',
          message: step.message ?? 'The stream ended without a usable response',
        })
        return
      }
      yield textStreamEventSchema.parse({
        type: 'start',
        sequence: 0,
        requestKey: input.requestKey,
        modelId: config.modelId,
        sourceMode: config.sourceMode,
      })
      for (const delta of [`[mock ${config.modelId}] `, promptOf(input)]) {
        sequence += 1
        yield textStreamEventSchema.parse({ type: 'text-delta', sequence, delta })
      }
      yield textStreamEventSchema.parse({
        type: 'finish',
        sequence: sequence + 1,
        finishReason: 'stop',
        usage: { outputTokens: 24 },
      })
    },
  }
}
