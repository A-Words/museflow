/**
 * MF-03 能力校验与能力不匹配样例。
 *
 * 实现 docs/PROVIDER_CONTRACT.md 第 4.2 节的校验规则与第 7.4 节的 CM-01 ~ CM-12。
 *
 * 校验分三个时机（第 4.3 节）：
 *   validateForQuote    —— 报价时
 *   validateForTask     —— 创建任务时
 *   validateBeforeExec  —— 执行前
 */

import type {
  CapabilityDeclaration,
  ProviderError,
  ProviderSnapshot,
  SpeechRequest,
  MusicRequest,
  TextRequest,
} from './types.ts'

export interface ValidationResult {
  ok: boolean
  error?: ProviderError
}

const OK: ValidationResult = { ok: true }

function fail(code: ProviderError['code'], message: string): ValidationResult {
  return { ok: false, error: { code, message, retryable: false } }
}

/* ------------------------------------------------- 声明自身的完整性校验 */

/** 校验能力声明是否符合第 4.2 节的规则。用于后台发布配置前的拦截。 */
export function validateDeclaration(decl: CapabilityDeclaration): ValidationResult {
  if (decl.executionMode === 'sync' && decl.supports.query) {
    return fail('INVALID_REQUEST', 'executionMode=sync must not declare supports.query=true.')
  }
  if (decl.supports.cancel && decl.executionMode !== 'async') {
    return fail('INVALID_REQUEST', 'supports.cancel=true requires executionMode=async.')
  }
  // 提交可重试必须建立在幂等键语义之上，否则会重复生成并重复计费。
  if (decl.networkRetry.safeToRetrySubmit && !decl.supports.idempotentSubmit) {
    return fail(
      'INVALID_REQUEST',
      'networkRetry.safeToRetrySubmit=true requires supports.idempotentSubmit=true.',
    )
  }
  if (decl.specifications.length === 0) {
    return fail('INVALID_REQUEST', 'specifications must not be empty; pricing depends on it.')
  }
  if (decl.networkRetry.maxAttemptsPerPhase > 3) {
    return fail('INVALID_REQUEST', 'networkRetry.maxAttemptsPerPhase should be <= 3.')
  }
  return OK
}

/* --------------------------------------------------------- 报价时校验 */

/** CM-01 / CM-02：工具与规格必须在能力内，否则不签发报价。 */
export function validateForQuote(
  decl: CapabilityDeclaration,
  toolName: string,
  specificationId: string,
): ValidationResult {
  if (!decl.tools.includes(toolName)) {
    return fail('UNSUPPORTED_CAPABILITY', `Tool "${toolName}" is not declared by adapter "${decl.adapterId}".`)
  }
  if (!decl.specifications.some(s => s.specificationId === specificationId)) {
    return fail(
      'UNSUPPORTED_CAPABILITY',
      `Specification "${specificationId}" is not offered by adapter "${decl.adapterId}".`,
    )
  }
  return OK
}

/* ----------------------------------------------------- 创建任务时校验 */

/** CM-03 ~ CM-05：参数级能力边界，在调用 Provider 之前拦截。 */
export function validateMusicRequest(
  decl: CapabilityDeclaration,
  req: MusicRequest,
): ValidationResult {
  const quote = validateForQuote(decl, 'music.generate', req.specificationId)
  if (!quote.ok) return quote

  // CM-03：不支持纯音乐时明确拒绝，不静默降级为人声。
  if (req.instrumental && !decl.tools.includes('music.generate')) {
    return fail('UNSUPPORTED_CAPABILITY', 'Instrumental output is not supported.')
  }
  // CM-04：语言不在支持列表内。
  if (req.language && decl.languages && !decl.languages.includes(req.language)) {
    return fail(
      'UNSUPPORTED_CAPABILITY',
      `Language "${req.language}" is not supported. Supported: ${decl.languages.join(', ')}.`,
    )
  }
  if (decl.limits.maxInputChars && req.prompt.length > decl.limits.maxInputChars) {
    return fail('INVALID_REQUEST', `Prompt exceeds maxInputChars (${decl.limits.maxInputChars}).`)
  }
  return OK
}

/** CM-05 / CM-11：音色命名空间与克隆音色前置校验。 */
export function validateSpeechRequest(
  decl: CapabilityDeclaration,
  req: SpeechRequest,
  voiceProfileStatus?: 'active' | 'pending' | 'revoked' | 'deletion_pending' | 'deleted',
): ValidationResult {
  const quote = validateForQuote(decl, 'speech.synthesize', req.specificationId)
  if (!quote.ok) return quote

  const declared = decl.voices?.find(v => v.voiceRef === req.voiceRef)
  if (!declared) {
    // 预置音色与克隆音色使用不同命名空间，未知引用一律拒绝。
    return fail('UNSUPPORTED_CAPABILITY', `Voice "${req.voiceRef}" is not available in this configuration.`)
  }
  const declaredLanguages = decl.languages
  if (declaredLanguages && !declaredLanguages.includes(req.language)) {
    return fail(
      'UNSUPPORTED_CAPABILITY',
      `Language "${req.language}" is not supported. Supported: ${declaredLanguages.join(', ')}.`,
    )
  }
  if (req.format && decl.formats && !decl.formats.includes(req.format)) {
    return fail('UNSUPPORTED_CAPABILITY', `Format "${req.format}" is not supported.`)
  }
  // 克隆音色：能力必须支持，且档案必须为 active（FR-09）。
  if (declared.namespace === 'clone') {
    if (!decl.supports.query && !decl.voices?.some(v => v.namespace === 'clone')) {
      return fail('UNSUPPORTED_CAPABILITY', 'Clone voices are not supported by this configuration.')
    }
    if (voiceProfileStatus !== 'active') {
      return fail(
        'CONSENT_REQUIRED',
        `Voice profile is not active (status=${voiceProfileStatus ?? 'unknown'}).`,
      )
    }
  }
  return OK
}

export function validateTextRequest(
  decl: CapabilityDeclaration,
  req: TextRequest,
): ValidationResult {
  const toolName = req.purpose === 'lyrics' ? 'lyrics.generate' : undefined
  if (toolName) {
    const quote = validateForQuote(decl, toolName, decl.specifications[0]?.specificationId ?? '')
    if (!quote.ok) return quote
  }
  const totalChars = req.messages.reduce((sum, m) => sum + m.content.length, 0)
  if (decl.limits.maxInputChars && totalChars > decl.limits.maxInputChars) {
    return fail('INVALID_REQUEST', `Input exceeds maxInputChars (${decl.limits.maxInputChars}).`)
  }
  if (req.outputSchema && decl.streaming && !decl.supports.query) {
    // 结构化输出不应依赖流式增量解析。
    return fail('INVALID_REQUEST', 'outputSchema cannot rely on incremental stream parsing.')
  }
  return OK
}

/* --------------------------------------------------- 查询/取消能力校验 */

/** CM-06：不支持取消时返回明确限制，原任务继续，不释放冻结。 */
export function requireCancel(decl: CapabilityDeclaration): ValidationResult {
  if (!decl.supports.cancel) {
    return fail('UNSUPPORTED_CAPABILITY', 'CANCEL_NOT_SUPPORTED: this configuration cannot cancel in-flight work.')
  }
  return OK
}

/** CM-07：不支持查询时保留明确限制，不伪造查询结果。 */
export function requireQuery(decl: CapabilityDeclaration): ValidationResult {
  if (!decl.supports.query) {
    return fail('UNSUPPORTED_CAPABILITY', 'This configuration cannot query remote state.')
  }
  return OK
}

/* ------------------------------------------------- 配置切换与快照校验 */

/**
 * CM-08 / CM-09 / CM-10：
 * 校验旧报价仍可按其快照执行。切换默认配置不影响已签发快照。
 *
 * 原配置不可用时返回 PROVIDER_UNAVAILABLE，要求重新报价 —— 绝不自动改用新默认。
 */
export function resolveSnapshot(
  snapshot: ProviderSnapshot,
  currentConfig: { providerConfigId: string; enabled: boolean; capabilities: CapabilityDeclaration } | undefined,
): ValidationResult {
  if (!snapshot.providerConfigId) {
    return fail('PROVIDER_UNAVAILABLE', 'Snapshot has no providerConfigId; cannot restore original configuration.')
  }
  if (!currentConfig) {
    return fail('PROVIDER_UNAVAILABLE', 'Original provider configuration is no longer registered.')
  }
  // 快照指向原配置 —— 即使默认已切换，也不得路由到新默认。
  if (currentConfig.providerConfigId !== snapshot.providerConfigId) {
    return fail('PROVIDER_UNAVAILABLE', 'Resolved configuration does not match the snapshot; refusing to switch provider.')
  }
  if (!currentConfig.enabled) {
    return fail('PROVIDER_UNAVAILABLE', 'Original provider configuration is disabled; re-quote required.')
  }
  if (!currentConfig.capabilities.specifications.some(s => s.specificationId === snapshot.specificationId)) {
    return fail(
      'UNSUPPORTED_CAPABILITY',
      `Original configuration no longer offers specification "${snapshot.specificationId}".`,
    )
  }
  return OK
}

/* ------------------------------------------------ 网络不确定性的重试判定 */

/**
 * CM-12：判断某操作是否允许通用网络重试。
 * 这是契约里最关键的安全闸门 —— 结果未知时绝不允许自动重发提交。
 */
export function mayRetry(
  decl: CapabilityDeclaration,
  operation: 'submit' | 'query' | 'cancel' | 'stream',
  lastOutcome: 'completed' | 'accepted' | 'rejected' | 'unknown' | 'unsupported',
): ValidationResult {
  if (operation === 'stream') {
    return fail('INVALID_REQUEST', 'Streaming must not be auto-retried; record the interruption instead.')
  }
  if (lastOutcome === 'unknown') {
    return fail(
      'NETWORK_UNKNOWN',
      'Outcome is unknown: must enter reconciling and keep the reservation held. Auto-retry is forbidden.',
    )
  }
  if (operation === 'submit' && !decl.networkRetry.safeToRetrySubmit) {
    return fail(
      'NETWORK_UNKNOWN',
      'Submit is not idempotent for this configuration; auto-retry is forbidden.',
    )
  }
  if (operation === 'query' && !decl.networkRetry.safeToRetryQuery) {
    return fail('UNSUPPORTED_CAPABILITY', 'Query retry is not declared safe for this configuration.')
  }
  if (operation === 'cancel' && !decl.supports.cancel) {
    return fail('UNSUPPORTED_CAPABILITY', 'CANCEL_NOT_SUPPORTED: this configuration cannot cancel.')
  }
  return OK
}
