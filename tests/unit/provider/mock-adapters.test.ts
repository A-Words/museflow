import { describe, expect, it } from 'vitest'
import type { ProviderConfig } from '../../../shared/contracts/provider/common.js'
import type {
  MusicProviderPort,
  ProviderPort,
  SpeechProviderPort,
  TextProviderPort,
} from '../../../shared/contracts/provider/ports.js'
import { classifyProviderFailure, deriveTextRequirements, snapshotProvider } from '../../../shared/contracts/provider/routing.js'
import {
  musicLiteConfig,
  musicStudioConfig,
  musicSubmitInputFixture,
  musicSubmitRequirements,
  providerConfigFixtures,
  providerDefaultFixtures,
  providerFixtureCapturedAt,
  speechSynthesizeInputFixture,
  speechSynthesizeRequirements,
  textBasicConfig,
  textFlexConfig,
  textGenerateInputFixture,
  textStreamInputFixture,
  ttsBasicConfig,
  ttsHdConfig,
} from '../../../shared/contracts/provider/fixtures.js'
import { createMockProviderRegistry, type MockProviderRegistryOptions } from '../../../server/services/providers/registry.js'
import {
  createMockMusicPort,
  createMockScript,
  createMockSpeechPort,
  createMockTextPort,
} from '../../../server/services/providers/mock/index.js'

// Samples for the contract review: success, explicit failure and an unknown external result,
// plus the two controlled configurations per kind. These tests prove the ports behave as the
// contract states; they never stand in for a real provider verification (sourceMode: 'mock').

const clock = () => providerFixtureCapturedAt

function registryWith(scripts: MockProviderRegistryOptions['scripts']) {
  return createMockProviderRegistry({ configs: providerConfigFixtures, defaults: providerDefaultFixtures, scripts })
}

function asTextPort(port: ProviderPort): TextProviderPort {
  if (!('generate' in port)) throw new Error('expected a text port')
  return port
}

function asMusicPort(port: ProviderPort): MusicProviderPort {
  if (!('submit' in port)) throw new Error('expected a music port')
  return port
}

function asSpeechPort(port: ProviderPort): SpeechProviderPort {
  if (!('synthesize' in port)) throw new Error('expected a speech port')
  return port
}

describe('text mock samples', () => {
  it('returns a normalized completion and marks it as a mock', async () => {
    const registry = registryWith({ 'mock-text-flex': { now: clock } })
    const route = registry.selectForNewRequest({
      kind: 'text',
      requirements: deriveTextRequirements(textGenerateInputFixture, 'generate'),
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)

    const result = await asTextPort(registry.port(route.snapshot)).generate(textGenerateInputFixture)
    expect(result.outcome).toBe('completed')
    if (result.outcome !== 'completed') return
    expect(result.text).toContain('mock')
    expect(result.finishReason).toBe('stop')
    expect(result.sourceMode).toBe('mock')
  })

  it('samples an explicit provider failure', async () => {
    const registry = registryWith({
      'mock-text-flex': {
        now: clock,
        perOperation: { generate: [{ outcome: 'rejected', code: 'CONTENT_REJECTED', message: 'mock content refusal' }] },
      },
    })
    const route = registry.selectForNewRequest({
      kind: 'text',
      requirements: deriveTextRequirements(textGenerateInputFixture, 'generate'),
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)

    const result = await asTextPort(registry.port(route.snapshot)).generate(textGenerateInputFixture)
    expect(result.outcome).toBe('rejected')
    if (result.outcome !== 'rejected') return
    expect(result.error.code).toBe('CONTENT_REJECTED')
    expect(result.error.retryable).toBe(false)
    expect(classifyProviderFailure({ code: result.error.code, stage: 'submit' })).toBe('never')
  })

  it('samples an unknown external result that must be reconciled, not retried', async () => {
    const registry = registryWith({
      'mock-text-flex': {
        now: clock,
        perOperation: { generate: [{ outcome: 'unknown', reason: 'response-lost' }] },
      },
    })
    const route = registry.selectForNewRequest({
      kind: 'text',
      requirements: deriveTextRequirements(textGenerateInputFixture, 'generate'),
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)

    const result = await asTextPort(registry.port(route.snapshot)).generate(textGenerateInputFixture)
    expect(result.outcome).toBe('unknown')
    if (result.outcome !== 'unknown') return
    expect(result.retryable).toBe(false)
    expect(classifyProviderFailure({ code: 'RESULT_UNKNOWN', stage: 'submit' })).toBe('reconcile')
  })

  it('refuses a stream on a configuration without stream support', async () => {
    const registry = registryWith({ 'mock-text-basic': { now: clock } })
    registry.setDefault('text', { providerConfigId: textBasicConfig.providerConfigId, version: 1 })
    const route = registry.selectForNewRequest({
      kind: 'text',
      requirements: [{ operation: 'generate' }],
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)

    const events = []
    for await (const event of asTextPort(registry.port(route.snapshot)).stream(textStreamInputFixture)) {
      events.push(event)
    }
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'error', code: 'UNSUPPORTED_CAPABILITY' })
  })

  it('refuses an accepted request on a configuration without the async mode', async () => {
    const registry = registryWith({
      'mock-text-basic': { now: clock, perOperation: { generate: [{ outcome: 'accepted' }] } },
    })
    registry.setDefault('text', { providerConfigId: textBasicConfig.providerConfigId, version: 1 })
    const route = registry.selectForNewRequest({
      kind: 'text',
      requirements: [{ operation: 'generate' }],
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)

    // Accepting here would produce a request the caller could never query or complete.
    const result = await asTextPort(registry.port(route.snapshot)).generate(textGenerateInputFixture)
    expect(result.outcome).toBe('rejected')
    if (result.outcome === 'rejected') expect(result.error.code).toBe('UNSUPPORTED_CAPABILITY')
  })

  it('streams a normalized event sequence on a configuration with stream support', async () => {
    const registry = registryWith({ 'mock-text-flex': { now: clock } })
    const route = registry.selectForNewRequest({
      kind: 'text',
      requirements: deriveTextRequirements(textStreamInputFixture, 'stream'),
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)

    const events = []
    for await (const event of asTextPort(registry.port(route.snapshot)).stream(textStreamInputFixture)) {
      events.push(event)
    }
    expect(events[0]).toMatchObject({ type: 'start', sequence: 0, sourceMode: 'mock' })
    expect(events.at(-1)).toMatchObject({ type: 'finish', finishReason: 'stop' })
    expect(events.filter(event => event.type === 'text-delta').length).toBeGreaterThan(0)
  })

  it.each(['accepted', 'canceled'] as const)('does not turn a %s script step into a successful stream', async outcome => {
    const port = createMockTextPort(textFlexConfig, createMockScript({ now: clock, perOperation: { stream: [{ outcome }] } }))
    const events = []
    for await (const event of port.stream(textStreamInputFixture)) events.push(event)
    expect(events).toMatchObject([{ type: 'error', code: 'INTERNAL_ERROR' }])
  })

  it('refuses a stream whose output type the configuration does not declare', async () => {
    // stream must validate the same derived requirements as generate: a configuration that
    // has the stream mode but not the requested output type cannot return a successful stream.
    const textOnlyConfig: ProviderConfig = {
      ...textFlexConfig,
      capabilities: { ...textFlexConfig.capabilities, outputTypes: ['text'] },
    }
    const port = createMockTextPort(textOnlyConfig, createMockScript({ now: clock }))

    const events = []
    for await (const event of port.stream({ ...textStreamInputFixture, responseFormat: 'json', structuredSchemaRef: 'lyrics-draft-v1' })) {
      events.push(event)
    }
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'error', code: 'UNSUPPORTED_CAPABILITY' })
  })

  it('refuses a stream whose input exceeds the declared limit', async () => {
    const shortInputConfig: ProviderConfig = {
      ...textFlexConfig,
      capabilities: { ...textFlexConfig.capabilities, limits: { maxInputCharacters: 8 } },
    }
    const port = createMockTextPort(shortInputConfig, createMockScript({ now: clock }))

    const events = []
    for await (const event of port.stream(textStreamInputFixture)) {
      events.push(event)
    }
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'error', code: 'UNSUPPORTED_CAPABILITY' })
  })

  it('streams tool-call deltas for a tool-call request instead of text', async () => {
    const registry = registryWith({ 'mock-text-flex': { now: clock } })
    const route = registry.selectForNewRequest({
      kind: 'text',
      requirements: [{ operation: 'stream', outputType: 'tool-calls' }],
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)

    const events = []
    for await (const event of asTextPort(registry.port(route.snapshot)).stream({
      ...textStreamInputFixture,
      responseFormat: 'tool-calls',
      toolNames: ['lyrics.generate'],
    })) {
      events.push(event)
    }

    // A caller that asked for tool calls must never observe a text answer.
    expect(events.some(event => event.type === 'text-delta')).toBe(false)
    const deltas = events.filter(event => event.type === 'tool-call-delta')
    expect(deltas.length).toBeGreaterThan(0)
    expect(deltas[0]).toMatchObject({ toolName: 'lyrics.generate' })
    const argumentsJson = deltas.map(event => (event.type === 'tool-call-delta' ? event.argumentsDelta : '')).join('')
    expect(argumentsJson).toContain('帮我规划一次创作步骤')
    expect(events.at(-1)).toMatchObject({ type: 'finish', finishReason: 'tool-calls' })
    expect(events.map(event => event.sequence)).toEqual(events.map((_, index) => index))
  })
})

describe('switching configurations', () => {
  it('switches the default text configuration without changing the caller', async () => {
    const registry = registryWith({ 'mock-text-flex': { now: clock }, 'mock-text-basic': { now: clock } })
    const requirements = deriveTextRequirements(textGenerateInputFixture, 'generate')

    const before = registry.selectForNewRequest({ kind: 'text', requirements, now: providerFixtureCapturedAt })
    registry.setDefault('text', { providerConfigId: textBasicConfig.providerConfigId, version: 1 })
    const after = registry.selectForNewRequest({ kind: 'text', requirements, now: providerFixtureCapturedAt })
    expect(before.ok && before.config.adapterId).toBe('mock-text-flex')
    expect(after.ok && after.config.adapterId).toBe('mock-text-basic')

    // The same business call site works with either configuration.
    if (!after.ok) throw new Error(after.error.message)
    const result = await asTextPort(registry.port(after.snapshot)).generate(textGenerateInputFixture)
    expect(result.outcome).toBe('completed')
  })

  it('keeps an existing quote and task on the original configuration after a switch', () => {
    const registry = registryWith({ 'mock-text-flex': { now: clock }, 'mock-text-basic': { now: clock } })
    const quote = registry.selectForNewRequest({
      kind: 'text',
      requirements: deriveTextRequirements(textGenerateInputFixture, 'generate'),
      now: providerFixtureCapturedAt,
    })
    if (!quote.ok) throw new Error(quote.error.message)

    registry.setDefault('text', { providerConfigId: textBasicConfig.providerConfigId, version: 1 })

    const resolved = registry.resolveSnapshot({ snapshot: quote.snapshot })
    expect(resolved.ok && resolved.config.adapterId).toBe('mock-text-flex')
    expect(asTextPort(registry.port(quote.snapshot)).config.adapterId).toBe('mock-text-flex')
  })
})

describe('music mock samples', () => {
  it('completes an accepted asynchronous request through query', async () => {
    const registry = registryWith({
      'mock-music-studio': {
        now: clock,
        perOperation: { submit: [{ outcome: 'accepted' }], query: [{ outcome: 'completed' }] },
      },
    })
    const route = registry.selectForNewRequest({
      kind: 'music',
      requirements: musicSubmitRequirements,
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)
    const port = asMusicPort(registry.port(route.snapshot))

    const submit = await port.submit(musicSubmitInputFixture)
    expect(submit.outcome).toBe('accepted')
    if (submit.outcome !== 'accepted') return

    const query = await port.query({ requestKey: musicSubmitInputFixture.requestKey, requestId: submit.requestId })
    expect(query.outcome).toBe('completed')
    if (query.outcome !== 'completed') return
    expect(query.artifacts[0]?.kind).toBe('audio')
    expect(query.sourceMode).toBe('mock')
    // The parameters confirmed at submit time are recalled instead of falling back to defaults.
    expect(query.durationMs).toBe(90_000)
    expect(query.format).toBe('mp3')
    expect(query.language).toBe('zh')
  })

  it('refuses query and cancel when the configuration does not declare them', async () => {
    const registry = registryWith({
      'mock-music-lite': { now: clock, perOperation: { submit: [{ outcome: 'accepted' }] } },
    })
    registry.setDefault('music', { providerConfigId: musicLiteConfig.providerConfigId, version: 1 })
    const route = registry.selectForNewRequest({
      kind: 'music',
      requirements: [{ operation: 'submit', maxDurationSeconds: 20 }],
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)
    const port = asMusicPort(registry.port(route.snapshot))

    const submit = await port.submit({
      requestKey: 'mock-music-request-lite',
      prompt: 'short loop',
      instrumental: true,
      durationSeconds: 20,
    })
    expect(submit.outcome).toBe('accepted')
    if (submit.outcome !== 'accepted') return

    const query = await port.query({ requestKey: 'mock-music-request-lite', requestId: submit.requestId })
    expect(query.outcome).toBe('rejected')
    if (query.outcome === 'rejected') expect(query.error.code).toBe('UNSUPPORTED_CAPABILITY')

    const cancel = await port.cancel({
      requestKey: 'mock-music-request-lite',
      requestId: submit.requestId,
      reason: '用户请求取消',
    })
    expect(cancel.outcome).toBe('rejected')
    if (cancel.outcome === 'rejected') expect(cancel.error.code).toBe('CANCEL_NOT_SUPPORTED')
  })

  it('reports a request it never issued as unconfirmable instead of inventing a result', async () => {
    const port = createMockMusicPort(
      musicStudioConfig,
      createMockScript({ now: clock, perOperation: { query: [{ outcome: 'completed' }] } }),
    )
    const query = await port.query({ requestKey: 'mock-music-request-unknown', requestId: 'mock-request-unknown' })
    expect(query.outcome).toBe('unknown')
    if (query.outcome !== 'unknown') return
    expect(query.reason).toBe('query-unavailable')
    expect(query.retryable).toBe(false)
  })

  it('does not confirm an accepted request through a mismatched request id', async () => {
    const registry = registryWith({
      'mock-music-studio': {
        now: clock,
        perOperation: { submit: [{ outcome: 'accepted' }], query: [{ outcome: 'completed' }] },
      },
    })
    const route = registry.selectForNewRequest({
      kind: 'music',
      requirements: musicSubmitRequirements,
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)
    const port = asMusicPort(registry.port(route.snapshot))

    const submit = await port.submit(musicSubmitInputFixture)
    expect(submit.outcome).toBe('accepted')
    if (submit.outcome !== 'accepted') return

    // Addressing the request with another vendor id must not hand back the accepted result.
    const query = await port.query({
      requestKey: musicSubmitInputFixture.requestKey,
      requestId: 'mock-request-someone-else',
    })
    expect(query.outcome).toBe('unknown')
    if (query.outcome === 'unknown') expect(query.reason).toBe('query-unavailable')
  })

  it.each(['accepted', 'canceled'] as const)('does not report music %s for an unaddressed request', async outcome => {
    const port = createMockMusicPort(
      musicStudioConfig,
      createMockScript({ now: clock, perOperation: { submit: [{ outcome: 'accepted' }], query: [{ outcome }, { outcome }] } }),
    )
    const submit = await port.submit(musicSubmitInputFixture)
    expect(submit.outcome).toBe('accepted')
    if (submit.outcome !== 'accepted') return
    const wrong = await port.query({ requestKey: musicSubmitInputFixture.requestKey, requestId: 'other-vendor-id' })
    expect(wrong).toMatchObject({ outcome: 'unknown', reason: 'query-unavailable' })
    const right = await port.query({ requestKey: musicSubmitInputFixture.requestKey, requestId: submit.requestId })
    expect(right.outcome).toBe(outcome)
  })

  it('keeps the confirmed parameters when a cancel reports a completed request', async () => {
    const registry = registryWith({
      'mock-music-studio': {
        now: clock,
        perOperation: { submit: [{ outcome: 'accepted' }], cancel: [{ outcome: 'completed' }] },
      },
    })
    const route = registry.selectForNewRequest({
      kind: 'music',
      requirements: musicSubmitRequirements,
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)
    const port = asMusicPort(registry.port(route.snapshot))

    const submit = await port.submit(musicSubmitInputFixture)
    expect(submit.outcome).toBe('accepted')
    if (submit.outcome !== 'accepted') return

    // A cancel that finds the request already finished reports the confirmed parameters too.
    const cancel = await port.cancel({
      requestKey: musicSubmitInputFixture.requestKey,
      requestId: submit.requestId,
      reason: '用户请求取消',
    })
    expect(cancel.outcome).toBe('completed')
    if (cancel.outcome !== 'completed') return
    expect(cancel.durationMs).toBe(90_000)
    expect(cancel.format).toBe('mp3')
    expect(cancel.language).toBe('zh')
  })

  it('does not confirm cancellation with a mismatched request id', async () => {
    const port = createMockMusicPort(
      musicStudioConfig,
      createMockScript({ now: clock, perOperation: { submit: [{ outcome: 'accepted' }], cancel: [{ outcome: 'canceled' }, { outcome: 'canceled' }] } }),
    )
    const submit = await port.submit(musicSubmitInputFixture)
    expect(submit.outcome).toBe('accepted')
    if (submit.outcome !== 'accepted') return
    const wrong = await port.cancel({ requestKey: musicSubmitInputFixture.requestKey, requestId: 'other-vendor-id', reason: '用户请求取消' })
    expect(wrong).toMatchObject({ outcome: 'unknown', reason: 'query-unavailable' })
    const right = await port.cancel({ requestKey: musicSubmitInputFixture.requestKey, requestId: submit.requestId, reason: '用户请求取消' })
    expect(right.outcome).toBe('canceled')
  })

  it('refuses an accepted submission on a synchronous-only configuration', async () => {
    const syncOnly = {
      ...musicStudioConfig,
      capabilities: {
        ...musicStudioConfig.capabilities,
        modes: ['sync' as const],
        supports: { ...musicStudioConfig.capabilities.supports, query: false, callbacks: false },
      },
    }
    const port = createMockMusicPort(
      syncOnly,
      createMockScript({ now: clock, perOperation: { submit: [{ outcome: 'accepted' }] } }),
    )
    const result = await port.submit(musicSubmitInputFixture)
    expect(result.outcome).toBe('rejected')
    if (result.outcome === 'rejected') expect(result.error.code).toBe('UNSUPPORTED_CAPABILITY')
  })
})

describe('speech mock samples', () => {
  it('returns audio with its voice and language metadata', async () => {
    const registry = registryWith({ 'mock-tts-hd': { now: clock } })
    const route = registry.selectForNewRequest({
      kind: 'tts',
      requirements: speechSynthesizeRequirements,
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)

    const result = await asSpeechPort(registry.port(route.snapshot)).synthesize(speechSynthesizeInputFixture)
    expect(result.outcome).toBe('completed')
    if (result.outcome !== 'completed') return
    expect(result.voiceRef).toBe(speechSynthesizeInputFixture.voiceRef)
    expect(result.voiceKind).toBe('preset')
    expect(result.language).toBe(speechSynthesizeInputFixture.language)
    expect(result.artifacts[0]?.kind).toBe('audio')
  })

  it('refuses a cloned voice on a configuration that only declares presets', async () => {
    const registry = registryWith({ 'mock-tts-basic': { now: clock } })
    registry.setDefault('tts', { providerConfigId: ttsBasicConfig.providerConfigId, version: 1 })
    const route = registry.selectForNewRequest({
      kind: 'tts',
      requirements: [{ operation: 'synthesize' }],
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)

    const result = await asSpeechPort(registry.port(route.snapshot)).synthesize({
      requestKey: 'mock-tts-request-cloned',
      text: '你好',
      voiceRef: 'cloned:voice-01',
      language: 'zh',
    })
    expect(result.outcome).toBe('rejected')
    if (result.outcome === 'rejected') expect(result.error.code).toBe('UNSUPPORTED_CAPABILITY')
  })

  it('returns the confirmed voice metadata when an accepted request is queried', async () => {
    const registry = registryWith({
      'mock-tts-hd': {
        now: clock,
        perOperation: { synthesize: [{ outcome: 'accepted' }], query: [{ outcome: 'completed' }] },
      },
    })
    const route = registry.selectForNewRequest({
      kind: 'tts',
      requirements: speechSynthesizeRequirements,
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)
    const port = asSpeechPort(registry.port(route.snapshot))

    const request = { ...speechSynthesizeInputFixture, voiceRef: 'cloned:voice-01' }
    const submit = await port.synthesize(request)
    expect(submit.outcome).toBe('accepted')
    if (submit.outcome !== 'accepted') return

    const query = await port.query({ requestKey: request.requestKey, requestId: submit.requestId })
    expect(query.outcome).toBe('completed')
    if (query.outcome !== 'completed') return
    // The delivered audio can be checked against the voice that was actually confirmed.
    expect(query.voiceRef).toBe('cloned:voice-01')
    expect(query.voiceKind).toBe('cloned')
  })

  it('keeps the confirmed voice metadata when the snapshot is resolved again', async () => {
    const registry = registryWith({
      'mock-tts-hd': {
        now: clock,
        perOperation: { synthesize: [{ outcome: 'accepted' }], query: [{ outcome: 'completed' }] },
      },
    })
    const route = registry.selectForNewRequest({
      kind: 'tts',
      requirements: speechSynthesizeRequirements,
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)

    const request = { ...speechSynthesizeInputFixture, voiceRef: 'cloned:voice-01' }
    const accepted = await asSpeechPort(registry.port(route.snapshot)).synthesize(request)
    expect(accepted.outcome).toBe('accepted')
    if (accepted.outcome !== 'accepted') return

    // A task that resolves its stored snapshot again must reach the port that issued the
    // request, not a fresh instance that forgot the confirmed voice.
    const query = await asSpeechPort(registry.port(route.snapshot)).query({
      requestKey: request.requestKey,
      requestId: accepted.requestId,
    })
    expect(query.outcome).toBe('completed')
    if (query.outcome !== 'completed') return
    expect(query.voiceRef).toBe('cloned:voice-01')
    expect(query.voiceKind).toBe('cloned')
  })

  it('reports a request it never issued as unconfirmable instead of inventing a voice', async () => {
    const port = createMockSpeechPort(
      ttsHdConfig,
      createMockScript({ now: clock, perOperation: { query: [{ outcome: 'completed' }] } }),
    )
    const query = await port.query({ requestKey: 'mock-tts-request-unknown', requestId: 'mock-request-unknown' })
    expect(query.outcome).toBe('unknown')
    if (query.outcome !== 'unknown') return
    expect(query.reason).toBe('query-unavailable')
    expect(query.retryable).toBe(false)
  })

  it('does not confirm an accepted request through a mismatched request id', async () => {
    const registry = registryWith({
      'mock-tts-hd': {
        now: clock,
        perOperation: { synthesize: [{ outcome: 'accepted' }], query: [{ outcome: 'completed' }] },
      },
    })
    const route = registry.selectForNewRequest({
      kind: 'tts',
      requirements: speechSynthesizeRequirements,
      now: providerFixtureCapturedAt,
    })
    if (!route.ok) throw new Error(route.error.message)
    const port = asSpeechPort(registry.port(route.snapshot))

    const submit = await port.synthesize(speechSynthesizeInputFixture)
    expect(submit.outcome).toBe('accepted')
    if (submit.outcome !== 'accepted') return

    const query = await port.query({
      requestKey: speechSynthesizeInputFixture.requestKey,
      requestId: 'mock-request-someone-else',
    })
    expect(query.outcome).toBe('unknown')
    if (query.outcome === 'unknown') expect(query.reason).toBe('query-unavailable')
  })

  it.each(['accepted', 'canceled'] as const)('does not report speech %s for an unaddressed request', async outcome => {
    const port = createMockSpeechPort(
      ttsHdConfig,
      createMockScript({ now: clock, perOperation: { synthesize: [{ outcome: 'accepted' }], query: [{ outcome }, { outcome }] } }),
    )
    const submit = await port.synthesize(speechSynthesizeInputFixture)
    expect(submit.outcome).toBe('accepted')
    if (submit.outcome !== 'accepted') return
    const wrong = await port.query({ requestKey: speechSynthesizeInputFixture.requestKey, requestId: 'other-vendor-id' })
    expect(wrong).toMatchObject({ outcome: 'unknown', reason: 'query-unavailable' })
    const right = await port.query({ requestKey: speechSynthesizeInputFixture.requestKey, requestId: submit.requestId })
    expect(right.outcome).toBe(outcome)
  })

  it('does not confirm speech cancellation with a mismatched request id', async () => {
    const port = createMockSpeechPort(
      ttsHdConfig,
      createMockScript({ now: clock, perOperation: { synthesize: [{ outcome: 'accepted' }], cancel: [{ outcome: 'canceled' }, { outcome: 'canceled' }] } }),
    )
    const submit = await port.synthesize(speechSynthesizeInputFixture)
    expect(submit.outcome).toBe('accepted')
    if (submit.outcome !== 'accepted') return
    const wrong = await port.cancel({ requestKey: speechSynthesizeInputFixture.requestKey, requestId: 'other-vendor-id', reason: '用户请求取消' })
    expect(wrong).toMatchObject({ outcome: 'unknown', reason: 'query-unavailable' })
    const right = await port.cancel({ requestKey: speechSynthesizeInputFixture.requestKey, requestId: submit.requestId, reason: '用户请求取消' })
    expect(right.outcome).toBe('canceled')
  })
})

describe('mock adapter guards', () => {
  it('refuses to build a mock port from a configuration that is not a mock', () => {
    expect(() => createMockTextPort({ ...textFlexConfig, sourceMode: 'real' })).toThrow(/mock configurations/)
  })

  it('refuses to resolve a port for a snapshot whose configuration was disabled', () => {
    const disabledRegistry = createMockProviderRegistry({
      configs: providerConfigFixtures.map(config =>
        config.providerConfigId === musicStudioConfig.providerConfigId ? { ...config, enabled: false } : config,
      ),
      defaults: providerDefaultFixtures,
      scripts: { 'mock-music-studio': { now: clock } },
    })
    const snapshot = snapshotProvider(musicStudioConfig, providerFixtureCapturedAt)
    expect(() => disabledRegistry.port(snapshot)).toThrow(/PROVIDER_UNAVAILABLE/)
  })
})

describe('port instances', () => {
  it('reuses one port per configuration version and never across versions', () => {
    const nextVersion = { ...textFlexConfig, version: textFlexConfig.version + 1, modelId: 'mock-text-2' }
    const registry = createMockProviderRegistry({
      configs: [...providerConfigFixtures, nextVersion],
      defaults: providerDefaultFixtures,
      scripts: { 'mock-text-flex': { now: clock } },
    })

    const first = registry.port(snapshotProvider(textFlexConfig, providerFixtureCapturedAt))
    const sameVersion = registry.port(snapshotProvider(textFlexConfig, providerFixtureCapturedAt))
    const otherVersion = registry.port(snapshotProvider(nextVersion, providerFixtureCapturedAt))

    // The same immutable version must return the instance that knows its in-flight requests.
    expect(sameVersion).toBe(first)
    expect(otherVersion).not.toBe(first)
    expect(otherVersion.config.version).toBe(nextVersion.version)
  })
})
