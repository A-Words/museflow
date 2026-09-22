/**
 * MF-03 可脚本驱动的 Mock 适配器。
 *
 * 遵守与真实适配器同一契约，不出现只有 Mock 才有的返回形态。
 * 可注入：延迟、明确失败、结果未知、重复回调。
 *
 * 不得调用网络、不得读取凭据、不得写入数据库。
 * 输出一律标记 sourceMode: 'mock'，不得默默冒充真实结果。
 *
 * 契约说明见 docs/PROVIDER_CONTRACT.md 第 3、6、8 节。
 */

import type {
  Artifact,
  CancelResult,
  CapabilityDeclaration,
  MusicRequest,
  MusicResult,
  ProviderError,
  ProviderRef,
  SpeechRequest,
  SpeechResult,
  TextRequest,
  TextResult,
  TextStreamEvent,
  TokenUsage,
} from './types.ts'

/** Mock 的行为脚本。每个阶段可独立注入一种行为。 */
export interface MockScript {
  /** 模拟网络延迟（毫秒）。 */
  delayMs?: number
  /** 提交阶段的行为。默认 'success'。 */
  submit?: 'success' | 'accepted' | 'rejected' | 'unknown' | 'throw'
  /** 查询阶段的行为脚本：按调用次数依次取用，用尽后取最后一项。 */
  querySequence?: Array<'completed' | 'accepted' | 'rejected' | 'unknown'>
  /** 取消阶段的行为。 */
  cancel?: 'completed' | 'rejected' | 'unknown'
  /** 拒绝/未知时使用的标准错误码。 */
  errorCode?: ProviderError['code']
  /** 注入的重复回调次数（模拟重复投递）。 */
  duplicateCallbacks?: number
  /** 注入的乱序回调：先投递终态，再投递较早的事件。 */
  outOfOrderCallback?: boolean
}

const DEFAULT_SCRIPT: MockScript = { submit: 'success', delayMs: 0 }

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve()
}

function buildError(code: ProviderError['code'], message: string, retryable: boolean): ProviderError {
  return { code, message, retryable }
}

function audioArtifact(slot: string, durationMs: number): Artifact {
  return {
    kind: 'audio',
    outputSlot: slot,
    source: { type: 'url', url: `mock://artifacts/${slot}.mp3` },
    mimeType: 'audio/mpeg',
    bytes: 1024 * 256,
    durationMs,
    meta: { provider: 'mock', generatedBy: 'MF-03 contract sample' },
  }
}

function lyricsArtifact(slot: string, text: string): Artifact {
  return {
    kind: 'lyrics',
    outputSlot: slot,
    source: { type: 'inline', base64: Buffer.from(text, 'utf8').toString('base64') },
    mimeType: 'text/plain; charset=utf-8',
    meta: { provider: 'mock', structureVersion: '1' },
  }
}

/**
 * 可脚本驱动的 Mock 适配器。
 * 同时实现 Music 与 Speech 端口；Text 由 mockTextAdapter 提供。
 */
export class MockMusicAdapter {
  readonly kind = 'music' as const
  private readonly script: MockScript
  private readonly declaration: CapabilityDeclaration
  private queryCallCount = 0
  private readonly refs = new Map<string, MusicRequest>()
  /** 记录所有发出的回调，供重复/乱序验证使用。 */
  readonly emittedCallbacks: Array<{ requestId: string; status: string }> = []

  constructor(declaration: CapabilityDeclaration, script: MockScript = {}) {
    this.declaration = declaration
    this.script = { ...DEFAULT_SCRIPT, ...script }
  }

  async submit(req: MusicRequest): Promise<MusicResult> {
    await sleep(this.script.delayMs ?? 0)
    const behaviour = this.script.submit ?? 'success'

    if (behaviour === 'throw') {
      // 适配器内部异常也必须转换成 unknown，不能把原始异常抛给业务层。
      return {
        outcome: 'unknown',
        error: buildError('INTERNAL_ERROR', 'Mock adapter threw before confirming acceptance.', false),
        sourceMode: 'mock',
      }
    }

    if (behaviour === 'rejected') {
      return {
        outcome: 'rejected',
        error: buildError(
          this.script.errorCode ?? 'INVALID_REQUEST',
          'Mock rejected the request without side effects.',
          false,
        ),
        sourceMode: 'mock',
      }
    }

    const requestId = `mock-${req.trace.taskId ?? 'no-task'}-${this.refs.size + 1}`
    const providerRef: ProviderRef = { providerKey: 'mock', requestId }
    this.refs.set(requestId, req)

    if (behaviour === 'unknown') {
      // 关键：供应商可能已受理，因此必须 unknown，而不是 rejected。
      return {
        outcome: 'unknown',
        providerRef,
        error: buildError('NETWORK_UNKNOWN', 'Connection dropped after request may have been received.', false),
        sourceMode: 'mock',
      }
    }

    if (behaviour === 'accepted') {
      return { outcome: 'accepted', providerRef, sourceMode: 'mock' }
    }

    // 同步语义：submit 直接产出结果。
    return {
      outcome: 'completed',
      providerRef,
      artifacts: [
        audioArtifact(`audio-${req.trace.taskId ?? requestId}`, this.durationFor(req.specificationId)),
      ],
      sourceMode: 'mock',
    }
  }

  async query(ref: ProviderRef): Promise<MusicResult> {
    await sleep(this.script.delayMs ?? 0)
    if (!this.declaration.supports.query) {
      // 不提供查询能力时保留明确限制，不伪造查询结果。
      return {
        outcome: 'unknown',
        error: buildError('UNSUPPORTED_CAPABILITY', 'This configuration does not support query.', false),
        sourceMode: 'mock',
      }
    }

    const seq = this.script.querySequence ?? ['completed']
    const step = seq[Math.min(this.queryCallCount, seq.length - 1)] ?? 'completed'
    this.queryCallCount += 1
    const req = this.refs.get(ref.requestId)

    if (step === 'accepted') {
      return { outcome: 'accepted', providerRef: ref, sourceMode: 'mock' }
    }
    if (step === 'rejected') {
      return {
        outcome: 'rejected',
        providerRef: ref,
        error: buildError(this.script.errorCode ?? 'CONTENT_REJECTED', 'Generation terminated without artifacts.', false),
        sourceMode: 'mock',
      }
    }
    if (step === 'unknown') {
      // 查询失败不等同于生成失败。
      return {
        outcome: 'unknown',
        providerRef: ref,
        error: buildError('NETWORK_UNKNOWN', 'Query failed; remote state cannot be determined.', false),
        sourceMode: 'mock',
      }
    }

    const specId = req?.specificationId ?? 'music-30s-vocal'
    return {
      outcome: 'completed',
      providerRef: ref,
      artifacts: [audioArtifact(`audio-${ref.requestId}`, this.durationFor(specId))],
      sourceMode: 'mock',
    }
  }

  async cancel(ref: ProviderRef): Promise<CancelResult> {
    await sleep(this.script.delayMs ?? 0)
    if (!this.declaration.supports.cancel) {
      return {
        outcome: 'unknown',
        error: buildError('UNSUPPORTED_CAPABILITY', 'This configuration does not support cancel.', false),
      }
    }
    const behaviour = this.script.cancel ?? 'completed'
    if (behaviour === 'rejected') {
      return {
        outcome: 'rejected',
        error: buildError('INVALID_REQUEST', 'Remote confirmed the request could not be cancelled.', false),
      }
    }
    if (behaviour === 'unknown') {
      return {
        outcome: 'unknown',
        error: buildError('NETWORK_UNKNOWN', 'Cancel result cannot be confirmed.', false),
      }
    }
    return { outcome: 'completed' }
  }

  /**
   * 模拟供应商回调。用于验证重复投递与乱序事件。
   * 重复回调必须能被任务服务的去重键拦截，不得反转已提交终态。
   */
  async *callbacks(ref: ProviderRef): AsyncIterable<{ requestId: string; status: string }> {
    const events = this.script.outOfOrderCallback
      ? [
          { requestId: ref.requestId, status: 'succeeded' },
          { requestId: ref.requestId, status: 'running' },
        ]
      : [{ requestId: ref.requestId, status: 'succeeded' }]

    for (const event of events) {
      this.emittedCallbacks.push(event)
      yield event
    }
    const duplicates = this.script.duplicateCallbacks ?? 0
    for (let i = 0; i < duplicates; i += 1) {
      const event = { requestId: ref.requestId, status: 'succeeded' }
      this.emittedCallbacks.push(event)
      yield event
    }
  }

  private durationFor(specificationId: string): number {
    const spec = this.declaration.specifications.find(s => s.specificationId === specificationId)
    return spec?.durationMs ?? 30000
  }
}

/** Text 端口的 Mock。支持同步返回与流式增量。 */
export class MockTextAdapter {
  readonly kind = 'text' as const
  private readonly script: MockScript
  private readonly declaration: CapabilityDeclaration
  readonly provided: boolean

  constructor(declaration: CapabilityDeclaration, script: MockScript = {}, provideStream = false) {
    this.declaration = declaration
    this.script = { ...DEFAULT_SCRIPT, ...script }
    this.provided = provideStream && declaration.streaming
  }

  async generate(req: TextRequest): Promise<TextResult> {
    await sleep(this.script.delayMs ?? 0)
    const behaviour = this.script.submit ?? 'success'

    if (behaviour === 'rejected') {
      return {
        outcome: 'rejected',
        error: buildError(this.script.errorCode ?? 'INVALID_REQUEST', 'Mock rejected the text request.', false),
        sourceMode: 'mock',
      }
    }
    if (behaviour === 'unknown') {
      return {
        outcome: 'unknown',
        error: buildError('NETWORK_UNKNOWN', 'Text response could not be determined.', false),
        sourceMode: 'mock',
      }
    }

    const text = '晚风把街灯轻轻点亮\n我把今天折进了行囊'
    const usage: TokenUsage = { inputTokens: 42, outputTokens: 28 }
    return {
      outcome: 'completed',
      text,
      finishReason: 'stop',
      usage,
      sourceMode: 'mock',
    }
  }

  /** 仅当能力声明 streaming: true 时提供。 */
  async *stream(req: TextRequest): AsyncIterable<TextStreamEvent> {
    if (!this.declaration.streaming) {
      yield {
        type: 'error',
        error: buildError('UNSUPPORTED_CAPABILITY', 'Streaming is not supported by this configuration.', false),
      }
      return
    }
    const chunks = ['晚风把街灯', '轻轻点亮\n', '我把今天', '折进了行囊']
    for (const delta of chunks) {
      await sleep(this.script.delayMs ?? 0)
      yield { type: 'text-delta', delta }
    }
    if (this.script.submit === 'unknown') {
      // 流开始后的错误通过事件表达，不改变 HTTP 状态。
      yield {
        type: 'error',
        error: buildError('NETWORK_UNKNOWN', 'Stream interrupted before completion.', false),
      }
      return
    }
    yield { type: 'finish', finishReason: 'stop', usage: { inputTokens: 42, outputTokens: 28 } }
  }
}

/** Speech 端口的 Mock。复用 Music 的结果语义，额外携带音色/语言/格式元数据。 */
export class MockSpeechAdapter {
  readonly kind = 'tts' as const
  private readonly script: MockScript
  private readonly declaration: CapabilityDeclaration
  private readonly refs = new Map<string, SpeechRequest>()

  constructor(declaration: CapabilityDeclaration, script: MockScript = {}) {
    this.declaration = declaration
    this.script = { ...DEFAULT_SCRIPT, ...script }
  }

  async synthesize(req: SpeechRequest): Promise<SpeechResult> {
    await sleep(this.script.delayMs ?? 0)
    const behaviour = this.script.submit ?? 'success'
    // Speech 的异步提交由能力声明决定，而不是由脚本默认值决定。
    const isAsync = this.declaration.executionMode === 'async'

    if (behaviour === 'rejected') {
      return {
        outcome: 'rejected',
        error: buildError(this.script.errorCode ?? 'INVALID_REQUEST', 'Mock rejected the speech request.', false),
        sourceMode: 'mock',
      }
    }

    const requestId = `mock-tts-${req.trace.taskId ?? 'no-task'}-${this.refs.size + 1}`
    const providerRef: ProviderRef = { providerKey: 'mock', requestId }
    this.refs.set(requestId, req)

    if (behaviour === 'unknown') {
      return {
        outcome: 'unknown',
        providerRef,
        error: buildError('NETWORK_UNKNOWN', 'Speech request may have been received.', false),
        sourceMode: 'mock',
      }
    }
    // 异步配置返回 accepted；同步配置直接产出结果。
    if (behaviour === 'accepted' || isAsync) {
      return { outcome: 'accepted', providerRef, sourceMode: 'mock' }
    }

    return { outcome: 'completed', providerRef, artifacts: [this.buildArtifact(req, requestId)], sourceMode: 'mock' }
  }

  async query(ref: ProviderRef): Promise<SpeechResult> {
    await sleep(this.script.delayMs ?? 0)
    if (!this.declaration.supports.query) {
      return {
        outcome: 'unknown',
        error: buildError('UNSUPPORTED_CAPABILITY', 'This configuration does not support query.', false),
        sourceMode: 'mock',
      }
    }
    const req = this.refs.get(ref.requestId)
    if (!req) {
      return {
        outcome: 'unknown',
        providerRef: ref,
        error: buildError('NETWORK_UNKNOWN', 'Unknown provider reference.', false),
        sourceMode: 'mock',
      }
    }
    return { outcome: 'completed', providerRef: ref, artifacts: [this.buildArtifact(req, ref.requestId)], sourceMode: 'mock' }
  }

  /** 产物必须携带音色、语言、格式元数据，用于归档与来源追溯（T-05）。 */
  private buildArtifact(req: SpeechRequest, requestId: string): Artifact {
    const artifact = audioArtifact(`speech-${req.trace.taskId ?? requestId}`, 8000)
    artifact.meta = {
      ...artifact.meta,
      voiceRef: req.voiceRef,
      language: req.language,
      format: req.format ?? 'mp3',
      voiceNamespace: req.voiceRef.split(':')[0] ?? 'preset',
    }
    return artifact
  }

  async cancel(ref: ProviderRef): Promise<CancelResult> {
    if (!this.declaration.supports.cancel) {
      return {
        outcome: 'unknown',
        error: buildError('UNSUPPORTED_CAPABILITY', 'This configuration does not support cancel.', false),
      }
    }
    const behaviour = this.script.cancel ?? 'completed'
    if (behaviour === 'completed') return { outcome: 'completed' }
    return {
      outcome: behaviour,
      error: buildError('NETWORK_UNKNOWN', 'Cancel result cannot be confirmed.', false),
    }
  }

  /** 供 lyrics 用途之外的工具复用：生成可读歌词产物。 */
  static lyricsArtifact(assetId: string, text: string): Artifact {
    return lyricsArtifact(assetId, text)
  }
}
