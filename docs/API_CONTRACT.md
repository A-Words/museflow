# 接口契约草案

版本：`v0.2`，更新于 `2026-09-20`。状态：设计提案，接口尚未实现。应用框架已确认为 Nuxt + TypeScript，文本/音乐/TTS 采用可切换供应商的接口设计；API 已确认由 Nuxt 的 Nitro 服务端承载。用于三人并行设计和后续联调；实现时将本契约转换为共享运行时 schema 与 OpenAPI，而不是维护两套独立的字段定义。

## 公共约定

以下 ID、时间、积分表示、分页、错误及幂等规则已于 2026-09-20 确认；对话采用 AI SDK 原生 UI 消息流协议，路由级 schema 随锁定版本细化，当前尚未实现。

- 运行时 schema 已确认采用 Zod；业务公共 schema 放在 `shared/contracts`，由 schema 推导类型并校验外部输入。具体字段规则仍随契约评审固定，当前尚无可执行 schema。
- 业务 API 前缀 `/api/v1`，JSON 使用 camelCase。Better Auth 管理的认证端点使用 `/api/auth/*`，采用其原生请求、响应和错误协议，不套用业务错误信封或幂等键约定。
- 业务资源 ID 由应用生成 UUID v4，客户端按不透明字符串处理；认证表 ID 遵循 Better Auth 的选定 schema，业务中的用户外键必须匹配其实际类型，不强制转换为 UUID。
- 时间统一输出 UTC ISO 8601（使用 `Z` 时区后缀），数据库时间字段使用 `timestamptz`，页面按用户时区显示。
- 积分值使用十进制整数字符串，数据库使用 `bigint`，服务端采用精确整数运算，不经 JavaScript `number` 转换。余额和冻结额非负，流水增减及管理员调整可以为负；输入校验数据库可表示范围。
- 认证已确认采用 Better Auth 数据库会话 + `HttpOnly` Cookie，首轮关闭 session cookie cache；远程 HTTPS 使用 `Secure`，同站部署设置合适的 `SameSite`。认证端点保留库的 Origin/CSRF 防护，业务写接口另行执行 Origin/CSRF 校验，不能仅依赖 Cookie 属性。受保护业务接口校验会话及当前账户状态、角色和资源归属。
- 所有资源按会话用户判定归属，请求不接受 `ownerId`。未登录返回 401；普通用户访问后台返回 403；跨用户资源统一返回 404，避免暴露其是否存在。
- 列表使用 `cursor`、`limit`，默认 20、最大 100；响应为 `{ items, nextCursor }`，结束时 `nextCursor` 为 null；排序包含稳定的 ID 次键。游标按不透明字符串处理并绑定筛选和排序条件，不能跨条件复用，也不能替代资源归属校验。
- 写任务、报价、管理员积分调整及可能引发外部副作用的操作使用 `Idempotency-Key`，作用域为当前用户与操作。相同 key 与相同规范化请求返回原资源，相同 key 不同请求返回 409；数据库唯一约束兜底并发重复提交。
- 失败格式为 `{ error: { code, message, retryable, requestId, details? } }`。`details` 不含密钥、栈跟踪或其他用户内容；客户端不能只凭 `retryable` 自动重提收费动作。
- 任务状态以查询 API 为准。首轮前端可每 3 秒轮询活动任务，终态停止，页面隐藏时退避；断网恢复后先查询原任务，不能重发生成。
- Nuxt 的页面路由中间件不能替代上述 API 鉴权。对话消息 POST 返回 AI SDK 原生 UI 消息流，历史 GET 仍返回 JSON；流开始后的错误通过协议事件表达，具体边界见下文。

## 路由目录

MF-04 已实现公共存活检查 `GET /api/v1/health`，返回 `{ "status": "ok", "service": "web" }`，schema 位于 `shared/contracts/health.ts`。该接口不执行数据库查询，也不表示任务服务、数据库或 Provider 就绪，不返回配置值。下表其余业务路由仍是待实现契约。

| 方法与路径 | 主要输入 / 输出 | 约束和关联需求 |
| --- | --- | --- |
| `POST /api/auth/sign-up/email`（完整路径） | Better Auth `signUp.email`；字段按锁定版本 schema | 注册限流；服务端设置默认创作者角色；FR-01 |
| `POST /api/auth/sign-in/email`（完整路径） | Better Auth `signIn.email` → 原生响应及会话 Cookie | 统一失败提示；FR-01 |
| `POST /api/auth/sign-out`（完整路径） | Better Auth `signOut` → 原生响应 | Cookie/服务端当前会话同时失效；FR-01 |
| `GET /me` | 当前用户、角色、权益摘要 | 不返回密码摘要或后台密钥；FR-01/10 |
| `GET /tools` | 工具能力、支持规格、可用状态和前置条件 | 不返回 Provider 密钥；FR-03/09 |
| `GET/POST /conversations` | 列表 / 创建会话 | 当前用户范围；FR-02 |
| `GET /conversations/:id/messages` | `{ items, nextCursor }`；items 为已持久化 UIMessage 及业务 metadata | 游标分页；FR-02 |
| `POST /conversations/:id/messages` | content、selectedAssetIds、clientMessageId → AI SDK UI 消息流（SSE） | 参数与资源鉴权；按消息标识去重；有规划预算，不直接执行收费工具；FR-02 |
| `PATCH /tool-calls/:id` | input、version → 更新后的提议 | 仅未确认提议可改；旧报价失效；FR-02/03 |
| `POST /quotes` | toolCallId → Quote | 服务端计算价格，冻结输入；FR-07 |
| `POST /tasks` | quoteId、retryOfTaskId? → 202 Task | 明确用户确认；一个报价一个任务；FR-03/04/07 |
| `GET /tasks` | status?、cursor → 当前用户任务列表 | 不泄露他人任务；FR-04 |
| `GET /tasks/:id` | Task、产物引用、积分状态、允许的下一步 | 超时仍能恢复查询；FR-04/07 |
| `POST /tasks/:id/cancel` | → 200 或 202 Task | 排队可取消；运行按能力处理；FR-04 |
| `GET /assets` | q、kind、tag、from、to、cursor → 作品列表 | q 检索标题与歌词文本；FR-05 |
| `POST /assets` | multipart 文件、kind、来源说明 → Asset | 仅允许上传能力表支持的音频/封面/声音样本；做大小、类型和内容校验；FR-05/09 |
| `GET/PATCH /assets/:id` | 详情 / title、tags、coverAssetId、version | 引用封面需验证归属；不就地覆盖生成文件；FR-05 |
| `POST /assets/:id/versions` | textContent → 新歌词 Asset | 仅歌词支持人工编辑；保留 parentAssetId，sourceMode=manual，不扣生成积分；FR-03/05 |
| `GET /assets/:id/content` | 鉴权后的内容流，支持音频 Range | 预览/下载共用授权逻辑；禁止缓存私人资源到公共缓存；FR-05 |
| `DELETE /assets/:id` | → 202 deletion_pending 或 204 | 立即阻止新访问，再做物理清理；FR-05 |
| `GET /recommendations` | limit → 推荐、规则版本、reasonTags、runId | 过滤私有/删除资源；FR-06 |
| `POST /behavior-events` | eventKey、type、targetRef、runId? → 202 | 校验目标可访问性、事件类型和频次；FR-06 |
| `PATCH /me/preferences` | personalizationEnabled → 当前设置 | 关闭后停止推荐用途采集；FR-06 |
| `DELETE /me/preferences/history` | → 202 reset 状态 | 清除偏好与推荐事件，不删除作品和账本；FR-06 |
| `GET /credits/accounts` | 两个钱包 available、held | FR-07 |
| `GET /credits/entries` | currency?、cursor → 流水 | 展示冻结/结算/释放区别；FR-07 |
| `GET /usage` | 当前方案、统计区间、工具次数与积分用量 | 按钱包分别统计，不把两类积分合为一种余额；FR-10 |
| `POST /asset-rights-declarations` | assetId、scope、declarationVersion、confirmed → 使用声明 | P1，确认翻唱输入音频的使用范围；FR-09 |
| `POST /voice-consents` | sampleAssetId、scope、declarationVersion、confirmed → 授权记录 | P1，明确确认才成立；FR-09 |
| `GET /voice-profiles` | 当前用户声音档案 | P1；克隆通过通用 tasks 流程创建；FR-09 |
| `POST /voice-profiles/:id/revoke` | reason → 撤销状态 | P1；停止后续使用、处理在途任务；FR-09 |
| `DELETE /voice-profiles/:id` | → 202 deletion_pending | P1；包含外部 Provider 删除确认；FR-09 |
| `GET /admin/users`、`PATCH /admin/users/:id/status` | 查询 / status、reason | 管理员权限，写审计；停用影响会话和排队任务；FR-08 |
| `GET /admin/tasks` | status、age → 脱敏任务概况 | 包含异常冻结和核对任务；FR-08 |
| `POST /admin/tasks/:id/reconcile` | evidenceRef、requestedAction → 核对结果 | 先验证外部证据，再走同一终态事务；不任意覆盖状态；FR-08 |
| `POST /admin/credit-adjustments` | userId、currency、delta、reason → 流水 | 幂等；不可导致负余额或动用 held；FR-07/08 |
| `POST /admin/tool-configs` | 新版本能力配置 → version | 启停工具及能力范围；不接受明文密钥；FR-08 |
| `GET/POST /admin/provider-configs` | 脱敏配置列表 / kind、adapterId、modelId、baseUrl?、credentialRef、能力参数 → 新版本 | 管理员权限；仅选择已注册 adapter；凭据仅显示配置状态；FR-08/11 |
| `PUT /admin/provider-defaults/:kind` | providerConfigId、reason → 当前默认配置 | kind 为 text/music/tts；校验能力及配置版本，写审计；仅影响新请求/报价；FR-11 |
| `POST /admin/price-rules`、`POST /admin/plan-versions` | 新价格或权益版本 | 发布后不覆盖历史版本；FR-08/10 |
| `PUT /admin/users/:id/entitlement` | planVersionId、reason → 权益 | 结束旧有效记录再新增；FR-08/10 |
| `GET /admin/audit-logs` | cursor → 审计列表 | 只读脱敏；FR-08 |
| `POST /webhooks/providers/:provider` | 外部事件 → 已接收 | 仅对支持回调的 Provider 开放；验签和去重，不能凭客户端 userId 归属 |

除标明完整路径的 Better Auth 端点外，上表路径均相对于 `/api/v1`。原草案 `/auth/register`、`/auth/login`、`/auth/logout` 被原生认证端点替代，不再另建包装接口。`GET /me` 仍提供业务用户与权益摘要；Better Auth 会话数据不能代替业务授权检查。认证端点及客户端行为在锁定版本后验证。

管理配置列表与详情接口应在实现 schema 时配套定义；配置新增版本不允许静默覆盖旧版。首轮不包含支付创建、充值回调或商户结算接口。

## 对话消息流与持久化

已确认采用 AI SDK 原生 UI Message Stream Protocol。POST 成功响应使用 `text/event-stream` 及 `x-vercel-ai-ui-message-stream: v1`，通过锁定版本的 SDK helper 生成，沿用原生消息开始、文本增量、工具输入/输出、错误和结束事件；不另造一套文本流协议。客户端 transport 将新消息映射为上述业务请求，并携带同源会话 Cookie，不能假设 SDK 默认请求体与本接口相同。

服务端只接受本次用户文本、所选作品和客户端去重标识；从数据库加载可信历史，并校验会话及作品归属。客户端不得提交可信的 assistant/tool 历史、报价、任务状态或工具执行结果。`clientMessageId` 是客户端生成的 UUID v4，以用户、会话和该标识联合去重；相同标识不同规范化输入返回 409 `IDEMPOTENCY_CONFLICT`。数据库消息 ID 仍由服务端生成 UUID v4。

| 流内容 | 持久化与业务映射 |
| --- | --- |
| 用户输入 | 模型调用前保存；映射为 role=user 的 UIMessage text part，并记录所选作品引用 |
| 助手文本 | 保存 UIMessage 的 id、role、parts、metadata 和 schemaVersion；不保存或发送模型私有思维过程 |
| 工具提议 | 原生 toolCallId 映射到持久化业务 tool_call 记录；校验并保存后才能成为可报价的工具卡，未完成的增量参数不可执行 |
| 报价与任务引用 | metadata/类型化 data part 仅携带持久化资源引用；最新状态通过独立业务 API 查询，不以消息中的历史快照结算 |
| 工具真实结果 | 服务端读取归属正确的任务及产物后关联回原 toolCallId，转换为 SDK 可接受的工具结果；不将“已提议”或“已受理”表示为生成成功 |

业务报价仍调用 `POST /quotes`，用户确认仍调用 `POST /tasks`，任务状态仍通过 `GET /tasks/:id` 查询。SDK 原生工具事件用于表示提议与结果，不能触发绕过确认的收费执行。历史读取按 SDK UIMessage 形态还原，按锁定版本校验后转换为模型输入；业务工具记录不必伪装成独立 role=tool 的 UIMessage。

流开始前的认证、校验或预算拒绝使用正常 HTTP 状态与业务错误信封；开始后无法改变 HTTP 状态，使用脱敏的原生 error 事件及业务错误 metadata/data part，携带稳定错误码和 requestId。具体自定义 part 的 Zod schema 随 SDK 版本建立，不向前端暴露 Provider 原始错误。

消息记录区分 streaming、completed、interrupted、failed。完成时持久化最终 parts；中断或进程重启后不得把未完成消息标成成功，遗留 streaming 记录需恢复为 interrupted。刷新或断线先读取已持久化历史和关联任务；首轮不承诺从任意 token 位置续传。重复提交同一 clientMessageId 不重新调用模型：返回 409 `MESSAGE_ALREADY_ACCEPTED` 并提供原消息引用，客户端转为查询历史。用户明确重试使用新标识，并保留原中断记录；已有收费任务继续查询原 taskId，不自动重建。

MF-04 及后续 Agent 实现需验证 Nuxt/Vue transport、文本和工具事件解析、历史重载、去重、断线恢复及独立确认流程。当前为协议设计，尚未完成集成验证。参考：[官方流协议](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)、[消息持久化](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)。

## 关键数据结构

以下 TypeScript 是领域契约示意，字段需用运行时 schema 再次验证；不是已经发布的包。

```ts
type CreditKind = 'creation' | 'voice';
type TaskStatus =
  | 'queued' | 'running' | 'reconciling' | 'cancel_requested'
  | 'succeeded' | 'failed' | 'canceled';

type ToolInput =
  | { tool: 'lyrics.generate'; theme: string; language: string; style: string; structure?: string }
  | { tool: 'music.generate'; prompt: string; specificationId: string; lyricsAssetId?: string }
  | { tool: 'speech.synthesize'; text: string; voiceRef: string; language: string; specificationId: string }
  | { tool: 'music.cover'; sourceAssetId: string; voiceRef: string; rightsDeclarationId: string; specificationId: string }
  | { tool: 'voice.clone'; sampleAssetId: string; consentId: string; specificationId: string };

interface Quote {
  id: string;
  toolCallId: string;
  inputHash: string;
  currency: CreditKind;
  amount: string;
  priceVersion: string;
  expiresAt: string;
}

interface Task {
  id: string;
  toolCallId: string;
  status: TaskStatus;
  sourceMode: 'real' | 'mock';
  assetIds: string[];
  voiceProfileId?: string;
  reservation: { currency: CreditKind; amount: string; state: 'held' | 'captured' | 'released' };
  allowedActions: Array<'cancel' | 'requote' | 'view_result'>;
  error?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
}
```

`specificationId` 来自服务端能力表，而不是用户任意填写时长。预置音色与私人克隆音色使用不同命名空间，后端解析 `voiceRef` 并校验归属。翻唱的 `rightsDeclarationId` 是源音频使用声明，独立于目标声音的克隆授权，对应数据模型中的 `asset_rights_declarations`。

## 提交和错误示例

用户确认时请求 `POST /api/v1/tasks`，附 `Idempotency-Key: <本次确认的唯一值>`，正文只有已固定的报价引用：

```json
{ "quoteId": "<已签发的报价 ID>" }
```

报价过期返回 409 与 `QUOTE_EXPIRED`，前端必须重新报价确认。相同用户用不同 key 再提交已使用的报价时，返回原 taskId，不能创建第二个任务；若附加输入与原请求不一致则返回冲突。已知任务的失败可返回其 Task，不将任务运行失败等同于 HTTP 创建失败。接口未收到响应时使用同一幂等键查询式重送，不切换新的 key。

| HTTP | 错误码 | 前端处理 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 标出参数问题，保留用户输入 |
| 401 / 403 | `UNAUTHENTICATED` / `FORBIDDEN` | 登录或显示权限限制；不自动换用户执行 |
| 404 | `RESOURCE_NOT_FOUND` | 无资源或无权访问；不暴露所有者 |
| 409 | `INSUFFICIENT_CREDITS`、`QUOTE_EXPIRED`、`INPUT_CHANGED` | 调整参数或重新获取报价；不自动消费 |
| 409 | `IDEMPOTENCY_CONFLICT`、`VERSION_CONFLICT` | 查原资源，提示刷新或重新确认 |
| 409 | `CANCEL_NOT_SUPPORTED`、`TASK_NOT_RETRYABLE` | 展示允许操作，继续查询原任务 |
| 422 | `CONSENT_REQUIRED`、`UNSUPPORTED_CAPABILITY` | 补授权或选择支持的参数 |
| 429 | `RATE_LIMITED`、`CONCURRENCY_LIMIT` | 退避并保留草稿；不创建已扣费任务 |
| 503 | `PROVIDER_UNAVAILABLE` | 提示工具暂不可用；不伪装为生成成功 |

## Provider 内部契约

**已确认目标：三类服务可通过配置切换已实现的适配器，业务流程不绑定某个供应商。** 不以现在选定供应商为接口设计或 Mock 联调的前提。

| 能力 | 内部操作 | 统一结果 |
| --- | --- | --- |
| Text | `generate`；`stream` 按能力开放 | 文本、结构化值或工具提议，标准化结束原因及可获得的用量；流式数据另按协议映射 |
| Music | `submit`；`query`/`cancel` 按能力开放 | completed + 产物，accepted + 请求标识，rejected + 明确错误，或 unknown |
| Speech | `synthesize`；`query`/`cancel` 按能力开放 | 同步音频结果或与音乐一致的异步结果；携带音色、语言和格式元数据 |

这是应用内部端口，不要求三个外部 API 使用相同协议。歌词生成作为收费工具时仍通过任务和积分流程调用 Text Provider；普通 Agent 规划调用使用同一文本接口，但按规划预算处理。Provider 不直接修改任务终态或钱包。

适配器至少声明支持工具、参数 schema、输出类型、查询/幂等/取消/删除能力、时间和大小限制。网络不确定性必须单独表达为 unknown，不能统一抛错后自动重试；缺少查询能力时保留明确限制，不能伪造查询结果。

`query`、`cancel`、回调都转换为统一内部事件，再交给任务服务核对状态和结算。Mock 和真实适配器遵守同一契约，Mock 能注入延迟、失败、结果未知和重复回调。业务模块不得直接依赖某个供应商的响应格式。

配置最少包含 `providerConfigId`、`version`、`kind`、`adapterId`、`modelId`、可选 `baseUrl`、`credentialRef`、能力和参数映射。`credentialRef` 引用服务端配置中的密钥，不在报价、任务快照、前端响应或日志复制密钥。配置版本不可覆盖；启停状态可以单独变更并审计。

新报价选择当前有效配置并保存 `providerSnapshot` 和能力快照；创建任务时复制报价快照。快照至少标明配置 ID/版本、adapter、模型和规格映射，并引用可恢复读取的原配置。切换默认后，未过期的旧报价仍按原配置执行；若该配置被禁用或能力不再可用，返回 `PROVIDER_UNAVAILABLE` / `UNSUPPORTED_CAPABILITY`，由用户重新报价确认。已执行任务的查询、取消和归档不得读取新的默认供应商。

新协议需要新增 adapter；只在实现兼容的协议范围内支持配置式切换。现阶段不提供自动跨供应商重试和路由优化。未配置真实服务时可明确使用 Mock，不能默默返回 Mock 冒充真实结果。
