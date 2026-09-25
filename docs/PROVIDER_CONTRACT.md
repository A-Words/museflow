# Provider 端口契约

状态：契约与 Mock 样例已实现，真实适配器尚未接入。本文细化 [接口契约](API_CONTRACT.md#provider-内部契约) 的 Provider 章节，作为 MF-03 的交付物；文中所有样例均为 Mock，不表示任何商业供应商已验证。

| 交付位置 | 内容 |
| --- | --- |
| `shared/contracts/provider/` | 运行时 Zod schema、类型、能力校验、配置版本、路由与重试规则、两套可控配置样例 |
| `server/services/providers/mock/` | 三个端口的 Mock 适配器与可编程脚本（成功/失败/未知） |
| `server/services/providers/registry.ts` | 适配器注册表：按当前默认选择、按快照路由，每个配置版本复用同一端口实例（端口保留在途请求状态） |
| `tests/unit/provider/` | 契约、能力与切换样例的单元测试 |

本项不实现任务服务、报价、账本、存储归档和真实网络调用；这些由 MF-05/07/08/11/12/13 完成。Mock 通过不等于真实适配器验收。

## 三类端口与调用模式

| 端口 | 操作 | 模式 | 规范化结果 |
| --- | --- | --- | --- |
| Text | `generate` | `sync`；适配器可另行声明 `async` | `completed`（文本、结构化值或工具提议）、`accepted`、`rejected`、`unknown`；异步结果只能由完成回调携带 `textResult` 交付 |
| Text | `stream` | `stream` | `start` →（`text-delta` 或 `tool-call-delta`，按请求的 `responseFormat`）→ `finish`，或单条脱敏 `error` |
| Music | `submit` | 本项目音乐提交按 `async` 设计 | `completed` + 音频产物，或 `accepted` + 请求标识 |
| Music | `query`、`cancel` | 按能力开放 | `completed`、`accepted`、`canceled`、`rejected`、`unknown` |
| Speech | `synthesize` | `sync` 或 `async` | `completed` + 音频（含音色/语言/格式），或 `accepted` |
| Speech | `query`、`cancel` | 按能力开放 | 同上 |

约定：

- `accepted` 只表示外部已受理，携带厂商 `requestId`，不代表成功，不能据此归档或结算。
- `accepted` 只在该配置声明 `async` 时返回；同步配置收到异步结果时返回 `UNSUPPORTED_CAPABILITY`，避免产生调用方永远无法查询或完成的状态。
- 流式增量不构成可执行输入；未完成的 `tool-call-delta` 不能触发任何业务动作。流式事件首个为 `start`（`requestKey`、`modelId`、`sourceMode`），其后为 `text-delta`/`tool-call-delta` 与 `finish`；事件类型由请求决定——`responseFormat: 'tool-calls'` 只产出 `tool-call-delta`（首条带 `toolName`，`finish.finishReason` 为 `tool-calls`），其余请求产出 `text-delta`（`finish.finishReason` 为 `stop`），两者不混发，调用方不会收到与请求格式不符的流。唯一例外是根本无法启动的流——不支持流式的适配器，或配置无法满足的请求，只产出单条 `error`（端口允许的错误码，能力不匹配时为 `UNSUPPORTED_CAPABILITY`），既没有前置 `start`，也不伪造增量。
- 流式 `error` 事件只使用端口允许的子集（`UNSUPPORTED_CAPABILITY`、`PROVIDER_UNAVAILABLE`、`RATE_LIMITED`、`CONTENT_REJECTED`、`RESULT_UNKNOWN`、`INTERNAL_ERROR`）。适配器不得把厂商原始错误体或子集外的错误码透出，无法归类时统一为 `INTERNAL_ERROR`。
- 网络不确定单独表达为 `unknown`（`retryable` 固定为 `false`），不混同为 `rejected`。
- 每个适配器必须实现端口全部方法；不支持时返回明确拒绝，而不是静默降级。

## 规范化输入与输出

- 字段使用 camelCase；时间输出 UTC ISO 8601（`Z`）；所有对象为严格 schema，未声明的字段直接拒绝。
- 文本输入：`messages`、`responseFormat`（`text`/`json`/`tool-calls`）、`structuredSchemaRef`（服务端注册的 schema 名）、`toolNames`（Tool Registry 决定）、`maxOutputTokens`、`temperature`、`purpose`。
- 音乐输入：`prompt`、`instrumental`、`lyrics` 与 `lyricsAssetId` 二选一、`durationSeconds`、`format`、`language`；P1 翻唱另带 `sourceAssetId` 与 `voiceRef`（必须成对）。
- 语音输入：`text`、`voiceRef`、`language`、`format`、`sampleRateHz`、`speed`。
- 结果统一以 `outcome` 判别：`completed` / `accepted` / `canceled` / `rejected` / `unknown`。
- 完成的音乐或语音结果必须含至少一个带受控 `downloadUrl` 的 `audio` 产物：只有 `kind: 'audio'` 而无法检索内容的产物不构成完成，不能据此归档或结算；语音结果另带 `voiceRef`、`voiceKind`、`language`、`format`，便于核对交付音频与已确认请求一致。
- `query`/`cancel` 必须用该请求被接受时返回的厂商 `requestId` 寻址：返回 `completed` 时沿用提交时确认的参数（时长、格式、语言、音色），返回 `canceled` 时也须核对 `requestId` 与已接受请求一致；查不到记录或 `requestId` 不匹配时返回 `unknown`（`query-unavailable`），不得伪造完成或取消确认。
- 回调事件携带 `kind`；`completed` 的 text 回调必须有 `textResult`，music/TTS 回调必须有可下载的 audio 产物。非完成状态不要求结果载荷。
- 产物只描述引用（`kind`、`format`、`mimeType`、`byteSize`、`durationMs`、`checksumSha256`、受控 `downloadUrl` 及过期时间）。调用方必须重新校验主机、重定向、内容类型和大小后再下载，URL 本身不构成成功。
- `requestKey` 是系统生成的稳定请求标识，用于厂商侧幂等与查询；`requestId` 由厂商返回。二者都不承载归属、积分或用户身份。

## 能力声明

适配器在 `capabilities` 中声明 `operations`、`modes`、`outputTypes`、`supports`（`query`、`cancel`、`idempotentSubmit`、`callbacks`、`remoteDelete`）与 `limits`（输入长度、时长、大小、格式、语言、音色种类、预期完成时间）。

- 校验在调用与报价之前执行，不满足即返回 `UNSUPPORTED_CAPABILITY`，不做静默降级或截断。
- 未声明的限制视为不满足，适配器必须显式声明它保证的范围。
- 报价与调用使用同一套派生要求（`deriveTextRequirements`/`deriveMusicRequirements`/`deriveSpeechRequirements`）：输入长度、输出类型、时长、格式、语言以及由 `voiceRef` 命名空间推出的音色种类（`cloned:` 前缀为克隆音色，其余为预置音色）。音乐提交与语音合成都要求 `outputType: 'audio'`，与"完成结果必须含音频"一致；文本请求按 `responseFormat` 映射输出类型（`text`/`structured`/`tool-calls`），因此超长输入、未声明的输出类型或克隆音色都在报价阶段被拒绝，只声明结构化输出的配置不能服务纯文本请求，预设音色的翻唱也不会被只支持预置音色的配置误拒。
- 声明为 `async` 的适配器必须可恢复：或声明 `callbacks`，或同时声明 `query` 能力与 `operations` 中该 kind 的查询操作，否则 schema 直接拒绝该配置。只声明 `supports.query` 而不声明 `query` 操作不算恢复路径，调用方无法据其恢复请求；Text 端口没有 `query` 操作，因此 `async` 的 text 配置只能靠 `callbacks`，且完成回调必须携带 `textResult`（`text` + 可选 `structuredValue` + `toolProposals`，见 `providerTextCompletionSchema`），否则 `completed` 回调无法交付文本结果。
- `operations` 必须属于该 kind 的端口操作（例如 music 不能声明 `synthesize`）。
- 声明的可选能力必须有对应操作：`supports.query` 要求 `operations` 含该 kind 的查询操作，`supports.cancel` 要求含取消操作，否则该配置在声明层承诺了无法执行的调用，schema 直接拒绝；Text 端口没有这两个操作，因此不能声明它们。
- 配置的 `kind` 必须与 `capabilities.kind` 一致，否则发布时即被拒绝，而不是等到路由时才失败。

## 配置版本与快照

- 配置最少包含 `providerConfigId`、`providerKey`、`version`、`kind`、`adapterId`、`modelId`、可选 `baseUrl`、`credentialRef`、`capabilities`、`parameterMapping`、`enabled`、`sourceMode`。
- `(providerKey, version)` 不可覆盖：发布变更生成新版本（`publishProviderConfig`），启停是独立且可审计的变更。
- 新报价把当前默认配置冻结为 `providerSnapshot`（配置引用 + 能力快照 + 参数映射 + 捕获时间）；创建任务时复制该快照。
- `credentialRef` 只是引用，密钥不进入快照、报价、任务、API 响应或日志。
- `provider_defaults` 每种 kind 至多一条，只被新请求与新报价读取。

## 固定原供应商的规则

| 场景 | 规则 |
| --- | --- |
| 新需求/新报价 | 读取该 kind 当前默认 → 校验能力 → 写快照（`selectProviderForNewRequest`） |
| 旧报价、在途任务及其查询/取消/归档 | 只用已保存快照解析（`resolveSnapshotRoute`）；该函数不接收默认配置，结构上无法切换到新供应商 |
| 克隆声音档案 | 只保存配置 id 与版本，用 `resolveConfigReferenceRoute` 按同一规则解析；切换默认不会迁移已建音色 |
| 原配置被禁用或版本不可读 | 返回 `PROVIDER_UNAVAILABLE`，要求重新报价确认或进入核对 |
| 发布版本能力与快照不一致 | 返回 `UNSUPPORTED_CAPABILITY`，不按新能力继续执行 |
| 发布版本参数映射与快照不一致 | 返回 `PROVIDER_UNAVAILABLE`：旧报价与在途任务不得用改写后的映射执行 |
| 发布版本 `sourceMode` 与快照不一致 | 返回 `PROVIDER_UNAVAILABLE`：已按真实供应商确认的工作不得改由 Mock 适配器执行 |
| 正在进行的文本流 | 保留原请求连接，下一轮才读取新默认配置 |

切换默认不改变历史快照，也不把原供应商的请求标识发送给新供应商；本项目不提供自动跨供应商重试或路由优化。

## 与数据模型及现有文档的对应关系

本项对 [数据模型](DATA_MODEL.md) 有一处补充建议和两处需要说明的差异，MF-05 建立迁移时确认；这些差异已在提交说明中标注受影响模块。

| 事项 | 契约做法 | 与数据模型的差异 | 处理 |
| --- | --- | --- | --- |
| 配置字段 | 配置必带 `sourceMode`（`real`/`mock`） | `provider_configs` 未列该字段 | 建议 MF-05 迁移补列；注册表据此拒绝把非 Mock 配置交给 Mock 适配器，避免 Mock 结果被当成真实结果 |
| 快照结构 | `capabilities` 与 `parameterMapping` 内联在 `providerSnapshot` 内 | 数据模型把 `provider_snapshot` 与 `capability_snapshot` 列为两列 | 信息等价；落库时可按两列拆分（报价两列都存，任务复制快照），契约保持内联以减少一次校验往返 |
| 产物种类 | Provider 只产出 `lyrics`/`audio`/`voice_sample` | 资源字典还有 `cover` | `cover` 来自用户上传（`POST /assets`），不是 Provider 产物，故不进入端口枚举 |
| `source_mode` 取值 | Provider 层只有 `real`/`mock` | 数据模型提到 `manual` | `manual` 只适用于人工编辑的歌词版本或手工录入结果，Provider 端口不产生该值 |

## 错误与重试分级

错误码：`UNSUPPORTED_CAPABILITY`、`INVALID_INPUT`、`PROVIDER_UNAVAILABLE`、`AUTHENTICATION_FAILED`、`QUOTA_EXHAUSTED`、`RATE_LIMITED`、`CONCURRENCY_LIMIT`、`CONTENT_REJECTED`、`CANCEL_NOT_SUPPORTED`、`REQUEST_NOT_FOUND`、`RESULT_UNKNOWN`、`INTERNAL_ERROR`。

`retryable` 表示“可在用户重新确认后再次尝试”，不表示调用方可以静默重发收费请求。`classifyProviderFailure(code, stage)` 给出四类处理：

| 分级 | 含义 | 典型情形 |
| --- | --- | --- |
| `bounded-retry` | 该阶段有界退避重试，单阶段最多 3 次 | `query`/`archive`/`cancel`，以及处理回调时向供应商确认，遇到 `PROVIDER_UNAVAILABLE`、`RATE_LIMITED` |
| `reconcile` | 停止调用，转入核对等待证据 | 任何 `unknown` 结果、`RESULT_UNKNOWN` |
| `requote` | 只有重新报价并再次确认后才能重试 | `submit` 遇到 `PROVIDER_UNAVAILABLE`、`RATE_LIMITED`、`CONCURRENCY_LIMIT` |
| `never` | 不自动重试、也不重发收费请求；需改输入或人工介入 | 输入错误、内容拒绝、能力不匹配、认证/额度问题、`CANCEL_NOT_SUPPORTED` |

**不能由通用网络重试处理的行为：**

1. 生成提交（`submit`）：请求可能已在供应商侧受理，重发可能产生两次生成与两次扣费，只能查询或用稳定请求标识核对。
2. 结果为 `unknown`：必须先确认原请求状态；不得先释放积分再重发。
3. 不支持取消：`CANCEL_NOT_SUPPORTED` 时原任务继续，不做替代重试。
4. 认证、额度或内容策略失败：重试不会改变结果。
5. 跨供应商自动切换：需要重新报价确认，不能在原配置不可用时改用另一家服务。

## 两套可控配置与能力不匹配样例

每种 kind 提供两套可控配置（`shared/contracts/provider/fixtures.ts`），用于切换默认与能力校验评审：

| kind | 配置 | 能力差异 |
| --- | --- | --- |
| Text | `mock-text-flex` | `generate` + `stream`，`text`/`structured`/`tool-calls`，输入上限 32000 |
| Text | `mock-text-basic` | 仅 `generate`（`sync`），仅 `text`，输入上限 2000 |
| Music | `mock-music-studio` | `submit`/`query`/`cancel`，≤180 秒，`mp3`/`wav`，预置与克隆音色 |
| Music | `mock-music-lite` | 仅 `submit`，≤30 秒，仅 `mp3`，仅预置音色；结果只能靠回调恢复 |
| Speech | `mock-tts-hd` | `sync`+`async`，`query`/`cancel`，`wav`/`mp3`，三种语言，预置与克隆音色 |
| Speech | `mock-tts-basic` | 仅 `synthesize`（`sync`），仅 `mp3`，两种语言，仅预置音色 |

能力不匹配样例（全部在调用前拒绝，返回 `UNSUPPORTED_CAPABILITY`）：基础文本配置上的 `stream`、结构化输出、超长输入；精简音乐配置上的 `query`、`cancel`、120 秒时长、`wav` 输出；基础语音配置上的克隆音色、`wav` 输出、超长文本、日语。

切换样例：默认从 `mock-text-flex` 切到 `mock-text-basic` 后，同一业务调用路径无需修改（T-26）；切换前已签发的快照仍解析到原配置（T-27）；原配置被禁用时明确报错而不改供应商。

Mock 结果一律标记 `sourceMode: 'mock'`，产物地址使用保留域 `.invalid`，且携带固定校验和，避免被误当成真实结果或真实素材。

## 证据与限制

- 已由 `tests/unit/provider/` 覆盖：三类端口的输入输出 schema（拒绝未知字段、`accepted` 必须携带请求标识、完成结果必须含可检索的音频、语音结果必须带音色与语言、配置 `kind` 与 `capabilities.kind` 必须一致、回调可携带 `textResult` 且必须含 `toolProposals`）、能力声明与操作的对应关系（`supports.query`/`supports.cancel` 必须有对应操作）、异步配置的恢复路径校验（`async` 需 `callbacks`，或同时声明 `query` 能力与该 kind 的查询操作；text 只能靠 `callbacks`）、11 项能力不匹配样例、派生要求（文本按 `responseFormat` 要求 `text`/`structured`/`tool-calls` 输出、音乐与语音要求 `outputType: 'audio'`、输入长度与音色种类，超长音乐输入与只声明结构化输出或只声明文本输出的配置都在报价或校验阶段被拒绝）、默认切换与快照/配置引用固定原供应商（含原配置被禁用、能力漂移、能力快照不可解析、参数映射漂移与 `sourceMode` 漂移）、重试分级表（含回调确认阶段），以及 Mock 的成功/失败/未知/取消/无流式能力/流式要求校验/tool-calls 流只产出 `tool-call-delta`/同步配置拒绝 `accepted`/端口按配置版本复用仍能查到已确认音色/音乐与语音对未发出请求或 `requestId` 不匹配的查询都报 `unknown` 而非伪造完成/查询与取消复现已确认参数样例与 Mock 守卫。
- 未实现，也未由测试覆盖：真实适配器请求与响应、密钥读取与轮换、任务调度、查询次数上限与恢复流程、回调验签与去重、`task_events` 写入、报价/任务/计费/存储归档，以及 Nuxt API 暴露。
- 已知缺口（本轮评审确认，留给后续 Issue）：`voice_sample` 产物与 `voice-sample` 输出类型目前没有任何端口产出，只有 P1 声音克隆接入后才会使用；`deriveMusicRequirements` 只统计 `prompt` 与内联 `lyrics` 的字符数，引用归档歌词（`lyricsAssetId`）时长度不参与能力校验；`sampleRateHz`、`maxOutputTokens` 等输入参数尚未建模为能力限制；注册表按配置版本缓存的端口实例不做淘汰，回收由任务服务在确认无任务引用该版本后处理。
- 因此当前只能声明“契约与 Mock 样例就绪”，不能声明 FR-11 或 T-26/T-27 已通过；真实能力与费用证据在接入真实适配器后另行记录，Mock 不混入真实成功率。
