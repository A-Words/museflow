# Provider 内部契约

关联 [Issue #3](https://github.com/A-Words/museflow/issues/3)，需求 FR-11、NFR-02、NFR-05，验收用例 T-26、T-27。

状态：**实现级契约，已细化，运行时适配器尚未实现**。本文是[接口契约草案的 Provider 内部契约](API_CONTRACT.md#provider-内部契约)的展开，细化三类内部端口的操作签名、能力声明、配置版本、规范化输入输出和错误分类，并给出可控 Mock 的能力样例。本文不安装 SDK、不接通商业账号；真实适配器由 MF-11/12/13 实现。

本文与 `API_CONTRACT.md` 的 Provider 段落冲突时以本文为准，并同步修正 `API_CONTRACT.md`。数据表字段以[数据模型](DATA_MODEL.md)为准，任务状态与积分语义以[创作与积分流程](WORKFLOWS.md)为准，本文不重复定义。

## 1. 目标与边界

### 1.1 本项交付

| 交付物 | 位置 | 说明 |
| --- | --- | --- |
| 三类端口契约 | 本文第 3 节 | Text / Music / Speech 的操作、输入、输出和模式 |
| 能力声明结构 | 本文第 4 节 | 适配器可声明的能力边界与校验规则 |
| 配置版本与快照 | 本文第 5 节 | `providerConfigId` / 版本 / 快照的最小字段 |
| 规范化结果与错误 | 本文第 6 节 | 统一结果枚举、错误分类、重试策略矩阵 |
| 两套可控配置样例 | 本文第 7 节、`mock/providers/` | 满足 T-26 的切换测试基线 |
| Mock 行为参考实现 | `mock/providers/` | 可注入延迟、失败、未知、重复回调 |

### 1.2 不在本项范围

- 具体商业供应商、账号、预算和凭据（真实接入前确认）。
- 任务调度、状态机推进与账本结算（MF-07 / MF-08）。
- 附件归档的存储实现（MF-10）。
- 报价计算与价格规则（MF-07）。
- 前端页面与交互（MF-09 / MF-15）。

### 1.3 已确认的设计前提

沿用[架构文档](ARCHITECTURE.md#可切换供应商)已确认的规则，本项不再重新讨论：

1. 文本、音乐、TTS 分别建立能力接口，**不预先绑定商业服务商**。
2. Provider 只负责协议转换，**不修改任务终态、不修改钱包、不读用户身份**。
3. 网络不确定性必须表达为 `unknown`，**不能统一抛错后自动重试**。
4. 不支持的能力明确返回不可用，不伪造查询结果。
5. 配置式切换只覆盖协议兼容范围，新协议需要新增 adapter。

## 2. 术语与角色

| 术语 | 含义 |
| --- | --- |
| 能力接口（capability port） | 业务侧面向的稳定接口，分 Text / Music / Speech 三类，只有三类 |
| 适配器（adapter） | 某能力接口针对一个供应商协议的具体实现 |
| 配置（provider config） | 一次适配器绑定：adapter + model + 可选 baseUrl + 凭据引用 + 能力参数，带不可覆盖的版本号 |
| 默认配置（provider default） | 每个 `kind` 当前选中的配置版本，仅用于**新**报价与请求 |
| 配置快照（provider snapshot） | 报价与任务保存的配置引用，含恢复原配置所需字段，**不含密钥** |
| 任务服务（job service） | 持有任务状态机的唯一组件，Provider 只向它回报统一事件 |
| 规划调用 | Agent 的澄清/规划用文本调用，不向用户钱包收费，按规划预算处理 |
| 收费调用 | 经报价确认并创建任务的工具调用，走积分冻结与结算 |

## 3. 三类能力接口

所有操作的输入输出均为**规范化内部结构**，不暴露供应商原始字段。适配器内部负责协议转换，业务模块不得依赖任何供应商的响应格式。

### 3.1 公共返回语义

每个操作返回一个**判别联合（discriminated union）**，由 `outcome` 字段区分。这一结构对三类接口一致，使任务服务可以用同一套分支处理结果。

| `outcome` | 含义 | 任务服务必须做什么 |
| --- | --- | --- |
| `completed` | 结果已产出且可交付 | 校验并归档产物，成功后结算 |
| `accepted` | 已受理，尚未产出 | 保持 `running`，按能力声明的查询方式推进 |
| `rejected` | 明确拒绝，且**未产生**任何副作用 | 进入 `failed` 并释放冻结 |
| `unknown` | **不确定是否已受理或已产生副作用** | 进入 `reconciling`，保持冻结，禁止自动重发 |
| `unsupported` | 该操作在当前能力下不可用 | 前置拦截，不创建任务或明确返回不可用 |
| `streaming` | 流式增量（仅 Text） | 按协议映射转发，结束后归入 `completed` |

`rejected` 与 `unknown` 的区分是本契约的核心。**只有能够确认「供应商没有接受请求」时才允许使用 `rejected`**；任何网络超时、连接中断、响应无法解析、状态码不确定的情况一律 `unknown`。判断依据写入第 6.3 节。

### 3.2 Text 能力

```ts
interface TextCapability {
  generate(req: TextRequest): Promise<TextResult>
  stream?(req: TextRequest): AsyncIterable<TextStreamEvent>
}
```

`stream` 为可选方法，只有当能力声明 `streaming: true` 时才存在。

**TextRequest**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `purpose` | `'plan' \| 'lyrics'` | 是 | `plan` 为 Agent 规划调用（走规划预算）；`lyrics` 为歌词工具调用（收费） |
| `messages` | `TextMessage[]` | 是 | 规范化消息历史，`role` 为 `system`/`user`/`assistant` |
| `tools` | `ToolDeclaration[]?` | 否 | 允许模型选择的工具声明，来自 Tool Registry；`plan` 用途下可携带 |
| `outputSchema` | `JsonSchema?` | 否 | 要求结构化输出时的 schema；不能与 `streaming` 同时依赖增量解析 |
| `maxOutputTokens` | `number?` | 否 | 上限，受能力表约束 |
| `trace` | `TraceContext` | 是 | 关联 ID，用于可观察性（NFR-04） |

**TextResult（非流式）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `outcome` | `'completed' \| 'rejected' \| 'unknown'` | 见 3.1 |
| `text` | `string?` | `completed` 时的文本输出 |
| `structured` | `unknown?` | 要求结构化输出时，**已按 `outputSchema` 校验通过**的值 |
| `toolProposals` | `ToolProposal[]?` | 模型给出的工具建议；**仅为建议**，不构成可执行动作 |
| `finishReason` | `'stop' \| 'length' \| 'tool_calls' \| 'content_filter' \| 'other'` | 标准化结束原因 |
| `usage` | `TokenUsage?` | 可获得的用量；不可获得时为 `undefined`，不填 0 冒充 |
| `error` | `ProviderError?` | `rejected` / `unknown` 时的标准化错误 |

**TextStreamEvent**

| `type` | 载荷 | 说明 |
| --- | --- | --- |
| `text-delta` | `{ delta: string }` | 文本增量 |
| `tool-proposal` | `{ index, name, argumentsDelta }` | 工具建议增量，**未完成前不可执行** |
| `finish` | `{ finishReason, usage? }` | 正常结束 |
| `error` | `{ error: ProviderError }` | 流内错误，携带稳定错误码 |

流式响应在协议层映射为 AI SDK 原生 UI Message Stream（见 `API_CONTRACT.md#对话消息流与持久化`）。本契约只保证 `TextStreamEvent` 是标准化中间表示；**流开始后的错误不能改变 HTTP 状态**，由任务服务与 Agent 层按事件处理。

> **歌词工具的边界**：`lyrics.generate` 作为收费工具时，`purpose='lyrics'` 且必须经报价确认与任务流程。规划调用 `purpose='plan'` 不产生报价和任务，但需服务端频率、并发与每日预算限制。

### 3.3 Music 能力

```ts
interface MusicCapability {
  submit(req: MusicRequest): Promise<MusicSubmitResult>
  query?(ref: ProviderRef): Promise<MusicQueryResult>
  cancel?(ref: ProviderRef): Promise<MusicCancelResult>
}
```

**MusicRequest**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `prompt` | `string` | 是 | 提示词 |
| `specificationId` | `string` | 是 | **来自服务端能力表**，不是用户任意填写的时长 |
| `lyrics` | `{ assetId: string; text: string }?` | 否 | 已选定的歌词版本；`assetId` 用于产物来源标记 |
| `instrumental` | `boolean` | 否 | 纯音乐；仅当能力支持时才可选 |
| `language` | `string?` | 否 | 人声语言；能力不支持时拒绝 |
| `trace` | `TraceContext` | 是 | 关联 ID |

**MusicSubmitResult**

`outcome` 为 `completed` / `accepted` / `rejected` / `unknown`：

| 字段 | 说明 |
| --- | --- |
| `providerRef` | `accepted` 时必须返回，含供应商标识与请求 ID，供后续查询 |
| `artifacts` | `completed` 时返回可交付产物（见 3.5） |
| `capabilities` | `rejected` 时说明是哪项能力不匹配（对应 `UNSUPPORTED_CAPABILITY` 的细分） |
| `error` | 标准化错误 |

**MusicQueryResult** — `outcome` 为 `completed` / `accepted`（仍在进行）/ `rejected`（已终止无产物）/ `unknown`（查询本身失败或状态不可判读）。**查询失败不等同于生成失败**，必须返回 `unknown` 而非 `rejected`。

**MusicCancelResult** — `outcome` 为 `completed`（确认已取消）/ `rejected`（确认未能取消）/ `unknown`（无法确认）。能力声明 `cancel: false` 时**不提供该方法**，任务服务返回 `CANCEL_NOT_SUPPORTED` 并保留原任务，不得伪装成功。

### 3.4 Speech 能力

```ts
interface SpeechCapability {
  synthesize(req: SpeechRequest): Promise<SpeechResult>
  query?(ref: ProviderRef): Promise<SpeechQueryResult>
  cancel?(ref: ProviderRef): Promise<SpeechCancelResult>
}
```

**SpeechRequest**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `text` | `string` | 是 | 待合成文本 |
| `voiceRef` | `string` | 是 | 音色引用；**预置音色与私人克隆音色使用不同命名空间**，由服务端解析并校验归属 |
| `language` | `string` | 是 | 语言；能力不支持时拒绝 |
| `specificationId` | `string` | 是 | 来自服务端能力表 |
| `format` | `string` | 否 | 输出格式；能力不支持时拒绝 |
| `trace` | `TraceContext` | 是 | 关联 ID |

`SpeechResult` 复用 3.1 的统一结果语义。与 Music 的差异：**Speech 可以同步返回音频**（`outcome: 'completed'` 直接带产物），也可以走异步（`accepted` + `providerRef`）。是否同步由能力声明的 `executionMode` 给出，业务调用方不需要分别写两套流程。

无论同步或异步，产物都必须携带**音色、语言、格式**元数据，用于归档与来源追溯（T-05）。

> **克隆音色的额外前置**：使用克隆音色时，除本契约的能力校验外，还必须校验 `voice_profiles.status === 'active'` 且授权未撤销（FR-09）。这项校验由任务服务在**提交前和执行前各做一次**，不放在适配器内。

### 3.5 产物描述（Artifacts）

三类接口共用同一产物结构，供 MF-10 归档消费。

| 字段 | 说明 |
| --- | --- |
| `kind` | `lyrics` / `audio` / `cover` / `voice_sample` |
| `outputSlot` | 稳定的槽位标识，用于构造防重存储键；`(taskId, outputSlot)` 唯一 |
| `source` | **受信任 Provider 返回的受控地址**，或内联字节；不接受用户或模型传入的任意地址 |
| `mimeType` | 内容类型，归档时校验 |
| `bytes` | 声明大小，归档时与实际比对 |
| `durationMs` | 音频时长，可选 |
| `meta` | 音色、语言、格式、模型、供应商请求 ID 等来源信息 |
| `checksum` | 可选，供应商提供时校验一致性 |

**归档责任在任务服务，不在 Provider。** 适配器只负责把产物交给统一结构；下载、校验、暂存、幂等归档由 MF-10 的存储服务完成。适配器不得直接把文件写入最终位置。

## 4. 能力声明

能力声明是适配器的**自述边界**，用于前置拦截与报价、任务快照。

### 4.1 结构

```ts
interface CapabilityDeclaration {
  kind: 'text' | 'music' | 'tts'
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
  formatsSupported?: string[]

  limits: {
    maxInputChars?: number
    maxOutputTokens?: number
    maxBytes?: number
    maxDurationMs?: number
  }

  errorMap: Record<string, ProviderErrorCode>

  networkRetry: {
    safeToRetrySubmit: boolean
    safeToRetryQuery: boolean
    maxAttemptsPerPhase: number
    backoff: 'bounded-exponential'
  }
}
```

### 4.2 校验规则

| 规则 | 说明 |
| --- | --- |
| `tools` 必须属于本 `kind` 的合法工具集 | Text：`lyrics.generate`；Music：`music.generate`（P1 加 `music.cover`）；Speech：`speech.synthesize`（P1 加 `voice.clone`） |
| `executionMode: 'sync'` 时 `supports.query` 必须为 `false` | 同步结果无需查询；声明查询能力会造成误导 |
| `supports.cancel: true` 要求 `executionMode: 'async'` | 同步调用无取消语义 |
| `safeToRetrySubmit: true` **必须**同时 `supports.idempotentSubmit: true` | 缺少幂等键语义时提交不可重试，否则可能重复生成并重复计费 |
| `voidIdempotencyKey` 不成立 | 供应商不支持幂等键时必须诚实声明 `false`，不能假定"同一 key 只会执行一次" |
| `specifications` 不得为空 | 报价依赖规格表；空表意味着该配置不可用于创建任务 |
| `maxAttemptsPerPhase` 建议 ≤ 3 | 与 `WORKFLOWS.md` 的有界退避一致 |

### 4.3 能力校验的三种时机

| 时机 | 校验内容 | 失败结果 |
| --- | --- | --- |
| 报价时 | `specifications` 中存在该规格；工具在 `tools` 中 | 不签发报价，返回 `UNSUPPORTED_CAPABILITY` |
| 创建任务时 | 报价快照的能力仍然可读；账户与授权仍有效 | 不建任务或建后立即 `failed` 并释放 |
| 执行前 | 账户状态、声音授权、并发上限 | `failed`（未派发，安全释放） |

**报价快照的能力与当前默认配置无关。** 即使默认已切换，旧报价仍按其快照校验。

## 5. 配置版本与快照

### 5.1 配置字段

对应 `DATA_MODEL.md` 的 `provider_configs` 表：

| 字段 | 说明 |
| --- | --- |
| `providerConfigId` | 应用生成的 UUID v4 |
| `version` | 递增整数，`(provider_key, version)` 唯一，**发布后不可覆盖** |
| `kind` | `text` / `music` / `tts` |
| `adapterId` | 已注册适配器标识；只允许选择已注册 adapter |
| `modelId` | 供应商模型标识 |
| `baseUrl` | 可选；服务地址 |
| `credentialRef` | **服务端配置中的凭据引用**，不是凭据本身 |
| `capabilities` | 第 4 节的能力声明 |
| `parameterMapping` | 业务参数 → 供应商参数的映射 |
| `enabled` | 启停状态，可单独变更并审计 |

### 5.2 凭据处理规则

1. `credentialRef` 在报价、任务快照、前端响应、日志中**一律不展开为明文**。
2. 后台配置接口只显示**配置状态**（是否已设置、掩码），不返回凭据值（FR-08）。
3. 凭据通过引用在服务端读取与轮换；轮换不改配置版本号，但需审计。
4. 请求日志不得记录 Authorization 头、请求体中的密钥字段或供应商返回的凭据回显。

### 5.3 快照最小字段

报价与任务的 `providerSnapshot` 至少包含：

```json
{
  "providerConfigId": "<uuid>",
  "version": 3,
  "kind": "music",
  "adapterId": "mock-async-v1",
  "modelId": "mock-music-1",
  "specificationId": "music-30s-vocal",
  "capabilitiesHash": "<sha256 of capability declaration>",
  "parameterMappingVersion": 2
}
```

`capabilitiesHash` 用于在恢复原配置时判断能力是否发生了实质变化。**快照不含 `baseUrl` 之外的任何连接细节，且绝不含凭据。**

### 5.4 切换语义

| 场景 | 行为 |
| --- | --- |
| 切换默认配置 | 只影响**新**报价与新请求；已签发报价、在途任务、已有声音档案不变 |
| 旧报价未过期 | 仍按原配置执行；若原配置被禁用或能力不再可用 → `PROVIDER_UNAVAILABLE` / `UNSUPPORTED_CAPABILITY`，要求重新报价 |
| 在途任务查询/取消/恢复 | **必须**使用原配置，绝不读取新默认 |
| 文本流进行中 | 保留原请求连接；下一轮再读取新默认 |
| 声音档案 | 音色绑定原供应商，不随默认切换迁移 |
| 原配置不可用 | 要求重新报价确认或进入异常核对，**不能自动改用另一服务重复生成** |

## 6. 统一结果与错误分类

### 6.1 标准化错误码

| 错误码 | 含义 | 是否可重试 | 后续动作 |
| --- | --- | --- | --- |
| `INVALID_REQUEST` | 参数不合法，供应商明确拒绝 | 否 | 修正参数后重新报价 |
| `UNSUPPORTED_CAPABILITY` | 能力/规格/语言/音色不支持 | 否 | 前置拦截或改选参数 |
| `CONSENT_REQUIRED` | 缺少声音授权或使用声明 | 否 | 补授权（FR-09） |
| `AUTH_FAILED` | 凭据无效或过期 | 否 | 管理员修配置；**不自动重试** |
| `RATE_LIMITED` | 触发频率限制 | 是（退避） | 退避重试/查询；不新建收费任务 |
| `QUOTA_EXHAUSTED` | 供应商额度耗尽 | 否 | 提示不可用；告警管理员 |
| `CONTENT_REJECTED` | 内容安全拒绝 | 否 | `failed` 并释放，给出可理解原因 |
| `PROVIDER_UNAVAILABLE` | 服务不可用或原配置被禁用 | 视情况 | 不伪装成功；旧配置禁用时要求重新报价 |
| `NETWORK_UNKNOWN` | 网络不确定性 | **禁止通用重试** | 进入 `reconciling`，按 6.3 判定 |
| `INTERNAL_ERROR` | 供应商内部错误 | 视声明 | 提交阶段按 `unknown` 处理更安全 |

供应商原始错误码 → 标准码的映射由适配器的 `errorMap` 声明。**未映射的错误码一律归入 `INTERNAL_ERROR` 并按 `unknown` 处理**，不能默认当作明确失败。

### 6.2 重试策略矩阵

这是本契约对「哪些行为不能用通用重试处理」的明确回答。

| 操作 | 可否通用网络重试 | 前置条件 | 说明 |
| --- | --- | --- | --- |
| Text `generate`（规划） | ✅ 可 | 无 | 不产生账本副作用 |
| Text `generate`（歌词，已建任务） | ⚠️ 有条件 | 同 key 幂等 | 任务已建，重试必须复用同一幂等键 |
| Text `stream` | ❌ 不可 | — | 流中重试会造成重复输出；断线后由用户显式重试并保留原中断记录 |
| Music `submit` | ⚠️ **仅当 `safeToRetrySubmit: true`** | `supports.idempotentSubmit` | 无条件通用重试会重复生成并重复计费 |
| Music `query` | ✅ 可 | `supports.query` | 只读，幂等；有界退避，单阶段 ≤ 3 次 |
| Music `cancel` | ⚠️ 有条件 | `supports.cancel` | 需按最新状态判定；不可确认 → `unknown` |
| Speech `synthesize`（同步） | ⚠️ **仅当 `safeToRetrySubmit: true`** | 同 submit | 同步调用仍是计费副作用 |
| Speech `synthesize`（异步） | ⚠️ 同上 | 同 submit | — |
| 产物拉取/归档 | ✅ 可 | 已知远端请求标识 | **只重试拉取，不重新生成** |
| 回调接收 | ✅ 可（去重） | 验签 + 事件去重 | 重复/乱序事件不反转终态 |

**绝对禁止的通用重试**：

1. 结果未知（`NETWORK_UNKNOWN`）时自动重发提交 —— 可能造成用户被扣费两次。
2. 供应商未声明幂等能力时重试提交。
3. 流式响应中途自动重连并重放。
4. 无法确认取消结果时假定已取消并释放冻结。
5. 归档失败时重新生成产物（应只重试拉取）。

### 6.3 `rejected` 与 `unknown` 的判定规则

适配器按下表判定，**任何一条不满足即归入 `unknown`**：

| 判定 `rejected` 的条件（需全部满足） | 判定 `unknown` 的情形（任一即可） |
| --- | --- |
| HTTP 状态码属于供应商明确定义的客户端错误区间 | 连接超时、读超时、DNS 失败、TLS 失败 |
| 响应体成功解析且匹配声明的错误结构 | 响应体无法解析或与声明的结构不符 |
| 确认供应商**未受理**该请求（文档明确说明无副作用） | 响应丢失但请求可能已送达 |
| 无任何产物产出 | 存在产生产物的可能，或无法判断 |
| 错误码已在 `errorMap` 中映射为不可重试 | 错误码未映射 |

**保守原则**：判定不确定时选择 `unknown`。代价是多一次人工核对，收益是避免账实不符。

## 7. 两套可控配置与能力不匹配样例

用于 T-26（切换默认并调用相同业务工具）与 T-27（切换后旧报价/在途任务保持原路由）。

### 7.1 配置 A：同步 Mock（`mock-sync-v1`）

| 项 | 值 |
| --- | --- |
| `kind` | `text` / `music` / `tts` 各一份，`adapterId` 均为 `mock-sync-v1` |
| `executionMode` | `sync` |
| `supports.query` / `cancel` | `false` / `false` |
| `supports.idempotentSubmit` | `true` |
| `safeToRetrySubmit` | `true` |
| `streaming`（text） | `false` |
| 行为 | 立即返回 `completed`；可配置固定延迟毫秒 |
| 适用验收 | T-26 切换前基线；验证同步语义下不提供查询/取消 |

### 7.2 配置 B：异步 Mock（`mock-async-v1`）

| 项 | 值 |
| --- | --- |
| `kind` | `text` / `music` / `tts` 各一份，`adapterId` 均为 `mock-async-v1` |
| `executionMode` | `async` |
| `supports.query` / `cancel` | `true` / `true` |
| `supports.idempotentSubmit` | `true` |
| `safeToRetrySubmit` | `true` |
| `streaming`（text） | `true` |
| 行为 | `submit` 返回 `accepted` + `providerRef`；`query` 按脚本推进；可注入延迟、失败、未知、重复回调 |
| 适用验收 | T-26 切换后的默认；T-27 在途任务保持原路由；T-10 恢复；T-11 乱序回调；T-12 取消语义 |

### 7.3 配置 C：不支持幂等（`mock-no-idempotency-v1`）

第三套仅用于**负向验证**，不设为默认：

| 项 | 值 |
| --- | --- |
| `supports.idempotentSubmit` | `false` |
| `safeToRetrySubmit` | **`false`** |
| 期望行为 | 提交阶段网络不确定性必须进入 `reconciling`；**禁止任何自动重发** |
| 适用验收 | T-10；验证"不能查询也不能幂等提交时进入核对并等待人工证据" |

### 7.4 能力不匹配样例

用于验证前置拦截（T-18）与切换校验（T-26）。

| 编号 | 场景 | 期望结果 |
| --- | --- | --- |
| CM-01 | 请求 `music.generate`，但配置 `tools` 只声明 `speech.synthesize` | 报价阶段拒绝，`UNSUPPORTED_CAPABILITY`，不签发报价 |
| CM-02 | 请求规格 `music-180s-vocal`，但 `specifications` 无此规格 | 报价阶段拒绝；前端不得承诺该时长 |
| CM-03 | 请求 `instrumental: true`，但能力不支持纯音乐 | 明确拒绝，不静默降级为人声 |
| CM-04 | 请求 `language: 'ja'`，但 `languages` 不含该语言 | 明确拒绝并列出支持语言 |
| CM-05 | 使用克隆音色 `voiceRef`，但能力不支持克隆音色 | 拒绝；不把预置音色冒充为目标音色 |
| CM-06 | 请求 `cancel`，但 `supports.cancel: false` | `CANCEL_NOT_SUPPORTED`，原任务继续，不释放冻结 |
| CM-07 | 请求 `query`，但 `supports.query: false` | 保留明确限制，**不伪造查询结果** |
| CM-08 | 将默认从配置 A 切到配置 B，再确认**切换前已签发**的报价 | 仍按配置 A 执行；快照未变；返回结果标注 A 的 adapter |
| CM-09 | 切换默认后禁用配置 A，再确认 A 的旧报价 | `PROVIDER_UNAVAILABLE`，要求重新报价；**不自动改用 B** |
| CM-10 | 任务执行中切默认，然后查询/取消该任务 | 仍走原配置；不读取新默认 |
| CM-11 | `speech.synthesize` 使用已撤销的 `voice_profiles` | `CONSENT_REQUIRED`，提交前拦截（FR-09，P1） |
| CM-12 | 结果未知（`NETWORK_UNKNOWN`）后系统尝试自动重发 | **必须不发生**；任务进入 `reconciling`，冻结保持 |

### 7.5 T-26 / T-27 验收步骤建议

1. 用配置 A 提交一次 `music.generate`，记录 adapter、结果、产物来源。
2. 将默认切到配置 B，重跑**相同业务调用**，确认**业务调用方代码零改动**，新请求走 B。
3. 在切到 B 之前签发一份 A 的报价；切换后确认该报价，验证仍走 A（T-27）。
4. 在 A 的任务执行中切到 B，查询该任务，验证路由未变（T-27）。
5. 禁用 A，重试确认 A 的旧报价，验证 `PROVIDER_UNAVAILABLE` 且未跨供应商生成。
6. 逐一执行 CM-01 ~ CM-12，记录实际结果。

**重要**：配置 A 与配置 B 是**同一供应商协议的两套可控 Mock**，切换成功**不能**记为"两家真实供应商已验证"。真实适配器验证由 MF-11/12/13 各自完成。

## 8. Mock 样例实现

参考实现位于 `mock/providers/`，可在无网络、无账号、无数据库的情况下执行：

| 文件 | 内容 |
| --- | --- |
| `types.ts` | 三类端口、统一结果、能力声明的类型定义 |
| `mock-adapter.ts` | 按脚本驱动的可配置 Mock 适配器（延迟、失败、未知、重复回调） |
| `configs.ts` | 配置 A / B / C 的能力声明样例 |
| `capability-mismatch.ts` | CM-01 ~ CM-07 的能力校验函数 |
| `check-contract.ts` | 无需测试框架的契约自检入口 |

Mock 必须遵守的规则：

1. **与真实适配器同一契约**，不得出现只有 Mock 才有的返回形态。
2. 必须能注入**延迟、明确失败、结果未知、重复回调**四类行为。
3. 输出必须标记 `sourceMode: 'mock'`，不得默默冒充真实结果。
4. 不得调用网络、不得读取凭据、不得写入数据库。

## 9. 待后续 Issue 确定的事项

| 事项 | 责任 Issue |
| --- | --- |
| 具体供应商、账号、凭据与服务地址 | MF-11 / MF-12 / MF-13（真实接入前确认） |
| 规格时长、输入长度、文件大小与格式上限 | MF-11/12/13 按实际能力表锁定 |
| 规划调用的频率、并发与每日预算数值 | MF-09 |
| 任务预期时长与查询频率阈值 | MF-08 |
| 声音档案的撤销/删除与外部删除确认政策 | MF-17 |
| 真实适配器的错误码映射表 | MF-11/12/13 各自补充 |

## 10. 参考

- [AI SDK 流协议](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [PostgreSQL 行锁](https://www.postgresql.org/docs/17/explicit-locking.html)
- 项目内：[接口契约](API_CONTRACT.md)、[数据模型](DATA_MODEL.md)、[创作与积分流程](WORKFLOWS.md)、[测试计划](TEST_PLAN.md)
