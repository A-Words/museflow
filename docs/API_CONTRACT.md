# 接口契约草案

版本：`v0.2`，更新于 `2026-09-20`。状态：设计提案，接口尚未实现。应用框架已确认为 Nuxt + TypeScript，文本/音乐/TTS 采用可切换供应商的接口设计；API 拟由 Nuxt 的 Nitro 服务端承载。用于三人并行设计和后续联调；实现时将本契约转换为共享运行时 schema 与 OpenAPI，而不是维护两套独立的字段定义。

## 公共约定

- API 前缀 `/api/v1`，JSON 使用 camelCase；ID 不透明，时间为 UTC ISO 8601，积分值为十进制字符串。
- 认证候选为服务端会话 + `HttpOnly` Cookie；远程 HTTPS 使用 `Secure`，同站部署设置合适的 `SameSite`。写接口执行 Origin/CSRF 校验，不能仅依赖 Cookie 属性。
- 所有资源按会话用户判定归属，请求不接受 `ownerId`。未登录返回 401；普通用户访问后台返回 403；跨用户资源统一返回 404，避免暴露其是否存在。
- 列表使用 `cursor`、`limit`，默认 20、最大 100；响应为 `{ items, nextCursor }`，排序包含稳定的 ID 次键。
- 写任务、报价、管理员积分调整及可能引发外部副作用的操作使用 `Idempotency-Key`。相同 key 与相同规范化请求返回原资源，相同 key 不同请求返回 409。
- 失败格式为 `{ error: { code, message, retryable, requestId, details? } }`。`details` 不含密钥、栈跟踪或其他用户内容；客户端不能只凭 `retryable` 自动重提收费动作。
- 任务状态以查询 API 为准。首轮前端可每 3 秒轮询活动任务，终态停止，页面隐藏时退避；断网恢复后先查询原任务，不能重发生成。
- Nuxt 的页面路由中间件不能替代上述 API 鉴权。若采用 AI SDK 的流式 UI 协议，应先补充会话流的请求/事件 schema 与持久化映射；当前消息路由仍按下表 JSON 契约设计，不自动将它视为可直接接入 SDK 客户端的流接口。

## 路由目录

| 方法与路径 | 主要输入 / 输出 | 约束和关联需求 |
| --- | --- | --- |
| `POST /auth/register` | email、password → user | 注册限流；默认创作者角色；FR-01 |
| `POST /auth/login` | email、password → user + 会话 Cookie | 统一失败提示；FR-01 |
| `POST /auth/logout` | 撤销当前会话 → 204 | Cookie/服务端同时失效；FR-01 |
| `GET /me` | 当前用户、角色、权益摘要 | 不返回密码摘要或后台密钥；FR-01/10 |
| `GET /tools` | 工具能力、支持规格、可用状态和前置条件 | 不返回 Provider 密钥；FR-03/09 |
| `GET/POST /conversations` | 列表 / 创建会话 | 当前用户范围；FR-02 |
| `GET /conversations/:id/messages` | 历史消息、工具卡、关联 taskId | 游标分页；FR-02 |
| `POST /conversations/:id/messages` | content、selectedAssetIds → message、Agent 回答或 toolCalls | 参数与资源鉴权；有规划预算，不直接执行收费工具；FR-02 |
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

管理配置列表与详情接口应在实现 schema 时配套定义；配置新增版本不允许静默覆盖旧版。首轮不包含支付创建、充值回调或商户结算接口。

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
