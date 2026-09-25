import { describe, expect, it } from 'vitest'
import {
  providerCapabilitiesSchema,
  providerConfigSchema,
  providerStatusEventSchema,
} from '../../../shared/contracts/provider/common.js'
import { musicCompletedSchema } from '../../../shared/contracts/provider/music.js'
import { speechCompletedSchema } from '../../../shared/contracts/provider/speech.js'
import { textResultSchema } from '../../../shared/contracts/provider/text.js'
import { publishProviderConfig } from '../../../shared/contracts/provider/routing.js'
import { musicStudioConfig, providerFixtureCapturedAt, textFlexConfig } from '../../../shared/contracts/provider/fixtures.js'

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

  it('refuses a completion whose audio artifact cannot be retrieved', () => {
    // A completion without a retrievable audio reference would leave the task nothing to
    // archive or deliver, so it is not a success even though the artifact kind is right.
    const unreachable = {
      outcome: 'completed',
      requestKey: 'mock-music-request-0001',
      artifacts: [{ kind: 'audio' }],
      sourceMode: 'mock',
      observedAt: providerFixtureCapturedAt,
    }
    expect(musicCompletedSchema.safeParse(unreachable).success).toBe(false)
    expect(
      musicCompletedSchema.safeParse({
        ...unreachable,
        artifacts: [{ kind: 'audio', downloadUrl: 'https://mock.invalid/audio.mp3' }],
      }).success,
    ).toBe(true)
    expect(
      speechCompletedSchema.safeParse({
        ...unreachable,
        requestKey: 'mock-tts-request-0001',
        voiceRef: 'preset:zh-female-01',
        voiceKind: 'preset',
        language: 'zh',
      }).success,
    ).toBe(false)
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

  it('refuses an asynchronous text configuration without callback support', () => {
    // The text port exposes no query operation, so a callback is the only recovery path: even a
    // declared query ability could never be called.
    const asynchronous = { ...base, modes: ['async'], supports: { ...base.supports, query: true } }
    expect(providerCapabilitiesSchema.safeParse(asynchronous).success).toBe(false)
    expect(
      providerCapabilitiesSchema.safeParse({
        ...asynchronous,
        supports: { ...base.supports, callbacks: true },
      }).success,
    ).toBe(true)
  })

  it('requires a declared query operation for an asynchronous queryable configuration', () => {
    // Advertising a query ability is not a recovery path on its own: the configuration must also
    // declare the query operation the caller would invoke.
    const withQueryAbility = {
      ...base,
      kind: 'music',
      operations: ['submit'],
      modes: ['async'],
      outputTypes: ['audio'],
      supports: { ...base.supports, query: true },
    }
    expect(providerCapabilitiesSchema.safeParse(withQueryAbility).success).toBe(false)
    expect(
      providerCapabilitiesSchema.safeParse({
        ...withQueryAbility,
        operations: ['submit', 'query'],
      }).success,
    ).toBe(true)
  })

  it('refuses a declaration whose matching operation is missing, whatever the mode', () => {
    // A query or cancel ability without the operation cannot serve the call it promises, even on
    // a synchronous configuration.
    const declaresQuery = {
      ...base,
      kind: 'music',
      operations: ['submit'],
      outputTypes: ['audio'],
      supports: { ...base.supports, query: true },
    }
    expect(providerCapabilitiesSchema.safeParse(declaresQuery).success).toBe(false)
    expect(
      providerCapabilitiesSchema.safeParse({ ...declaresQuery, operations: ['submit', 'query'] }).success,
    ).toBe(true)

    const declaresCancel = { ...declaresQuery, supports: { ...base.supports, cancel: true } }
    expect(providerCapabilitiesSchema.safeParse(declaresCancel).success).toBe(false)
    expect(
      providerCapabilitiesSchema.safeParse({ ...declaresCancel, operations: ['submit', 'cancel'] }).success,
    ).toBe(true)
  })
})

describe('configuration versions', () => {
  it('refuses a configuration whose capability kind differs from its own kind', () => {
    // Such a configuration could be published as a default of one kind and then refuse every
    // request routed to it, so it is refused at publish time.
    const mismatched = { ...textFlexConfig, capabilities: musicStudioConfig.capabilities }
    expect(providerConfigSchema.safeParse(mismatched).success).toBe(false)
    expect(providerConfigSchema.safeParse({ ...mismatched, kind: 'music' }).success).toBe(true)
  })

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
      kind: 'music',
      providerStatus: 'running',
      requestKey: 'mock-music-request-0001',
      requestId: 'vendor-1',
      occurredAt: providerFixtureCapturedAt,
      sourceMode: 'mock',
    }
    expect(providerStatusEventSchema.safeParse(event).success).toBe(true)
    expect(providerStatusEventSchema.safeParse({ ...event, eventKey: undefined }).success).toBe(false)
  })

  it('requires the matching result for a completed callback', () => {
    const base = {
      eventKey: 'vendor-event-2',
      providerStatus: 'completed',
      requestKey: 'mock-music-request-0001',
      occurredAt: providerFixtureCapturedAt,
      sourceMode: 'mock',
    }
    expect(providerStatusEventSchema.safeParse({ ...base, kind: 'text' }).success).toBe(false)
    expect(providerStatusEventSchema.safeParse({ ...base, kind: 'music' }).success).toBe(false)
    expect(providerStatusEventSchema.safeParse({ ...base, kind: 'tts', artifacts: [{ kind: 'audio' }] }).success).toBe(false)
    for (const kind of ['music', 'tts']) {
      expect(providerStatusEventSchema.safeParse({ ...base, kind, artifacts: [{ kind: 'audio', downloadUrl: 'https://example.com/result.mp3' }] }).success).toBe(true)
    }
  })

  it('carries a completed text result through the callback that delivers it', () => {
    // The text port has no query operation, so this payload is the only way an asynchronous text
    // request can recover the result it was accepted for.
    const event = {
      eventKey: 'vendor-text-event-1',
      kind: 'text',
      providerStatus: 'completed',
      requestKey: 'mock-text-request-0001',
      requestId: 'vendor-text-1',
      textResult: {
        text: '夏夜的风吹过街角',
        structuredValue: { title: 'mock 歌词草稿' },
        toolProposals: [{ toolCallId: 'call-1', toolName: 'lyrics.generate', input: { theme: '夏夜' } }],
      },
      occurredAt: providerFixtureCapturedAt,
      sourceMode: 'mock',
    }
    expect(providerStatusEventSchema.safeParse(event).success).toBe(true)
    // A text completion without its proposals is not a usable payload.
    const withoutProposals = Object.fromEntries(
      Object.entries(event.textResult).filter(([key]) => key !== 'toolProposals'),
    )
    expect(providerStatusEventSchema.safeParse({ ...event, textResult: withoutProposals }).success).toBe(false)
  })
})
