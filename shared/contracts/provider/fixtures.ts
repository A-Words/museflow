import { providerConfigSchema, type ProviderConfig, type ProviderDefault, type ProviderErrorCode } from './common.js'
import { musicSubmitInputSchema, type MusicSubmitInput } from './music.js'
import { speechSynthesizeInputSchema, type SpeechSynthesizeInput } from './speech.js'
import { textGenerateInputSchema, type TextGenerateInput } from './text.js'
import {
  deriveMusicRequirements,
  deriveSpeechRequirements,
  deriveTextRequirements,
  type CapabilityRequirement,
  type ProviderStage,
  type RetryDecision,
} from './routing.js'

// Two controlled configurations per kind, used by T-26 (switch the default without touching
// business callers) and T-27 (old quotes, running tasks and voice profiles keep their
// original provider). Every fixture is validated by the published schema, so a sample can
// never drift from the contract. All entries are mocks: sourceMode is always 'mock'.

const ids = {
  textFlex: '11111111-1111-4111-8111-111111111111',
  textBasic: '22222222-2222-4222-8222-222222222222',
  musicStudio: '33333333-3333-4333-8333-333333333333',
  musicLite: '44444444-4444-4444-8444-444444444444',
  ttsHd: '55555555-5555-4555-8555-555555555555',
  ttsBasic: '66666666-6666-4666-8666-666666666666',
} as const

/** Fixed timestamp so snapshots and fixtures stay reproducible in tests. */
export const providerFixtureCapturedAt = '2026-09-22T00:00:00.000Z'

export const textFlexConfig: ProviderConfig = providerConfigSchema.parse({
  providerConfigId: ids.textFlex,
  providerKey: 'mock-text-flex',
  version: 1,
  kind: 'text',
  adapterId: 'mock-text-flex',
  modelId: 'mock-text-1',
  credentialRef: 'env:MOCK_TEXT_FLEX_KEY',
  capabilities: {
    kind: 'text',
    operations: ['generate', 'stream'],
    modes: ['sync', 'stream'],
    outputTypes: ['text', 'structured', 'tool-calls'],
    supports: { query: false, cancel: false, idempotentSubmit: true, callbacks: false, remoteDelete: false },
    limits: { maxInputCharacters: 32000, expectedCompletionSeconds: 30 },
  },
  parameterMapping: { messages: 'messages', maxOutputTokens: 'max_output_tokens' },
  enabled: true,
  sourceMode: 'mock',
})

export const textBasicConfig: ProviderConfig = providerConfigSchema.parse({
  providerConfigId: ids.textBasic,
  providerKey: 'mock-text-basic',
  version: 1,
  kind: 'text',
  adapterId: 'mock-text-basic',
  modelId: 'mock-text-1',
  credentialRef: 'env:MOCK_TEXT_BASIC_KEY',
  capabilities: {
    kind: 'text',
    operations: ['generate'],
    modes: ['sync'],
    outputTypes: ['text'],
    supports: { query: false, cancel: false, idempotentSubmit: false, callbacks: false, remoteDelete: false },
    limits: { maxInputCharacters: 2000, expectedCompletionSeconds: 30 },
  },
  parameterMapping: { messages: 'prompt' },
  enabled: true,
  sourceMode: 'mock',
})

export const musicStudioConfig: ProviderConfig = providerConfigSchema.parse({
  providerConfigId: ids.musicStudio,
  providerKey: 'mock-music-studio',
  version: 1,
  kind: 'music',
  adapterId: 'mock-music-studio',
  modelId: 'mock-music-1',
  credentialRef: 'env:MOCK_MUSIC_STUDIO_KEY',
  capabilities: {
    kind: 'music',
    operations: ['submit', 'query', 'cancel'],
    modes: ['async'],
    outputTypes: ['audio'],
    supports: { query: true, cancel: true, idempotentSubmit: true, callbacks: true, remoteDelete: true },
    limits: {
      maxInputCharacters: 4000,
      maxDurationSeconds: 180,
      maxOutputBytes: 52428800,
      audioFormats: ['mp3', 'wav'],
      languages: ['zh', 'en'],
      voiceKinds: ['preset', 'cloned'],
      expectedCompletionSeconds: 300,
    },
  },
  parameterMapping: { prompt: 'prompt', durationSeconds: 'duration', format: 'audio_format' },
  enabled: true,
  sourceMode: 'mock',
})

// The lite configuration keeps explicit limitations instead of faking abilities: it cannot
// cancel, cannot be queried, and accepts only short mono output. Its asynchronous result is
// recoverable through callbacks only, which is why callbacks stays true.
export const musicLiteConfig: ProviderConfig = providerConfigSchema.parse({
  providerConfigId: ids.musicLite,
  providerKey: 'mock-music-lite',
  version: 1,
  kind: 'music',
  adapterId: 'mock-music-lite',
  modelId: 'mock-music-lite-1',
  credentialRef: 'env:MOCK_MUSIC_LITE_KEY',
  capabilities: {
    kind: 'music',
    operations: ['submit'],
    modes: ['async'],
    outputTypes: ['audio'],
    supports: { query: false, cancel: false, idempotentSubmit: false, callbacks: true, remoteDelete: false },
    limits: {
      maxInputCharacters: 500,
      maxDurationSeconds: 30,
      audioFormats: ['mp3'],
      languages: ['zh', 'en'],
      voiceKinds: ['preset'],
      expectedCompletionSeconds: 60,
    },
  },
  parameterMapping: { prompt: 'text' },
  enabled: true,
  sourceMode: 'mock',
})

export const ttsHdConfig: ProviderConfig = providerConfigSchema.parse({
  providerConfigId: ids.ttsHd,
  providerKey: 'mock-tts-hd',
  version: 1,
  kind: 'tts',
  adapterId: 'mock-tts-hd',
  modelId: 'mock-tts-1',
  credentialRef: 'env:MOCK_TTS_HD_KEY',
  capabilities: {
    kind: 'tts',
    operations: ['synthesize', 'query', 'cancel'],
    modes: ['sync', 'async'],
    outputTypes: ['audio'],
    supports: { query: true, cancel: true, idempotentSubmit: true, callbacks: false, remoteDelete: true },
    limits: {
      maxInputCharacters: 5000,
      audioFormats: ['wav', 'mp3'],
      languages: ['zh', 'en', 'ja'],
      voiceKinds: ['preset', 'cloned'],
      expectedCompletionSeconds: 120,
    },
  },
  parameterMapping: { text: 'text', voiceRef: 'voice', sampleRateHz: 'sample_rate' },
  enabled: true,
  sourceMode: 'mock',
})

export const ttsBasicConfig: ProviderConfig = providerConfigSchema.parse({
  providerConfigId: ids.ttsBasic,
  providerKey: 'mock-tts-basic',
  version: 1,
  kind: 'tts',
  adapterId: 'mock-tts-basic',
  modelId: 'mock-tts-basic-1',
  credentialRef: 'env:MOCK_TTS_BASIC_KEY',
  capabilities: {
    kind: 'tts',
    operations: ['synthesize'],
    modes: ['sync'],
    outputTypes: ['audio'],
    supports: { query: false, cancel: false, idempotentSubmit: false, callbacks: false, remoteDelete: false },
    limits: {
      maxInputCharacters: 300,
      audioFormats: ['mp3'],
      languages: ['zh', 'en'],
      voiceKinds: ['preset'],
      expectedCompletionSeconds: 10,
    },
  },
  parameterMapping: { text: 'text' },
  enabled: true,
  sourceMode: 'mock',
})

/** The published set used by the registry and by the switching samples. */
export const providerConfigFixtures: readonly ProviderConfig[] = [
  textFlexConfig,
  textBasicConfig,
  musicStudioConfig,
  musicLiteConfig,
  ttsHdConfig,
  ttsBasicConfig,
]

/** Current default per kind: one row each, and only new requests read it. */
export const providerDefaultFixtures: readonly ProviderDefault[] = [
  { kind: 'text', providerConfigId: ids.textFlex, version: 1 },
  { kind: 'music', providerConfigId: ids.musicStudio, version: 1 },
  { kind: 'tts', providerConfigId: ids.ttsHd, version: 1 },
]

export const textFixtureRequestKey = 'mock-text-request-0001'
export const musicFixtureRequestKey = 'mock-music-request-0001'
export const speechFixtureRequestKey = 'mock-tts-request-0001'

export const textGenerateInputFixture: TextGenerateInput = textGenerateInputSchema.parse({
  requestKey: textFixtureRequestKey,
  messages: [{ role: 'user', content: '写一段关于夏夜城市灯光的歌词' }],
  responseFormat: 'text',
  purpose: 'lyrics',
})

export const textStreamInputFixture: TextGenerateInput = textGenerateInputSchema.parse({
  requestKey: textFixtureRequestKey,
  messages: [{ role: 'user', content: '帮我规划一次创作步骤' }],
  responseFormat: 'text',
  purpose: 'planning',
})

export const textStructuredInputFixture: TextGenerateInput = textGenerateInputSchema.parse({
  requestKey: textFixtureRequestKey,
  messages: [{ role: 'user', content: '输出歌词草稿的结构化提案' }],
  responseFormat: 'json',
  structuredSchemaRef: 'lyrics-draft-v1',
  purpose: 'structured',
})

export const musicSubmitInputFixture: MusicSubmitInput = musicSubmitInputSchema.parse({
  requestKey: musicFixtureRequestKey,
  prompt: 'city pop、梦幻合成器、女声',
  instrumental: false,
  lyrics: '夏夜的风吹过街角\n霓虹在雨里闪',
  durationSeconds: 90,
  format: 'mp3',
  language: 'zh',
})

export const speechSynthesizeInputFixture: SpeechSynthesizeInput = speechSynthesizeInputSchema.parse({
  requestKey: speechFixtureRequestKey,
  text: '欢迎使用 MuseFlow，开始你的创作。',
  voiceRef: 'preset:zh-female-01',
  language: 'zh',
  format: 'wav',
})

export interface CapabilityMismatchFixture {
  name: string
  description: string
  config: ProviderConfig
  requirement: CapabilityRequirement
}

// Refused before the call, never downgraded silently: this is the sample set behind
// "不同能力明确校验" in the backlog acceptance criteria.
export const capabilityMismatchFixtures: readonly CapabilityMismatchFixture[] = [
  {
    name: 'text-stream-on-basic',
    description: 'The basic text configuration has no stream mode',
    config: textBasicConfig,
    requirement: { operation: 'stream', mode: 'stream' },
  },
  {
    name: 'text-structured-on-basic',
    description: 'Structured output is not declared by the basic text configuration',
    config: textBasicConfig,
    requirement: { operation: 'generate', outputType: 'structured' },
  },
  {
    name: 'text-long-input-on-basic',
    description: 'The basic text configuration only accepts short inputs',
    config: textBasicConfig,
    requirement: { operation: 'generate', maxInputCharacters: 4000 },
  },
  {
    name: 'music-query-on-lite',
    description: 'The lite music configuration cannot be queried',
    config: musicLiteConfig,
    requirement: { operation: 'query', support: 'query' },
  },
  {
    name: 'music-cancel-on-lite',
    description: 'The lite music configuration cannot cancel a running request',
    config: musicLiteConfig,
    requirement: { operation: 'cancel', support: 'cancel' },
  },
  {
    name: 'music-long-duration-on-lite',
    description: 'The lite music configuration is limited to short tracks',
    config: musicLiteConfig,
    requirement: { operation: 'submit', maxDurationSeconds: 120 },
  },
  {
    name: 'music-wav-on-lite',
    description: 'The lite music configuration only returns mp3',
    config: musicLiteConfig,
    requirement: { operation: 'submit', audioFormat: 'wav' },
  },
  {
    name: 'speech-cloned-voice-on-basic',
    description: 'The basic speech configuration has no cloned voices',
    config: ttsBasicConfig,
    requirement: { operation: 'synthesize', voiceKind: 'cloned' },
  },
  {
    name: 'speech-wav-on-basic',
    description: 'The basic speech configuration only returns mp3',
    config: ttsBasicConfig,
    requirement: { operation: 'synthesize', audioFormat: 'wav' },
  },
  {
    name: 'speech-long-text-on-basic',
    description: 'The basic speech configuration only accepts short text',
    config: ttsBasicConfig,
    requirement: { operation: 'synthesize', maxInputCharacters: 1000 },
  },
  {
    name: 'speech-japanese-on-basic',
    description: 'The basic speech configuration does not support Japanese',
    config: ttsBasicConfig,
    requirement: { operation: 'synthesize', language: 'ja' },
  },
]

// Requirement sets derived from the fixture inputs, so samples stay tied to real requests.
export const textStreamRequirements: CapabilityRequirement[] = deriveTextRequirements(textStreamInputFixture, 'stream')
export const textStructuredRequirements: CapabilityRequirement[] = deriveTextRequirements(
  textStructuredInputFixture,
  'generate',
)
export const musicSubmitRequirements: CapabilityRequirement[] = deriveMusicRequirements(musicSubmitInputFixture)
export const speechSynthesizeRequirements: CapabilityRequirement[] = deriveSpeechRequirements(
  speechSynthesizeInputFixture,
)

export interface RetryClassificationFixture {
  name: string
  code: ProviderErrorCode
  stage: ProviderStage
  unknown?: boolean
  expected: RetryDecision
}

// Which behaviours may not be handled by a generic network retry. A generation submit is
// never resent automatically; an unknown result is reconciled instead of retried.
export const retryClassificationFixtures: readonly RetryClassificationFixture[] = [
  {
    name: 'generation-submit-unavailable',
    code: 'PROVIDER_UNAVAILABLE',
    stage: 'submit',
    expected: 'requote',
  },
  {
    name: 'generation-submit-rate-limited',
    code: 'RATE_LIMITED',
    stage: 'submit',
    expected: 'requote',
  },
  {
    name: 'generation-submit-concurrency',
    code: 'CONCURRENCY_LIMIT',
    stage: 'submit',
    expected: 'requote',
  },
  {
    name: 'generation-submit-content-rejected',
    code: 'CONTENT_REJECTED',
    stage: 'submit',
    expected: 'never',
  },
  {
    name: 'generation-submit-unknown-result',
    code: 'RESULT_UNKNOWN',
    stage: 'submit',
    expected: 'reconcile',
  },
  {
    name: 'submit-unknown-flag',
    code: 'PROVIDER_UNAVAILABLE',
    stage: 'submit',
    unknown: true,
    expected: 'reconcile',
  },
  {
    name: 'query-unavailable',
    code: 'PROVIDER_UNAVAILABLE',
    stage: 'query',
    expected: 'bounded-retry',
  },
  {
    name: 'query-rate-limited',
    code: 'RATE_LIMITED',
    stage: 'query',
    expected: 'bounded-retry',
  },
  {
    name: 'query-content-rejected',
    code: 'CONTENT_REJECTED',
    stage: 'query',
    expected: 'never',
  },
  {
    name: 'archive-unavailable',
    code: 'PROVIDER_UNAVAILABLE',
    stage: 'archive',
    expected: 'bounded-retry',
  },
  {
    name: 'cancel-unavailable',
    code: 'PROVIDER_UNAVAILABLE',
    stage: 'cancel',
    expected: 'bounded-retry',
  },
  {
    name: 'cancel-not-supported',
    code: 'CANCEL_NOT_SUPPORTED',
    stage: 'cancel',
    expected: 'never',
  },
  {
    // Handling a provider callback may include confirming the request with the provider.
    name: 'callback-confirmation-unavailable',
    code: 'PROVIDER_UNAVAILABLE',
    stage: 'callback',
    expected: 'bounded-retry',
  },
  {
    name: 'callback-content-rejected',
    code: 'CONTENT_REJECTED',
    stage: 'callback',
    expected: 'never',
  },
  {
    name: 'authentication-failed',
    code: 'AUTHENTICATION_FAILED',
    stage: 'submit',
    expected: 'never',
  },
  {
    name: 'invalid-input',
    code: 'INVALID_INPUT',
    stage: 'submit',
    expected: 'never',
  },
]
