import { describe, expect, it } from 'vitest'
import {
  providerCapabilitiesSchema,
  providerStatusEventSchema,
} from '../../../shared/contracts/provider/common.js'
import { musicCompletedSchema } from '../../../shared/contracts/provider/music.js'
import { speechCompletedSchema } from '../../../shared/contracts/provider/speech.js'
import { textResultSchema } from '../../../shared/contracts/provider/text.js'
import { publishProviderConfig } from '../../../shared/contracts/provider/routing.js'
import { providerFixtureCapturedAt, textFlexConfig } from '../../../shared/contracts/provider/fixtures.js'

const textCompleted = {
  outcome: 'completed',
  requestKey: 'mock-text-request-0001',
  text: 'hello',
  toolProposals: [],
  finishReason: 'stop',
  sourceMode: 'mock',
  observedAt: providerFixtureCapturedAt,
}

describe('text port contract', () => {
  it('accepts a normalized completion and rejects a vendor-shaped payload', () => {
    expect(textResultSchema.parse(textCompleted)).toEqual(textCompleted)
    expect(
      textResultSchema.safeParse({ ...textCompleted, vendorPayload: { raw: { choices: [] } } }).success,
    ).toBe(false)
  })

  it('keeps an unknown result separate from a failure and forbids retrying it', () => {
    const unknown = {
      outcome: 'unknown',
      reason: 'response-lost',
      message: 'The connection dropped after the request was sent',
      retryable: false,
      requestKey: 'mock-text-request-0001',
      sourceMode: 'mock',
      observedAt: providerFixtureCapturedAt,
    }
    expect(textResultSchema.safeParse(unknown).success).toBe(true)
    // An unknown external result can never be marked as retryable.
    expect(textResultSchema.safeParse({ ...unknown, retryable: true }).success).toBe(false)
    // A rejection is an explicit provider answer, not an uncertainty.
    expect(
      textResultSchema.safeParse({
        outcome: 'rejected',
        error: { code: 'CONTENT_REJECTED', message: 'blocked', retryable: false },
        requestKey: 'mock-text-request-0001',
        sourceMode: 'mock',
        observedAt: providerFixtureCapturedAt,
      }).success,
    ).toBe(true)
  })

  it('does not let an accepted asynchronous request claim success', () => {
    expect(
      textResultSchema.safeParse({
        outcome: 'accepted',
        requestKey: 'mock-text-request-0001',
        requestId: 'vendor-1',
        sourceMode: 'mock',
        observedAt: providerFixtureCapturedAt,
      }).success,
    ).toBe(true)
    // The vendor request id is mandatory: an accepted request must stay addressable.
    expect(
      textResultSchema.safeParse({
        outcome: 'accepted',
        requestKey: 'mock-text-request-0001',
        sourceMode: 'mock',
        observedAt: providerFixtureCapturedAt,
      }).success,
    ).toBe(false)
  })
})

describe('music and speech completion contracts', () => {
  it('refuses a completed music result without an audio artifact', () => {
    expect(
      musicCompletedSchema.safeParse({
        outcome: 'completed',
        requestKey: 'mock-music-request-0001',
        artifacts: [],
        sourceMode: 'mock',
        observedAt: providerFixtureCapturedAt,
      }).success,
    ).toBe(false)
  })

  it('requires the delivered voice, language and audio for a speech completion', () => {
    const artifact = {
      kind: 'audio',
      format: 'wav',
      byteSize: 1024,
      downloadUrl: 'https://mock.invalid/audio.wav',
    }
    const completed = {
      outcome: 'completed',
      requestKey: 'mock-tts-request-0001',
      artifacts: [artifact],
      voiceRef: 'preset:zh-female-01',
      voiceKind: 'preset',
      language: 'zh',
      sourceMode: 'mock',
      observedAt: providerFixtureCapturedAt,
    }
    expect(speechCompletedSchema.safeParse(completed).success).toBe(true)
    const withoutVoiceKind = Object.fromEntries(Object.entries(completed).filter(([key]) => key !== 'voiceKind'))
    expect(speechCompletedSchema.safeParse(withoutVoiceKind).success).toBe(false)
  })
})

describe('capability declarations', () => {
  const base = {
    kind: 'text',
    operations: ['generate'],
    modes: ['sync'],
    outputTypes: ['text'],
    supports: { query: false, cancel: false, idempotentSubmit: false, callbacks: false, remoteDelete: false },
    limits: { maxInputCharacters: 1000, expectedCompletionSeconds: 10 },
  }

  it('refuses an operation that does not belong to the port kind', () => {
    expect(providerCapabilitiesSchema.safeParse({ ...base, operations: ['submit'] }).success).toBe(false)
    expect(providerCapabilitiesSchema.safeParse({ ...base, operations: ['generate'] }).success).toBe(true)
  })

  it('refuses an asynchronous port whose result could never be recovered', () => {
    const unrecoverable = { ...base, kind: 'music', operations: ['submit'], modes: ['async'], outputTypes: ['audio'] }
    expect(providerCapabilitiesSchema.safeParse(unrecoverable).success).toBe(false)
    expect(
      providerCapabilitiesSchema.safeParse({
        ...unrecoverable,
        supports: { ...base.supports, callbacks: true },
      }).success,
    ).toBe(true)
  })
})

describe('configuration versions', () => {
  it('publishes a new version instead of overwriting the existing one', () => {
    const published = publishProviderConfig([textFlexConfig], {
      providerConfigId: textFlexConfig.providerConfigId,
      providerKey: textFlexConfig.providerKey,
      kind: 'text',
      adapterId: 'mock-text-flex',
      modelId: 'mock-text-2',
      credentialRef: 'env:MOCK_TEXT_FLEX_KEY',
      capabilities: textFlexConfig.capabilities,
      parameterMapping: {},
      enabled: true,
      sourceMode: 'mock',
    })
    expect(published.ok).toBe(true)
    if (!published.ok) return
    expect(published.config.version).toBe(textFlexConfig.version + 1)
    expect(published.config.modelId).toBe('mock-text-2')
  })

  it('refuses a configuration that does not satisfy the contract', () => {
    const published = publishProviderConfig([], {
      providerConfigId: textFlexConfig.providerConfigId,
      providerKey: 'mock-text-invalid',
      kind: 'text',
      adapterId: 'mock-text-flex',
      modelId: 'mock-text-1',
      credentialRef: '',
      capabilities: textFlexConfig.capabilities,
      parameterMapping: {},
      enabled: true,
      sourceMode: 'mock',
    })
    expect(published.ok).toBe(false)
  })
})

describe('normalized status events', () => {
  it('carries a deduplication key for repeated or out-of-order callbacks', () => {
    const event = {
      eventKey: 'vendor-event-1',
      providerStatus: 'completed',
      requestKey: 'mock-music-request-0001',
      requestId: 'vendor-1',
      occurredAt: providerFixtureCapturedAt,
      sourceMode: 'mock',
    }
    expect(providerStatusEventSchema.safeParse(event).success).toBe(true)
    expect(providerStatusEventSchema.safeParse({ ...event, eventKey: undefined }).success).toBe(false)
  })
})
