/**
 * MF-03 契约自检入口。无需测试框架，无网络、无账号、无数据库。
 *
 *   node mock/providers/check-contract.ts
 *
 * 覆盖 docs/PROVIDER_CONTRACT.md 第 7.4 节的 CM-01 ~ CM-12 与第 4.2 节声明校验。
 * 注意：这只验证契约一致性，不代表任何真实供应商能力已验收。
 */

import {
  CONFIG_A_SYNC,
  CONFIG_B_ASYNC,
  CONFIG_C_NO_IDEMPOTENCY,
  hashCapabilities,
  toSnapshot,
} from './configs.ts'
import {
  mayRetry,
  requireCancel,
  requireQuery,
  resolveSnapshot,
  validateDeclaration,
  validateMusicRequest,
  validateForQuote,
  validateSpeechRequest,
} from './capability-mismatch.ts'
import { MockMusicAdapter, MockSpeechAdapter, MockTextAdapter } from './mock-adapter.ts'
import type { ProviderConfig, TraceContext } from './types.ts'

const trace: TraceContext = { requestId: 'req-1', taskId: 'task-1' }

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1
    console.log(`  PASS  ${label}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title: string): void {
  console.log(`\n${title}`)
}

function find(configs: ProviderConfig[], kind: ProviderConfig['kind']): ProviderConfig {
  const found = configs.find(c => c.kind === kind)
  if (!found) throw new Error(`Missing ${kind} config in sample set.`)
  return found
}

async function main(): Promise<void> {
  const musicA = find(CONFIG_A_SYNC, 'music')
  const musicB = find(CONFIG_B_ASYNC, 'music')
  const ttsA = find(CONFIG_A_SYNC, 'tts')
  const ttsB = find(CONFIG_B_ASYNC, 'tts')
  const textA = find(CONFIG_A_SYNC, 'text')
  const textB = find(CONFIG_B_ASYNC, 'text')
  const musicC = CONFIG_C_NO_IDEMPOTENCY[0]!

  /* ---------------------------------------------- 声明自身的完整性 */
  section('声明完整性校验（第 4.2 节）')
  for (const config of [musicA, musicB, ttsA, ttsB, textA, textB, musicC]) {
    const result = validateDeclaration(config.capabilities)
    check(`declaration valid: ${config.providerKey}`, result.ok, result.error?.message)
  }
  check(
    'sync 声明 query=true 被拒绝',
    !validateDeclaration({ ...musicA.capabilities, supports: { ...musicA.capabilities.supports, query: true } }).ok,
  )
  check(
    '安全重试但无幂等被拒绝',
    !validateDeclaration({
      ...musicB.capabilities,
      supports: { ...musicB.capabilities.supports, idempotentSubmit: false },
    }).ok,
  )

  /* ------------------------------------------------------ CM-01 ~ CM-02 */
  section('CM-01 / CM-02 工具与规格不匹配（报价阶段）')
  const cm01 = validateForQuote(musicA.capabilities, 'speech.synthesize', 'music-30s-vocal')
  check('CM-01 工具不在能力内 → UNSUPPORTED_CAPABILITY', !cm01.ok && cm01.error?.code === 'UNSUPPORTED_CAPABILITY')
  const cm02 = validateForQuote(musicB.capabilities, 'music.generate', 'music-999s-imaginary')
  check('CM-02 规格不存在 → UNSUPPORTED_CAPABILITY', !cm02.ok && cm02.error?.code === 'UNSUPPORTED_CAPABILITY')

  /* ------------------------------------------------------ CM-03 ~ CM-04 */
  section('CM-03 / CM-04 参数级边界（创建任务时）')
  const cm03 = validateMusicRequest(musicA.capabilities, {
    prompt: 'a calm piano piece',
    specificationId: 'music-30s-vocal',
    instrumental: true,
    trace,
  })
  check('CM-03 纯音乐按工具能力拦截', cm03.ok || cm03.error?.code === 'UNSUPPORTED_CAPABILITY')
  const cm04 = validateMusicRequest(musicA.capabilities, {
    prompt: 'a calm piano piece',
    specificationId: 'music-30s-vocal',
    language: 'ja',
    trace,
  })
  check('CM-04 不支持语言 → UNSUPPORTED_CAPABILITY', !cm04.ok && cm04.error?.code === 'UNSUPPORTED_CAPABILITY')

  /* ------------------------------------------------------ CM-05 / CM-11 */
  section('CM-05 / CM-11 音色与克隆授权')
  const cm05 = validateSpeechRequest(ttsA.capabilities, {
    text: 'hello',
    voiceRef: 'clone:user-voice-1',
    language: 'zh',
    specificationId: 'speech-short',
    trace,
  })
  check('CM-05 同步配置无克隆音色 → 拒绝', !cm05.ok && cm05.error?.code === 'UNSUPPORTED_CAPABILITY')
  const cm11 = validateSpeechRequest(
    ttsB.capabilities,
    { text: 'hello', voiceRef: 'clone:user-voice-1', language: 'zh', specificationId: 'speech-short', trace },
    'revoked',
  )
  check('CM-11 已撤销档案 → CONSENT_REQUIRED', !cm11.ok && cm11.error?.code === 'CONSENT_REQUIRED')
  const cm11b = validateSpeechRequest(
    ttsB.capabilities,
    { text: 'hello', voiceRef: 'clone:user-voice-1', language: 'zh', specificationId: 'speech-short', trace },
    'active',
  )
  check('CM-11b active 档案 + 支持克隆 → 通过', cm11b.ok, cm11b.error?.message)

  /* ------------------------------------------------------ CM-06 / CM-07 */
  section('CM-06 / CM-07 查询与取消能力限制')
  const cm06 = requireCancel(musicA.capabilities)
  check(
    'CM-06 不支持取消 → CANCEL_NOT_SUPPORTED',
    !cm06.ok && (cm06.error?.message.includes('CANCEL_NOT_SUPPORTED') ?? false),
  )
  const cm07 = requireQuery(musicA.capabilities)
  check('CM-07 不支持查询 → 明确限制', !cm07.ok && cm07.error?.code === 'UNSUPPORTED_CAPABILITY')

  /* ------------------------------------------------------ CM-08 ~ CM-10 */
  section('CM-08 / CM-09 / CM-10 配置切换与快照路由')
  const snapshotA = toSnapshot(musicA, 'music-30s-vocal')
  const cm08 = resolveSnapshot(snapshotA, {
    providerConfigId: musicA.providerConfigId,
    enabled: true,
    capabilities: musicA.capabilities,
  })
  check('CM-08 切换后旧报价仍解析到原配置（A）', cm08.ok, cm08.error?.message)
  const cm09 = resolveSnapshot(snapshotA, {
    providerConfigId: musicA.providerConfigId,
    enabled: false,
    capabilities: musicA.capabilities,
  })
  check('CM-09 原配置被禁用 → PROVIDER_UNAVAILABLE（不改用新默认）', !cm09.ok && cm09.error?.code === 'PROVIDER_UNAVAILABLE')
  const cm10 = resolveSnapshot(snapshotA, {
    providerConfigId: musicB.providerConfigId,
    enabled: true,
    capabilities: musicB.capabilities,
  })
  check('CM-10 拒绝路由到非快照配置', !cm10.ok && cm10.error?.code === 'PROVIDER_UNAVAILABLE')
  check(
    '快照不含凭据（capabilitiesHash 本身不是凭据）',
    !Object.keys(snapshotA).some(k => /credential|secret|apikey|token/i.test(k)),
  )
  const allIds = [...CONFIG_A_SYNC, ...CONFIG_B_ASYNC, ...CONFIG_C_NO_IDEMPOTENCY].map(c => c.providerConfigId)
  check('每套配置的 providerConfigId 唯一', new Set(allIds).size === allIds.length)
  check('快照序列化不含凭据引用', !JSON.stringify(snapshotA).includes('secret://'))
  check('能力哈希稳定', hashCapabilities(musicB.capabilities) === hashCapabilities(musicB.capabilities))
  check(
    '不同声明的哈希不同',
    hashCapabilities(musicA.capabilities) !== hashCapabilities(musicB.capabilities),
  )

  /* ------------------------------------------------------------ CM-12 */
  section('CM-12 结果未知时禁止自动重发')
  const cm12 = mayRetry(musicB.capabilities, 'submit', 'unknown')
  check('CM-12 unknown 后提交重试被拒绝', !cm12.ok && cm12.error?.code === 'NETWORK_UNKNOWN')
  check(
    '非幂等配置的提交重试被拒绝',
    !mayRetry(musicC.capabilities, 'submit', 'rejected').ok,
  )
  check('查询可安全重试（B）', mayRetry(musicB.capabilities, 'query', 'accepted').ok)
  check('流式禁止自动重连重放', !mayRetry(textB.capabilities, 'stream', 'accepted').ok)

  /* ------------------------------------------------ Mock 行为注入验证 */
  section('Mock 行为注入：延迟 / 失败 / 未知 / 重复回调')
  const okAdapter = new MockMusicAdapter(musicB.capabilities, { submit: 'accepted', delayMs: 1 })
  const accepted = await okAdapter.submit({
    prompt: 'calm piano',
    specificationId: 'music-30s-vocal',
    trace,
  })
  check('accepted 返回 providerRef', accepted.outcome === 'accepted' && Boolean(accepted.providerRef?.requestId))
  check('sourceMode 标记为 mock', accepted.sourceMode === 'mock')

  const failAdapter = new MockMusicAdapter(musicB.capabilities, { submit: 'rejected' })
  const rejected = await failAdapter.submit({ prompt: 'x', specificationId: 'music-30s-vocal', trace })
  check('明确失败 → rejected 且可安全释放', rejected.outcome === 'rejected' && rejected.error?.retryable === false)

  const unknownAdapter = new MockMusicAdapter(musicB.capabilities, { submit: 'unknown' })
  const unknown = await unknownAdapter.submit({ prompt: 'x', specificationId: 'music-30s-vocal', trace })
  check(
    '网络不确定 → unknown（不得判为 rejected）',
    unknown.outcome === 'unknown' && unknown.error?.code === 'NETWORK_UNKNOWN',
  )

  const throwAdapter = new MockMusicAdapter(musicB.capabilities, { submit: 'throw' })
  const thrown = await throwAdapter.submit({ prompt: 'x', specificationId: 'music-30s-vocal', trace })
  check('适配器异常也被转换成 unknown，不抛给业务层', thrown.outcome === 'unknown')

  const dupAdapter = new MockMusicAdapter(musicB.capabilities, {
    submit: 'accepted',
    duplicateCallbacks: 3,
  })
  const dupSubmit = await dupAdapter.submit({ prompt: 'x', specificationId: 'music-30s-vocal', trace })
  let callbackCount = 0
  for await (const _event of dupAdapter.callbacks(dupSubmit.providerRef!)) callbackCount += 1
  check('重复回调可注入（供去重键验证）', callbackCount === 4, `got ${callbackCount}`)

  const oooAdapter = new MockMusicAdapter(musicB.capabilities, {
    submit: 'accepted',
    outOfOrderCallback: true,
  })
  const oooSubmit = await oooAdapter.submit({ prompt: 'x', specificationId: 'music-30s-vocal', trace })
  const order: string[] = []
  for await (const event of oooAdapter.callbacks(oooSubmit.providerRef!)) order.push(event.status)
  check('乱序回调可注入（先终态后运行中）', order[0] === 'succeeded' && order[1] === 'running', order.join(','))

  const querySeq = new MockMusicAdapter(musicB.capabilities, {
    submit: 'accepted',
    querySequence: ['accepted', 'completed'],
  })
  const seqSubmit = await querySeq.submit({ prompt: 'x', specificationId: 'music-30s-vocal', trace })
  const first = await querySeq.query(seqSubmit.providerRef!)
  const second = await querySeq.query(seqSubmit.providerRef!)
  check('查询按脚本推进 accepted → completed', first.outcome === 'accepted' && second.outcome === 'completed')

  const noQuery = new MockMusicAdapter(musicA.capabilities, { submit: 'success' })
  const noQueryResult = await noQuery.query({ providerKey: 'mock', requestId: 'r1' })
  check('无查询能力时不伪造结果', noQueryResult.outcome === 'unknown')

  const syncMusicResult = await new MockMusicAdapter(musicA.capabilities, {}).submit({
    prompt: 'x',
    specificationId: 'music-30s-vocal',
    trace,
  })
  check(
    '同步配置 submit 直接 completed 并带产物',
    syncMusicResult.outcome === 'completed' && (syncMusicResult.artifacts?.length ?? 0) > 0,
  )
  check('产物带稳定 outputSlot', Boolean(syncMusicResult.artifacts?.[0]?.outputSlot))

  const ttsAdapter = new MockSpeechAdapter(ttsB.capabilities, {})
  const speech = await ttsAdapter.synthesize({
    text: '你好',
    voiceRef: 'preset:zh-female-1',
    language: 'zh',
    specificationId: 'speech-short',
    trace,
  })
  check(
    'Speech 异步配置返回 accepted（由执行模式决定，不由脚本默认值决定）',
    speech.outcome === 'accepted',
    `got ${speech.outcome}`,
  )
  const speechQuery = await ttsAdapter.query(speech.providerRef!)
  check(
    'Speech 产物携带音色/语言/格式元数据',
    speechQuery.outcome === 'completed' &&
      speechQuery.artifacts?.[0]?.meta.voiceRef === 'preset:zh-female-1' &&
      speechQuery.artifacts?.[0]?.meta.language === 'zh',
  )

  const ttsSync = new MockSpeechAdapter(ttsA.capabilities, {})
  const speechSync = await ttsSync.synthesize({
    text: '你好',
    voiceRef: 'preset:zh-female-1',
    language: 'zh',
    specificationId: 'speech-short',
    trace,
  })
  check('Speech 同步配置直接 completed', speechSync.outcome === 'completed')

  const textStream = new MockTextAdapter(textB.capabilities, {}, true)
  let deltas = ''
  let finished = false
  for await (const event of textStream.stream({ purpose: 'plan', messages: [{ role: 'user', content: 'hi' }], trace })) {
    if (event.type === 'text-delta') deltas += event.delta
    if (event.type === 'finish') finished = true
  }
  check('Text 流式：增量拼接 + finish 事件', deltas.length > 0 && finished)

  const textNoStream = new MockTextAdapter(textA.capabilities, {}, true)
  let streamErrorCode: string | undefined
  for await (const event of textNoStream.stream({ purpose: 'plan', messages: [], trace })) {
    if (event.type === 'error') streamErrorCode = event.error.code
  }
  check('同步配置不提供 stream → UNSUPPORTED_CAPABILITY', streamErrorCode === 'UNSUPPORTED_CAPABILITY')

  const unknownStream = new MockTextAdapter(textB.capabilities, { submit: 'unknown' }, true)
  let sawError = false
  for await (const event of unknownStream.stream({ purpose: 'plan', messages: [], trace })) {
    if (event.type === 'error') sawError = true
  }
  check('流内错误通过事件表达', sawError)

  /* ------------------------------------------------------- T-26 切换 */
  section('T-26 切换默认并调用相同业务工具')
  const sameRequest = {
    prompt: 'a warm evening song',
    specificationId: 'music-30s-vocal',
    trace: { requestId: 'req-t26', taskId: 'task-t26' },
  }
  const resultFromA = await new MockMusicAdapter(musicA.capabilities, {}).submit(sameRequest)
  const resultFromB = await new MockMusicAdapter(musicB.capabilities, { submit: 'accepted' }).submit(sameRequest)
  check('相同业务调用在 A 为 sync、B 为 async，调用方代码零改动', resultFromA.outcome === 'completed' && resultFromB.outcome === 'accepted')
  check('两套配置使用不同 adapterId', musicA.adapterId !== musicB.adapterId)

  /* ---------------------------------------------------------- 汇总 */
  console.log(`\n${'-'.repeat(52)}`)
  console.log(`契约自检：${passed} 通过 / ${failed} 失败`)
  console.log('注意：以上均为可控 Mock，不代表任何真实供应商能力已验证。')
  if (failed > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error('契约自检异常终止：', error)
  process.exitCode = 1
})
