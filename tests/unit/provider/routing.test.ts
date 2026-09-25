import { describe, expect, it } from 'vitest'
import {
  checkAllCapabilities,
  classifyProviderFailure,
  deriveMusicRequirements,
  deriveSpeechRequirements,
  resolveConfigReferenceRoute,
  resolveSnapshotRoute,
  selectProviderForNewRequest,
  snapshotProvider,
} from '../../../shared/contracts/provider/routing.js'
import {
  capabilityMismatchFixtures,
  musicLiteConfig,
  musicStudioConfig,
  musicSubmitInputFixture,
  musicSubmitRequirements,
  providerConfigFixtures,
  providerDefaultFixtures,
  providerFixtureCapturedAt,
  retryClassificationFixtures,
  speechSynthesizeInputFixture,
  speechSynthesizeRequirements,
  textBasicConfig,
  textFlexConfig,
  textStructuredRequirements,
  ttsHdConfig,
} from '../../../shared/contracts/provider/fixtures.js'
import type { ProviderConfig, ProviderDefault } from '../../../shared/contracts/provider/common.js'

const withTextDefault = (configId: string): ProviderDefault[] =>
  providerDefaultFixtures.map(entry => (entry.kind === 'text' ? { kind: 'text', providerConfigId: configId, version: 1 } : entry))

const withMusicDefault = (configId: string): ProviderDefault[] =>
  providerDefaultFixtures.map(entry => (entry.kind === 'music' ? { kind: 'music', providerConfigId: configId, version: 1 } : entry))

describe('capability validation samples', () => {
  it.each(capabilityMismatchFixtures)('refuses $name before any call', fixture => {
    const check = checkAllCapabilities(fixture.config.capabilities, [fixture.requirement])
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.error.code).toBe('UNSUPPORTED_CAPABILITY')
  })

  it('accepts the requirement sets derived from the sample requests', () => {
    expect(checkAllCapabilities(textFlexConfig.capabilities, textStructuredRequirements).ok).toBe(true)
    expect(checkAllCapabilities(musicStudioConfig.capabilities, musicSubmitRequirements).ok).toBe(true)
    expect(checkAllCapabilities(textFlexConfig.capabilities, speechSynthesizeRequirements).ok).toBe(false)
  })
})

describe('derived requirements', () => {
  it('includes the declared input size and the cover voice kind', () => {
    const requirements = deriveMusicRequirements(musicSubmitInputFixture)
    expect(requirements).toContainEqual({
      operation: 'submit',
      maxInputCharacters: musicSubmitInputFixture.prompt.length + (musicSubmitInputFixture.lyrics?.length ?? 0),
    })

    // A preset cover must not be treated as a cloned one, or a preset-only configuration would
    // refuse a request it can actually serve.
    const presetCover = {
      ...musicSubmitInputFixture,
      sourceAssetId: '11111111-1111-4111-8111-111111111111',
      voiceRef: 'preset:zh-female-01',
    }
    expect(deriveMusicRequirements(presetCover)).toContainEqual({ operation: 'submit', voiceKind: 'preset' })
    expect(deriveMusicRequirements({ ...presetCover, voiceRef: 'cloned:voice-01' })).toContainEqual({
      operation: 'submit',
      voiceKind: 'cloned',
    })
  })

  it('derives the voice kind of a speech request from its voice reference', () => {
    expect(deriveSpeechRequirements(speechSynthesizeInputFixture)).toContainEqual({
      operation: 'synthesize',
      voiceKind: 'preset',
    })
    expect(deriveSpeechRequirements({ ...speechSynthesizeInputFixture, voiceRef: 'cloned:voice-01' })).toContainEqual({
      operation: 'synthesize',
      voiceKind: 'cloned',
    })
  })

  it('requires audio output for music and speech requests', () => {
    // Both ports must deliver audio, so a configuration that only declares text output cannot
    // satisfy either request.
    expect(deriveMusicRequirements(musicSubmitInputFixture)).toContainEqual({
      operation: 'submit',
      outputType: 'audio',
    })
    expect(deriveSpeechRequirements(speechSynthesizeInputFixture)).toContainEqual({
      operation: 'synthesize',
      outputType: 'audio',
    })

    const textOnlyMusic: ProviderConfig = {
      ...musicStudioConfig,
      capabilities: { ...musicStudioConfig.capabilities, outputTypes: ['text'] },
    }
    expect(checkAllCapabilities(textOnlyMusic.capabilities, musicSubmitRequirements).ok).toBe(false)

    const textOnlySpeech: ProviderConfig = {
      ...ttsHdConfig,
      capabilities: { ...ttsHdConfig.capabilities, outputTypes: ['text'] },
    }
    expect(checkAllCapabilities(textOnlySpeech.capabilities, speechSynthesizeRequirements).ok).toBe(false)
  })

  it('refuses an over-long music prompt at quote time instead of inside a charged task', () => {
    const longRequest = {
      requestKey: musicSubmitInputFixture.requestKey,
      prompt: 'x'.repeat(600),
      instrumental: true,
      durationSeconds: 30,
      format: 'mp3',
      language: 'zh',
    }
    const route = selectProviderForNewRequest({
      kind: 'music',
      defaults: withMusicDefault(musicLiteConfig.providerConfigId),
      configs: providerConfigFixtures,
      requirements: deriveMusicRequirements(longRequest),
      now: providerFixtureCapturedAt,
    })
    expect(route.ok).toBe(false)
    if (!route.ok) expect(route.error.code).toBe('UNSUPPORTED_CAPABILITY')
  })
})

describe('switching the default provider', () => {
  it('selects the current default for a new request and freezes it into a snapshot', () => {
    const before = selectProviderForNewRequest({
      kind: 'text',
      defaults: providerDefaultFixtures,
      configs: providerConfigFixtures,
      now: providerFixtureCapturedAt,
    })
    expect(before.ok && before.config.adapterId).toBe('mock-text-flex')

    // Equivalent to PUT /admin/provider-defaults/text: later new requests see the new default.
    const after = selectProviderForNewRequest({
      kind: 'text',
      defaults: withTextDefault(textBasicConfig.providerConfigId),
      configs: providerConfigFixtures,
      now: providerFixtureCapturedAt,
    })
    expect(after.ok && after.config.adapterId).toBe('mock-text-basic')
  })

  it('refuses a new request when no default of that kind is published', () => {
    const route = selectProviderForNewRequest({
      kind: 'tts',
      defaults: [],
      configs: providerConfigFixtures,
      now: providerFixtureCapturedAt,
    })
    expect(route.ok).toBe(false)
    if (!route.ok) expect(route.error.code).toBe('PROVIDER_UNAVAILABLE')
  })

  it('refuses a new request whose requirements the default cannot satisfy', () => {
    // The lite music configuration is limited to short tracks, so the 90 second sample is
    // refused at quote time instead of failing inside a charged task.
    const route = selectProviderForNewRequest({
      kind: 'music',
      defaults: withMusicDefault(musicLiteConfig.providerConfigId),
      configs: providerConfigFixtures,
      requirements: musicSubmitRequirements,
      now: providerFixtureCapturedAt,
    })
    expect(route.ok).toBe(false)
    if (!route.ok) expect(route.error.code).toBe('UNSUPPORTED_CAPABILITY')
  })
})

describe('existing snapshots stay on their original configuration', () => {
  it('resolves a stored snapshot without reading the current defaults', () => {
    const snapshot = snapshotProvider(textFlexConfig, providerFixtureCapturedAt)
    // The defaults now point at another configuration, and the resolver does not even accept
    // them: an old quote, task or voice profile cannot move to a new provider.
    const switchedDefaults = withTextDefault(textBasicConfig.providerConfigId)
    expect(switchedDefaults.find(entry => entry.kind === 'text')?.providerConfigId).toBe(
      textBasicConfig.providerConfigId,
    )
    const resolved = resolveSnapshotRoute({ snapshot, configs: providerConfigFixtures })
    expect(resolved.ok).toBe(true)
    if (resolved.ok) expect(resolved.config.adapterId).toBe('mock-text-flex')
  })

  it('reports a disabled original configuration instead of switching providers', () => {
    const snapshot = snapshotProvider(musicStudioConfig, providerFixtureCapturedAt)
    const disabled = providerConfigFixtures.map(config =>
      config.providerConfigId === musicStudioConfig.providerConfigId ? { ...config, enabled: false } : config,
    )
    const resolved = resolveSnapshotRoute({ snapshot, configs: disabled })
    expect(resolved.ok).toBe(false)
    if (!resolved.ok) expect(resolved.error.code).toBe('PROVIDER_UNAVAILABLE')
  })

  it('reports a published version whose capabilities no longer match the snapshot', () => {
    const snapshot = snapshotProvider(textFlexConfig, providerFixtureCapturedAt)
    const drifted = providerConfigFixtures.map(config =>
      config.providerConfigId === textFlexConfig.providerConfigId
        ? {
            ...config,
            capabilities: { ...config.capabilities, limits: { ...config.capabilities.limits, maxInputCharacters: 100 } },
          }
        : config,
    )
    const resolved = resolveSnapshotRoute({ snapshot, configs: drifted })
    expect(resolved.ok).toBe(false)
    if (!resolved.ok) expect(resolved.error.code).toBe('UNSUPPORTED_CAPABILITY')
  })

  it('reports a published version whose parameter mapping drifted from the snapshot', () => {
    // Executing an old quote with a rewritten mapping would send different parameters than the
    // ones the user confirmed, so the frozen mapping is compared as well.
    const snapshot = snapshotProvider(textFlexConfig, providerFixtureCapturedAt)
    const drifted = providerConfigFixtures.map(config =>
      config.providerConfigId === textFlexConfig.providerConfigId
        ? { ...config, parameterMapping: { messages: 'renamed_messages' } }
        : config,
    )
    const resolved = resolveSnapshotRoute({ snapshot, configs: drifted })
    expect(resolved.ok).toBe(false)
    if (!resolved.ok) expect(resolved.error.code).toBe('PROVIDER_UNAVAILABLE')
  })

  it('reports a snapshot whose requirement set is no longer supported', () => {
    const snapshot = snapshotProvider(textBasicConfig, providerFixtureCapturedAt)
    const resolved = resolveSnapshotRoute({
      snapshot,
      configs: providerConfigFixtures,
      requirements: [{ operation: 'stream', mode: 'stream' }],
    })
    expect(resolved.ok).toBe(false)
    if (!resolved.ok) expect(resolved.error.code).toBe('UNSUPPORTED_CAPABILITY')
  })

  it('keeps a cloned voice profile on its original provider configuration', () => {
    // A voice profile stores the configuration id and version only, not a full snapshot, and
    // it follows the same rule: the current default never moves it to another provider.
    const voiceProfileRef = snapshotProvider(musicStudioConfig, providerFixtureCapturedAt).config
    const resolved = resolveConfigReferenceRoute({ config: voiceProfileRef, configs: providerConfigFixtures })
    expect(resolved.ok && resolved.config.adapterId).toBe('mock-music-studio')

    const disabled = providerConfigFixtures.map(config =>
      config.providerConfigId === musicStudioConfig.providerConfigId ? { ...config, enabled: false } : config,
    )
    const blocked = resolveConfigReferenceRoute({ config: voiceProfileRef, configs: disabled })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error.code).toBe('PROVIDER_UNAVAILABLE')
  })
})

describe('retry classification', () => {
  it.each(retryClassificationFixtures)('classifies $name as $expected', fixture => {
    const decision = classifyProviderFailure({
      code: fixture.code,
      stage: fixture.stage,
      ...(fixture.unknown ? { unknown: true } : {}),
    })
    expect(decision).toBe(fixture.expected)
  })

  it('never classifies a generation submit as safely retryable', () => {
    // A generic network retry on submit could produce a second charged generation.
    for (const code of ['PROVIDER_UNAVAILABLE', 'RATE_LIMITED', 'CONCURRENCY_LIMIT'] as const) {
      expect(classifyProviderFailure({ code, stage: 'submit' })).not.toBe('bounded-retry')
    }
  })
})
