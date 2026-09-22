/**
 * MF-03 两套可控配置 + 一套负向配置的能力声明样例。
 *
 * 用途：
 *   CONFIG_A_SYNC  —— 同步语义基线，验证 sync 下不提供 query/cancel
 *   CONFIG_B_ASYNC —— 异步语义默认，覆盖延迟/失败/未知/重复回调
 *   CONFIG_C_NO_IDEMPOTENCY —— 仅负向验证，禁止任何自动重发
 *
 * 重要：A 与 B 是同一供应商协议的两套可控 Mock。
 * 切换成功不能记为「两家真实供应商已验证」。
 *
 * 契约说明见 docs/PROVIDER_CONTRACT.md 第 7 节。
 */

import type {
  CapabilityDeclaration,
  ProviderConfig,
  ProviderSnapshot,
} from './types.ts'

const boundedRetry = (safeSubmit: boolean, safeQuery: boolean) =>
  ({
    safeToRetrySubmit: safeSubmit,
    safeToRetryQuery: safeQuery,
    maxAttemptsPerPhase: 3,
    backoff: 'bounded-exponential',
  }) as const

/* ------------------------------------------------------------ 配置 A：同步 */

const textSyncA: CapabilityDeclaration = {
  kind: 'text',
  adapterId: 'mock-sync-v1',
  tools: ['lyrics.generate'],
  executionMode: 'sync',
  streaming: false,
  supports: {
    query: false,
    cancel: false,
    idempotentSubmit: true,
    deleteRemote: false,
    callback: false,
  },
  specifications: [
    { specificationId: 'lyrics-basic', label: '基础歌词', credits: { currency: 'creation', amount: '8' } },
  ],
  languages: ['zh', 'en'],
  limits: { maxInputChars: 2000, maxOutputTokens: 2048 },
  errorMap: {
    invalid_parameter: 'INVALID_REQUEST',
    unauthorized: 'AUTH_FAILED',
    rate_limited: 'RATE_LIMITED',
  },
  networkRetry: boundedRetry(true, true),
}

const musicSyncA: CapabilityDeclaration = {
  kind: 'music',
  adapterId: 'mock-sync-v1',
  tools: ['music.generate'],
  executionMode: 'sync',
  streaming: false,
  supports: {
    query: false,
    cancel: false,
    idempotentSubmit: true,
    deleteRemote: false,
    callback: false,
  },
  specifications: [
    { specificationId: 'music-30s-vocal', durationMs: 30000, label: '30 秒人声', credits: { currency: 'creation', amount: '24' } },
    { specificationId: 'music-60s-instrumental', durationMs: 60000, label: '60 秒纯音乐', credits: { currency: 'creation', amount: '40' } },
  ],
  languages: ['zh', 'en'],
  formats: ['mp3'],
  limits: { maxInputChars: 1000, maxBytes: 20_000_000, maxDurationMs: 60000 },
  errorMap: {
    invalid_parameter: 'INVALID_REQUEST',
    unauthorized: 'AUTH_FAILED',
    content_policy: 'CONTENT_REJECTED',
  },
  networkRetry: boundedRetry(true, true),
}

const ttsSyncA: CapabilityDeclaration = {
  kind: 'tts',
  adapterId: 'mock-sync-v1',
  tools: ['speech.synthesize'],
  executionMode: 'sync',
  streaming: false,
  supports: {
    query: false,
    cancel: false,
    idempotentSubmit: true,
    deleteRemote: false,
    callback: false,
  },
  specifications: [
    { specificationId: 'speech-short', label: '短文本语音', credits: { currency: 'voice', amount: '6' } },
  ],
  voices: [
    { voiceRef: 'preset:zh-female-1', namespace: 'preset', language: 'zh', deletable: false },
    { voiceRef: 'preset:en-male-1', namespace: 'preset', language: 'en', deletable: false },
  ],
  languages: ['zh', 'en'],
  formats: ['mp3', 'wav'],
  limits: { maxInputChars: 1000, maxBytes: 10_000_000 },
  errorMap: {
    invalid_voice: 'UNSUPPORTED_CAPABILITY',
    unauthorized: 'AUTH_FAILED',
  },
  networkRetry: boundedRetry(true, true),
}

/* ------------------------------------------------------------ 配置 B：异步 */

const textAsyncB: CapabilityDeclaration = {
  kind: 'text',
  adapterId: 'mock-async-v1',
  tools: ['lyrics.generate'],
  executionMode: 'async',
  streaming: true,
  supports: {
    query: true,
    cancel: true,
    idempotentSubmit: true,
    deleteRemote: false,
    callback: true,
  },
  specifications: [
    { specificationId: 'lyrics-basic', label: '基础歌词', credits: { currency: 'creation', amount: '8' } },
    { specificationId: 'lyrics-extended', label: '扩展结构歌词', credits: { currency: 'creation', amount: '12' } },
  ],
  languages: ['zh', 'en', 'ja'],
  limits: { maxInputChars: 4000, maxOutputTokens: 4096 },
  errorMap: {
    invalid_parameter: 'INVALID_REQUEST',
    unauthorized: 'AUTH_FAILED',
    rate_limited: 'RATE_LIMITED',
    quota_exceeded: 'QUOTA_EXHAUSTED',
  },
  networkRetry: boundedRetry(true, true),
}

const musicAsyncB: CapabilityDeclaration = {
  kind: 'music',
  adapterId: 'mock-async-v1',
  tools: ['music.generate'],
  executionMode: 'async',
  streaming: false,
  supports: {
    query: true,
    cancel: true,
    idempotentSubmit: true,
    deleteRemote: true,
    callback: true,
  },
  specifications: [
    { specificationId: 'music-30s-vocal', durationMs: 30000, label: '30 秒人声', credits: { currency: 'creation', amount: '24' } },
    { specificationId: 'music-60s-instrumental', durationMs: 60000, label: '60 秒纯音乐', credits: { currency: 'creation', amount: '40' } },
    { specificationId: 'music-180s-vocal', durationMs: 180000, label: '180 秒人声', credits: { currency: 'creation', amount: '96' } },
  ],
  languages: ['zh', 'en', 'ja'],
  formats: ['mp3', 'wav'],
  limits: { maxInputChars: 2000, maxBytes: 50_000_000, maxDurationMs: 180000 },
  errorMap: {
    invalid_parameter: 'INVALID_REQUEST',
    unauthorized: 'AUTH_FAILED',
    content_policy: 'CONTENT_REJECTED',
    rate_limited: 'RATE_LIMITED',
  },
  networkRetry: boundedRetry(true, true),
}

const ttsAsyncB: CapabilityDeclaration = {
  kind: 'tts',
  adapterId: 'mock-async-v1',
  tools: ['speech.synthesize'],
  executionMode: 'async',
  streaming: false,
  supports: {
    query: true,
    cancel: true,
    idempotentSubmit: true,
    deleteRemote: true,
    callback: true,
  },
  specifications: [
    { specificationId: 'speech-short', label: '短文本语音', credits: { currency: 'voice', amount: '6' } },
    { specificationId: 'speech-long', label: '长文本语音', credits: { currency: 'voice', amount: '15' } },
  ],
  voices: [
    { voiceRef: 'preset:zh-female-1', namespace: 'preset', language: 'zh', deletable: false },
    { voiceRef: 'preset:zh-male-1', namespace: 'preset', language: 'zh', deletable: false },
    { voiceRef: 'preset:en-male-1', namespace: 'preset', language: 'en', deletable: false },
    { voiceRef: 'clone:user-voice-1', namespace: 'clone', language: 'zh', deletable: true },
  ],
  languages: ['zh', 'en', 'ja'],
  formats: ['mp3', 'wav', 'opus'],
  limits: { maxInputChars: 5000, maxBytes: 20_000_000 },
  errorMap: {
    invalid_voice: 'UNSUPPORTED_CAPABILITY',
    unauthorized: 'AUTH_FAILED',
    consent_required: 'CONSENT_REQUIRED',
  },
  networkRetry: boundedRetry(true, true),
}

/* ---------------------------------------- 配置 C：不支持幂等（仅负向验证） */

const musicNoIdempotencyC: CapabilityDeclaration = {
  kind: 'music',
  adapterId: 'mock-no-idempotency-v1',
  tools: ['music.generate'],
  executionMode: 'async',
  streaming: false,
  supports: {
    // 供应商不提供幂等键语义 —— 必须诚实声明为 false。
    query: false,
    cancel: false,
    idempotentSubmit: false,
    deleteRemote: false,
    callback: false,
  },
  specifications: [
    { specificationId: 'music-30s-vocal', durationMs: 30000, label: '30 秒人声', credits: { currency: 'creation', amount: '24' } },
  ],
  languages: ['zh'],
  formats: ['mp3'],
  limits: { maxInputChars: 500 },
  errorMap: {},
  // 提交不可重试：缺少幂等键语义时重试会重复生成并重复计费。
  networkRetry: boundedRetry(false, false),
}

/* --------------------------------------------------------------- 配置导出 */

export const CONFIG_A_SYNC: ProviderConfig[] = [
  {
    providerConfigId: 'aaaaaaaa-0000-4000-8000-000000000001',
    version: 1,
    providerKey: 'mock-text-sync',
    kind: 'text',
    adapterId: 'mock-sync-v1',
    modelId: 'mock-text-1',
    credentialRef: 'secret://mock/text-a',
    capabilities: textSyncA,
    parameterMappingVersion: 1,
    enabled: true,
  },
  {
    providerConfigId: 'aaaaaaaa-0000-4000-8000-000000000002',
    version: 1,
    providerKey: 'mock-music-sync',
    kind: 'music',
    adapterId: 'mock-sync-v1',
    modelId: 'mock-music-1',
    credentialRef: 'secret://mock/music-a',
    capabilities: musicSyncA,
    parameterMappingVersion: 1,
    enabled: true,
  },
  {
    providerConfigId: 'aaaaaaaa-0000-4000-8000-000000000003',
    version: 1,
    providerKey: 'mock-tts-sync',
    kind: 'tts',
    adapterId: 'mock-sync-v1',
    modelId: 'mock-tts-1',
    credentialRef: 'secret://mock/tts-a',
    capabilities: ttsSyncA,
    parameterMappingVersion: 1,
    enabled: true,
  },
]

export const CONFIG_B_ASYNC: ProviderConfig[] = [
  {
    providerConfigId: 'ffffffff-0000-4000-8000-000000000001',
    version: 2,
    providerKey: 'mock-text-async',
    kind: 'text',
    adapterId: 'mock-async-v1',
    modelId: 'mock-text-2',
    credentialRef: 'secret://mock/text-b',
    capabilities: textAsyncB,
    parameterMappingVersion: 2,
    enabled: true,
  },
  {
    providerConfigId: 'ffffffff-0000-4000-8000-000000000002',
    version: 2,
    providerKey: 'mock-music-async',
    kind: 'music',
    adapterId: 'mock-async-v1',
    modelId: 'mock-music-2',
    credentialRef: 'secret://mock/music-b',
    capabilities: musicAsyncB,
    parameterMappingVersion: 2,
    enabled: true,
  },
  {
    providerConfigId: 'ffffffff-0000-4000-8000-000000000003',
    version: 2,
    providerKey: 'mock-tts-async',
    kind: 'tts',
    adapterId: 'mock-async-v1',
    modelId: 'mock-tts-2',
    credentialRef: 'secret://mock/tts-b',
    capabilities: ttsAsyncB,
    parameterMappingVersion: 2,
    enabled: true,
  },
]

export const CONFIG_C_NO_IDEMPOTENCY: ProviderConfig[] = [
  {
    providerConfigId: 'cccccccc-0000-4000-8000-000000000001',
    version: 1,
    providerKey: 'mock-music-no-idem',
    kind: 'music',
    adapterId: 'mock-no-idempotency-v1',
    modelId: 'mock-music-c',
    credentialRef: 'secret://mock/music-c',
    capabilities: musicNoIdempotencyC,
    parameterMappingVersion: 1,
    enabled: true,
  },
]

export const ALL_CONFIGS: ProviderConfig[] = [
  ...CONFIG_A_SYNC,
  ...CONFIG_B_ASYNC,
  ...CONFIG_C_NO_IDEMPOTENCY,
]

/**
 * 构造报价/任务用的配置快照。
 * 不含凭据；capabilitiesHash 用于判断恢复原配置时能力是否发生实质变化。
 */
export function toSnapshot(config: ProviderConfig, specificationId: string): ProviderSnapshot {
  return {
    providerConfigId: config.providerConfigId,
    version: config.version,
    kind: config.kind,
    providerKey: config.providerKey,
    adapterId: config.adapterId,
    modelId: config.modelId,
    specificationId,
    capabilitiesHash: hashCapabilities(config.capabilities),
    parameterMappingVersion: config.parameterMappingVersion,
  }
}

/** 稳定的能力哈希：键排序后序列化，保证同一声明得到同一哈希。 */
export function hashCapabilities(declaration: CapabilityDeclaration): string {
  const canonical = JSON.stringify(declaration, (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
    }
    return value
  })
  // 确定性 64 位 FNV-1a。仅用于契约自检，不用于安全用途。
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= BigInt(canonical.charCodeAt(i))
    hash = (hash * prime) & mask
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`
}
