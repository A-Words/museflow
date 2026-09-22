/**
 * MF-03 Provider 内部契约 —— 类型定义。
 *
 * 这里是「应用内部端口」的类型，不是任何供应商的 SDK 类型。
 * 业务模块只能依赖本文件的类型，不得依赖某个供应商的响应格式。
 * 契约说明见 docs/PROVIDER_CONTRACT.md。
 */

export type ProviderKind = 'text' | 'music' | 'tts'

/** 标准错误码。供应商原始错误码经适配器 errorMap 映射到这些取值。 */
export type ProviderErrorCode =
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_CAPABILITY'
  | 'CONSENT_REQUIRED'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'CONTENT_REJECTED'
  | 'PROVIDER_UNAVAILABLE'
  | 'NETWORK_UNKNOWN'
  | 'INTERNAL_ERROR'

/**
 * 操作的统一结果语义。rejected 与 unknown 的区分是契约核心：
 * 只有能确认「供应商没有接受请求」时才允许 rejected；
 * 任何网络不确定性一律 unknown。
 */
export type Outcome =
  | 'completed'
  | 'accepted'
  | 'rejected'
  | 'unknown'
  | 'unsupported'

export interface ProviderError {
  code: ProviderErrorCode
  message: string
  /** 供应商原始错误码，仅用于诊断，不向前端暴露原文。 */
  providerCode?: string
  retryable: boolean
  requestId?: string
}

export interface TraceContext {
  requestId: string
  conversationId?: string
  toolCallId?: string
  taskId?: string
}

export type SourceMode = 'mock' | 'real'

/** 产物描述。归档由任务服务/MF-10 负责，Provider 只负责交付结构。 */
export interface Artifact {
  kind: 'lyrics' | 'audio' | 'cover' | 'voice_sample'
  /** 稳定槽位标识，用于构造防重存储键；(taskId, outputSlot) 唯一。 */
  outputSlot: string
  /** 受信任 Provider 返回的受控地址，或内联字节。不接受任意用户传入地址。 */
  source: { type: 'url'; url: string } | { type: 'inline'; base64: string }
  mimeType: string
  bytes?: number
  durationMs?: number
  meta: Record<string, string>
}

export interface ProviderRef {
  providerKey: string
  requestId: string
}

export interface TokenUsage {
  inputTokens?: number
  outputTokens?: number
}

/* ------------------------------------------------------------------ Text */

export interface TextMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ToolDeclaration {
  name: string
  description: string
  parameters: JsonSchema
}

export type JsonSchema = Record<string, unknown>

export interface TextRequest {
  /** plan 为 Agent 规划调用（走规划预算，不收费）；lyrics 为收费的歌词工具调用。 */
  purpose: 'plan' | 'lyrics'
  messages: TextMessage[]
  tools?: ToolDeclaration[]
  outputSchema?: JsonSchema
  maxOutputTokens?: number
  trace: TraceContext
}

export interface ToolProposal {
  index: number
  name: string
  /** 仅建议，不构成可执行动作；未完成的增量参数不可执行。 */
  arguments: unknown
}

export interface TextResult {
  outcome: Extract<Outcome, 'completed' | 'rejected' | 'unknown'>
  text?: string
  /** 已按 outputSchema 校验通过的结构化值。 */
  structured?: unknown
  toolProposals?: ToolProposal[]
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'other'
  usage?: TokenUsage
  error?: ProviderError
  sourceMode: SourceMode
}

export type TextStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-proposal'; index: number; name: string; argumentsDelta: string }
  | { type: 'finish'; finishReason: string; usage?: TokenUsage }
  | { type: 'error'; error: ProviderError }

/* ----------------------------------------------------------------- Music */

export interface MusicRequest {
  prompt: string
  /** 来自服务端能力表，不是用户任意填写的时长。 */
  specificationId: string
  lyrics?: { assetId: string; text: string }
  instrumental?: boolean
  language?: string
  trace: TraceContext
}

export interface MusicResult {
  outcome: Extract<Outcome, 'completed' | 'accepted' | 'rejected' | 'unknown'>
  providerRef?: ProviderRef
  artifacts?: Artifact[]
  error?: ProviderError
  sourceMode: SourceMode
}

export interface CancelResult {
  outcome: Extract<Outcome, 'completed' | 'rejected' | 'unknown'>
  error?: ProviderError
}

/* ---------------------------------------------------------------- Speech */

export interface SpeechRequest {
  text: string
  /** 预置音色与私人克隆音色使用不同命名空间，由服务端解析并校验归属。 */
  voiceRef: string
  language: string
  specificationId: string
  format?: string
  trace: TraceContext
}

export type SpeechResult = MusicResult
export type SpeechQueryResult = MusicResult

/* ------------------------------------------------------------ 能力声明 */

export interface Specification {
  specificationId: string
  durationMs?: number
  label: string
  credits: { currency: 'creation' | 'voice'; amount: string }
}

export interface VoiceDeclaration {
  voiceRef: string
  namespace: 'preset' | 'clone'
  language: string
  /** 供应商侧删除能力；克隆音色需要单独验证。 */
  deletable: boolean
}

export interface CapabilityLimits {
  maxInputChars?: number
  maxOutputTokens?: number
  maxBytes?: number
  maxDurationMs?: number
}

export interface NetworkRetryPolicy {
  /**
   * 提交是否可安全重试。必须与 supports.idempotentSubmit 一致：
   * 缺少幂等语义时提交不可重试，否则可能重复生成并重复计费。
   */
  safeToRetrySubmit: boolean
  safeToRetryQuery: boolean
  maxAttemptsPerPhase: number
  backoff: 'bounded-exponential'
}

export interface CapabilityDeclaration {
  kind: ProviderKind
  adapterId: string
  tools: string[]
  executionMode: 'sync' | 'async'
  streaming: boolean
  supports: {
    query: boolean
    cancel: boolean
    idempotentSubmit: boolean
    deleteRemote: boolean
    callback: boolean
  }
  specifications: Specification[]
  voices?: VoiceDeclaration[]
  languages?: string[]
  formats?: string[]
  limits: CapabilityLimits
  /** 供应商原始错误码 → 标准错误码。未映射的错误归入 INTERNAL_ERROR 并按 unknown 处理。 */
  errorMap: Record<string, ProviderErrorCode>
  networkRetry: NetworkRetryPolicy
}

/* -------------------------------------------------- 配置与快照 */

export interface ProviderConfig {
  providerConfigId: string
  /** 递增整数，(providerKey, version) 唯一，发布后不可覆盖。 */
  version: number
  providerKey: string
  kind: ProviderKind
  adapterId: string
  modelId: string
  baseUrl?: string
  /** 凭据引用，不是凭据本身；不得在报价/快照/前端/日志中展开。 */
  credentialRef?: string
  capabilities: CapabilityDeclaration
  parameterMappingVersion: number
  enabled: boolean
}

/** 报价与任务保存的配置引用。不含凭据，含恢复原配置所需的引用与哈希。 */
export interface ProviderSnapshot {
  providerConfigId: string
  version: number
  kind: ProviderKind
  providerKey: string
  adapterId: string
  modelId: string
  specificationId: string
  capabilitiesHash: string
  parameterMappingVersion: number
}

/* ------------------------------------------------------- 端口接口 */

export interface TextCapabilityPort {
  readonly kind: 'text'
  generate(req: TextRequest): Promise<TextResult>
  /** 仅当 capabilities.streaming 为 true 时提供。 */
  stream?(req: TextRequest): AsyncIterable<TextStreamEvent>
}

export interface MusicCapabilityPort {
  readonly kind: 'music'
  submit(req: MusicRequest): Promise<MusicResult>
  /** 仅当 capabilities.supports.query 为 true 时提供。 */
  query?(ref: ProviderRef): Promise<MusicResult>
  /** 仅当 capabilities.supports.cancel 为 true 时提供。 */
  cancel?(ref: ProviderRef): Promise<CancelResult>
}

export interface SpeechCapabilityPort {
  readonly kind: 'tts'
  synthesize(req: SpeechRequest): Promise<SpeechResult>
  query?(ref: ProviderRef): Promise<SpeechQueryResult>
  cancel?(ref: ProviderRef): Promise<CancelResult>
}
