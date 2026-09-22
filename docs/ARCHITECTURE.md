# MuseFlow 系统架构

本文是概要设计草案。团队已确认 3 人、使用 Nuxt + TypeScript，按课题范围及 P0/P1 顺序推进，文本/音乐/TTS 供应商可切换。技术选型和理由统一维护在本文，评审过程留在对应 Issue/PR；当前没有已部署服务。

## 技术选型与待定项

下表首轮技术选择已于 2026-09-20 逐项确认，包括 UI、校验、测试和存储方向；公共 API 约定及 AI SDK 原生 UI 消息流见接口文档。MF-01 已关闭；MF-04 已建立基础设施与兼容性骨架。基础兼容性不代表业务功能已经实现。

| 层 | 状态与方案 | 依据和后续工作 |
| --- | --- | --- |
| Web | **已确认：Nuxt + TypeScript** | Nuxt 4 骨架及严格类型检查已建立 |
| API | **已确认：Nuxt Nitro，使用 `server/api`**（2026-09-20） | 页面与 API 同源；已建立 health 路由，业务 API 待实现 |
| Agent | **已确认：AI SDK**（2026-09-20） | 已验证 Mock 消息流；真实模型、工具循环和持久化待实现，首轮不引入 LangGraph |
| Worker | **暂不引入独立进程**（2026-09-22 调整） | MF-08 按实际 Provider、持久化任务与恢复需求确定执行方式 |
| 数据库与查询库 | **已确认：PostgreSQL + Drizzle**（2026-09-20） | 已验证连接查询和连接池关闭；业务迁移、事务、唯一约束、任务领取及账本并发仍需实测 |
| 文件 | **已确认：开发期私有文件目录，部署期私有对象存储**（2026-09-20） | 通过统一 Storage Adapter 访问；具体对象存储服务在部署时选择；尚未实现 |
| 认证 | **已确认：Better Auth + 数据库会话**（2026-09-20） | 已验证 Drizzle adapter 与 Vue 客户端实例构造；认证表和实际会话待 MF-05/06 |
| 包管理 | **已确认：pnpm，单个 Nuxt 项目**（2026-09-22 调整） | 固定版本并提交锁文件；不再拆分 Web、Worker 和共享包 |
| 运行时 schema | **已确认：Zod**（2026-09-20） | 已用于 health 契约和配置校验；公共契约放在 `shared/contracts` |
| 测试 | **已确认：Vitest + Nuxt Test Utils，不引入 Playwright**（2026-09-20） | 已建立单元、组件、SSR/API 与独立数据库检查入口；关键浏览器流程手动验收 |
| UI | **已确认：Nuxt UI + Tailwind CSS**（2026-09-20） | 已接入检查表单和弹窗；创作工作区及音频播放器留给业务 Issue |

其余细节随相应 Issue 确定：双积分含义、价格和权益由 MF-07 评审；具体供应商、账号及预算在真实接入前确认；声音衍生作品的撤销/删除政策在 MF-17 明确。部署平台按实际演示需要选择，成员信息及课程材料见[课程要求](COURSE_REQUIREMENTS.md)。这些事项不重新打开已确认的课题范围、P0/P1 或日期策略。

变更选型时直接更新本表及受影响文档，在 Issue/PR 记录日期、理由和评审结论；不要求另写决策文件。候选方案不能写成已实现能力。

## MF-04 依赖与版本核验方案

依赖变更时按以下清单核验官方安装说明、运行时要求和 peer dependencies；实际版本以 `package.json` 和 `pnpm-lock.yaml` 为准。下表保留各组合后续接入需要验证的边界。

| 组合 | 待核验内容 |
| --- | --- |
| Node.js、pnpm、Nuxt、TypeScript | 选择共同支持的 Node.js 版本，固定 pnpm 版本，启用严格类型检查；验证锁文件安装及根目录 Nuxt 构建启动 |
| Nuxt UI、Tailwind CSS、Nuxt | 按 Nuxt UI 官方集成方式配置；验证 SSR、水合、表单和弹窗的基本交互，页面效果手动验收 |
| AI SDK、Vue 客户端、Zod | 核验工具 schema、UI 消息流、transport 和历史消息转换；Provider 专用包按实际 adapter 引入 |
| PostgreSQL、Drizzle ORM/Kit、数据库驱动、Better Auth | 核验数据库 adapter、认证 schema 和统一迁移入口；基础建库及认证接入通过后再推进领域迁移 |
| Vitest、Nuxt Test Utils、Nuxt | 核验测试环境及配套依赖；运行领域与 Nuxt 集成样例，不引入 Playwright |

pnpm 安装策略、锁文件、运行时要求及不含真实凭据的配置示例已加入；README 记录 `typecheck`、`lint`、`build`、`test`、`test:integration` 和 `test:db`。代码检查使用 Nuxt ESLint 配套配置及公共导入边界规则。具体变更的验证结果记录在对应 Issue/PR；迁移、认证会话和真实 Provider 需分别验收。

UI 采用 [Nuxt UI](https://ui.nuxt.com/) + Tailwind CSS；MF-06/07/09/10/14/15 的页面实现以 MF-02 的 `prototype/` 和 [UI 原型交接说明](UI_PROTOTYPE.md) 为基线，使用 Nuxt UI 落地。保留已确认的布局、信息层级与关键交互，必要差异在 PR 中说明；原型未覆盖的部分补充设计后实现。模拟数据与操作须接入真实接口，不直接复用模拟认证、计费和任务逻辑，不迁入场景控制、演示角色切换或手动推进任务。MF-16 核对页面一致性与真实流程替换。对象存储服务、具体 Provider 及双积分业务参数仍由对应任务确定，不阻塞本项技术选型。

## 校验与测试约定

运行时校验采用 Zod，公共请求/响应 schema 统一放在 `shared/contracts` 并推导 TypeScript 类型；Provider 特有 schema 留在服务端适配器。共享类型不能代替对外部输入的实际解析与验证。

测试采用 Vitest 和 Nuxt Test Utils，分别覆盖领域规则、API/数据库及 Nuxt 组件和应用集成；首轮不引入 Playwright 或建立浏览器自动化测试入口。注册登录、对话确认、刷新恢复、试听下载和后台等关键流程按[测试计划](TEST_PLAN.md)手动验收并记录证据。

MF-04 已建立 Zod/AI SDK 与 Vitest/Nuxt Test Utils 的基础兼容性测试及可运行入口。数据库并发测试仍需由业务 Issue 使用真实 PostgreSQL，不能以连接检查替代事务、唯一约束和行锁验收。普通测试不调用收费 Provider，真实服务验证单独执行。

## 认证接入约定

采用 Better Auth 的邮箱密码认证和数据库会话。按官方 Nuxt 集成将 handler 挂载到 `server/api/auth/[...all].ts`，认证端点使用 `/api/auth/*`，前端通过 `better-auth/vue` 客户端调用；业务 API 保留 `/api/v1/*`。

首轮关闭 session cookie cache，每次受保护业务请求在服务端验证会话，并检查当前账户状态、角色和资源归属。退出撤销当前会话；停用账户撤销其全部会话，并由业务层阻止停用用户继续操作。页面导航守卫不能替代这些检查。认证端点保留 Better Auth 的 Origin/CSRF 防护，业务写接口另行执行同源及 CSRF 校验。

认证表由选定版本的 Better Auth schema 和数据库 adapter 确定，不另行假设密码保存在 users 表或会话令牌必定以摘要形式存储。MF-04 仅锁定依赖并验证 Better Auth、Drizzle adapter 与 Vue 客户端的实例构造；MF-05 建立统一迁移，MF-06 实现 handler 路由及注册、登录、退出、账户停用、越权和 CSRF 验证。当前没有已运行的认证业务。

参考：[Nuxt 集成](https://better-auth.com/docs/integrations/nuxt)、[会话与缓存撤销限制](https://better-auth.com/docs/concepts/session-management)。

## 数据库与迁移约定

采用 PostgreSQL + Drizzle。Drizzle 提供类型化数据访问，关键账本事务、行锁和任务领取允许使用显式参数化 SQL，不能以 ORM 调用替代对并发语义的检查。数据库连接及后续 schema、数据访问与迁移统一放在 `server/database`，仅由服务端使用。

以 Drizzle schema 维护物理定义，生成的迁移 SQL 经评审后提交仓库，并通过统一迁移入口应用；自定义约束及 SQL 同样纳入迁移。已应用的迁移不回写，后续变更新增迁移。Better Auth 所需 schema 也纳入这套迁移，避免两套工具分别管理相同认证表。具体命令在版本核验后建立。

MF-04 固定 PostgreSQL、Drizzle ORM/Kit、数据库驱动及 Better Auth adapter 的版本组合，验证连接和基础兼容性；MF-05 提供基础迁移并验证空库初始化、已有库升级及约束。账本与任务服务的集成测试使用真实 PostgreSQL，验证重复提交、余额并发、任务竞争领取及回滚；Mock 不能替代这些数据库语义测试。当前尚无已运行的业务迁移。

## 设计路线与系统边界

采用面向对象分析与设计，提供用例图、领域类图、状态图和时序图。已确认由同一 Nuxt 应用承载页面及 Nitro API，业务模块保持清晰职责；项目根目录采用 Nuxt 标准结构，暂不启动独立 Worker，也不拆共享包。任务执行方式由后续 MF-08 根据实际需求确定。首轮不按团队人数拆成三个微服务。

```mermaid
flowchart LR
    User[创作者或管理员] --> Web[Nuxt 与 TypeScript 页面]
    Web --> API[Nuxt Nitro API 与身份校验]
    API --> Account[账户与权益]
    API --> Agent[Agent 编排]
    API --> Assets[作品与推荐]
    API --> Billing[报价与积分]
    Agent --> Registry[受控工具注册表]
    Registry --> Jobs[任务服务]
    Jobs --> Billing
    Account --> DB[(关系数据库)]
    Assets --> DB
    Billing --> DB
    Jobs --> DB
    Executor[任务执行服务 待实现] --> DB
    Executor --> Provider[文本 音乐 语音服务适配器]
    Provider --> External[外部 AI 服务]
    Executor --> Storage[(私有文件或对象存储)]
    Assets --> Storage
```

外部 AI 服务不直接操作用户钱包或应用数据库。模型只输出工具建议和结构化参数；服务端负责身份、授权、额度、任务写入和产物提交。所有来自模型、上传文件及 Provider 的结果都按外部输入验证。

## 用例图

以下为标准 UML 用例图的 PlantUML 源码。仓库保留可编辑图源；汇入课程报告前需渲染，不将未渲染代码块当作最终图件。

```plantuml
@startuml
left to right direction
actor "访客" as Visitor
actor "创作者" as Creator
actor "管理员" as Admin
actor "AI 服务" as Provider
rectangle "MuseFlow" {
  usecase "注册与登录" as UC1
  usecase "对话创作" as UC2
  usecase "确认工具与报价" as UC3
  usecase "执行生成任务" as UC4
  usecase "查询与取消任务" as UC5
  usecase "管理与下载作品" as UC6
  usecase "查看推荐并反馈" as UC7
  usecase "查看积分与用量" as UC8
  usecase "授权与撤销声音" as UC9
  usecase "管理用户工具及权益" as UC10
  usecase "调整额度与核对异常" as UC11
  usecase "记录管理审计" as UC12
}
Visitor --> UC1
Creator --> UC1
Creator --> UC2
Creator --> UC3
Creator --> UC5
Creator --> UC6
Creator --> UC7
Creator --> UC8
Creator --> UC9
UC3 ..> UC4 : <<include>>
UC4 --> Provider
Admin --> UC10
Admin --> UC11
UC10 ..> UC12 : <<include>>
UC11 ..> UC12 : <<include>>
@enduml
```

确认并不保证执行成功；UC4 内部仍需校验报价有效期、余额和能力可用性。对话可以只做澄清而不调用生成工具，故 UC2 不必然包含收费执行。

## 模块职责与依赖

| 模块 | 负责 | 对外接口与限制 |
| --- | --- | --- |
| Identity | 注册、会话、角色、账户状态、个人工作空间归属 | 提供可信用户上下文；不接受客户端指定资源所有者 |
| Entitlements | 工具可用范围、时长规格、并发上限、方案版本 | 任务提交时检查并快照；不让新方案改变已确认任务的价格 |
| Conversation / Agent | 历史、上下文整理、意图澄清、工具建议、结果解释 | 通过 Tool Registry 操作；不直接写账本或伪造任务状态 |
| Tool Registry | 工具 schema、输入规范化、能力表和授权前置条件 | 只允许明确注册的工具；限制每轮步骤和请求预算 |
| Jobs / 任务服务 | 持久化任务、调度与执行权控制、Provider 调用、查询、结果落盘、故障恢复 | 任务为真实执行记录；耗时调用不得持有数据库长事务 |
| Billing | 报价、冻结、结算、释放、管理员额度调整、流水核对 | 金额由服务端计算；每个动作幂等；只修改归属钱包 |
| Assets | 歌词、音频、封面、声音样本的元数据、存储、预览下载与删除 | 私有存储；仅返回授权访问路径；产物保留来源标记 |
| Recommendation | 合法候选集、行为事件、偏好、排序理由、反馈 | 首轮标签算法；不读取其他用户私人作品或声音样本 |
| Admin / Audit | 操作权限、工具/权益/价格配置、异常处理与审计 | 密钥用外部配置引用；后台只显示掩码与配置状态 |

## 核心用例说明

| 用例 | 前置条件 | 主流程 | 异常或结束条件 |
| --- | --- | --- | --- |
| UC2 对话创作 | 已登录、会话归属当前用户 | 输入意图 → 澄清必要参数 → Agent 建议工具与输入 → 生成报价卡 | 无工具可用或无法满足需求时解释限制；不发起虚假任务 |
| UC3/UC4 执行 | 参数已固定、报价未过期、权益/授权满足 | 用户确认 → 原子创建任务并冻结 → 任务服务执行 → 校验入库 → 结算 | 余额不足不建任务；未知结果转核对；失败释放 |
| UC6 管理作品 | 当前用户拥有作品 | 查找 → 试听/阅读 → 下载或改名 → 可选择删除 | 非所有者无权访问；删除先撤销访问，再清理存储 |
| UC7 推荐反馈 | 已登录，可没有历史 | 计算候选 → 展示理由 → 试听/收藏/不感兴趣 → 更新偏好 | 关闭个性化后采用通用候选；删除的作品立即排除 |
| UC11 异常核对 | 管理员权限、存在待处理事项 | 查看脱敏请求证据 → 查询 Provider → 确认归档结算或失败释放 → 写审计 | 无证据不能随意改成功/失败；不能绕过账本直接改余额 |

## Agent 设计

采用受限的“观察 → 选择工具 → 确认 → 执行 → 观察结果”循环。首轮每次用户输入最多产生 3 个待执行步骤，每个收费步骤单独确认；模型上下文只带必要会话片段、当前用户选择的作品与可用工具能力。

已于 2026-09-20 确认使用 AI SDK 负责模型接入、流式响应和有界工具循环，TypeScript 领域模块负责工具注册、参数与权限校验、报价确认和任务创建。SDK 内的工具动作可以返回提议或 taskId；收费任务只有经服务端校验用户确认后才可创建，不应阻塞等待整首音乐生成。待任务结果入库后，再加载会话和工具结果进入下一轮。MF-04 已验证 Mock 模型消息流、Zod schema、Vue transport 和历史消息转换，尚未实现业务 Agent。

当前只有一个创作助手，每个收费步骤由用户确认，长时间等待由业务任务系统承接，因此首轮无需额外引入图编排框架。具体选择如下：

| 方案 | 本项目取舍 |
| --- | --- |
| 供应商 SDK + 自写循环 | 首轮不采用；若 AI SDK 无法正确支持目标服务，再以实际兼容性证据评审调整 |
| AI SDK + 持久化业务状态 | 已确认首轮采用；会话、授权、任务及计费恢复仍由项目实现 |
| LangGraph + 持久化 checkpointer | 当跨多阶段暂停恢复、条件循环、并行方案汇总成为明确需求时再评估 |

MF-04 初始化时锁定 AI SDK 与 Nuxt/Vue 的兼容版本，并建立基础接入验证；后续 Agent 接入验证目标模型的工具调用、Nuxt/Vue 流式交互、结果回填及确认后的恢复。已于 2026-09-20 确认采用 AI SDK 原生 UI 消息流协议；请求、事件与持久化映射见 [API 契约](API_CONTRACT.md#对话消息流与持久化)。报价、确认创建任务及任务查询仍使用独立业务 API，SDK 的 approval 或客户端工具结果不能代替服务端保存的用户确认、输入、报价及有效期校验，通用重试不能重复收费。未来引入图编排时，需验证 checkpoint 重放不重复创建任务；不能用内存 checkpoint 代替持久化恢复。

无论使用哪种 SDK，都应保存模型建议、参数校验结果、用户确认、tool call ID、task ID、真实结果与异常恢复，作为 Agent 行为证据。不要保存或展示模型私有思维过程。任务/积分状态仍以业务数据库为准，Agent 框架的 checkpoint 不能替代业务事务。

普通澄清和规划调用也有供应商成本：首轮不向用户钱包单独收费，但需服务端频率、并发和每日预算限制，并记录用量。预算耗尽时停止调用并提示。歌词生成作为明确工具动作按报价收费。

## 可切换供应商

此项接入方式已于 2026-09-20 确认。文本、音乐、TTS 分别建立能力接口，不预先绑定商业服务商。工具面向业务输入输出，Provider Adapter 负责供应商的请求格式、认证、流式/同步/异步结果和错误映射。

| 能力接口 | 负责内容 | 必须声明的差异 |
| --- | --- | --- |
| Text Provider | Agent 文本/工具调用、歌词生成、结构化结果；按能力支持流式响应 | 工具调用、结构化输出、流式支持；用于 Agent 的配置须满足相应能力 |
| Music Provider | 音乐任务提交、受理标识、结果查询和产物获取 | 歌词/纯音乐、时长规格、查询、幂等、取消；不支持的动作明确返回不可用 |
| Speech Provider | 文本、音色、语言等输入到语音产物；必要时查询异步结果 | 语言、音色、格式、同步或异步模式，以及克隆音色支持范围 |

管理员通过配置选择已实现的 adapter，并设置服务地址（如需要）、模型、凭据引用和能力参数；各类可使用不同供应商。相同协议的服务可以复用适配器，但不承诺任意服务仅修改 base URL 即可使用。模型与业务代码不接收用户随意指定的服务地址或密钥。

切换默认配置只影响新的模型请求和新报价。已签发报价固定原供应商配置版本，确认后任务复制该快照；在途任务、后续查询/取消和已有声音档案始终路由到其原供应商。原配置不可用时要求重新报价确认或进入异常处理，不能自动改用另一服务重复生成。正在进行的文本流保留原请求连接，下一轮再读取新默认配置。

本阶段只需接口、配置、必要的适配器与 Mock；不扩展为自动负载均衡、跨供应商故障切换或插件市场。详细契约见 [API 文档](API_CONTRACT.md#provider-内部契约)。

## 推荐闭环

1. 候选集由允许使用的素材目录、当前用户自己的可用作品及人工维护的灵感条目组成；素材目录必须附来源与使用范围。
2. 输入为用户主动选定的风格标签，以及创建成功、试听、收藏、不感兴趣等去重事件；重复播放需要频次上限，避免刷偏好。
3. 首轮可用可解释评分：标签相似度 × 权重，加收藏/创作偏好和适度新鲜度，减不感兴趣惩罚。权重在 M1 固定为版本化配置，测试使用固定候选和事件验证变化。
4. 每次推荐保存规则版本、候选来源和理由标签。推荐服务返回“近期偏好轻音乐”等可核验理由，不生成“其他用户都喜欢”之类无数据支持的话术。
5. 用户可关闭个性化或重置偏好；重置不删除作品，但清除用于推荐的个人事件和偏好快照。被删除/禁用的资源不进入候选。

该方案满足行为影响后续推荐的产品闭环，尚不包含训练模型、协同过滤或向量数据库。

## 文件存储约定

开发期使用私有本地目录，部署期使用私有对象存储，统一通过 Storage Adapter 读写。对象存储服务、SDK、区域及容量预算在部署时选择，不作为当前接口设计的前置条件。

数据库保存逻辑 `storage_key` 等元数据，业务模块不依赖本地绝对路径或供应商公开 URL。音频、封面和声音样本不能放入 Nuxt `public` 目录或公开 bucket。预览和下载沿用鉴权后的内容 API，校验归属及资源状态，并支持音频 Range；存储 adapter 不代替业务授权。

本地运行时 Nuxt 服务端访问配置的私有存储根目录；部署后访问同一私有对象存储。产物暂存、校验、幂等归档以及删除先撤销访问再清理文件的规则沿用现有流程。adapter 的读写、Range、删除及归档失败恢复在实现后验证；选型确认不代表这些能力已验收。

## 部署和恢复提案

首轮本地运行 Nuxt 应用（页面与 Nitro API）、关系数据库及私有存储，暂不部署独立 Worker。建议 Nuxt 采用 Node.js 服务端部署，Web 与 API 保持同源，简化 Cookie、跨域与访问控制；外部 Provider 凭据仅由后端读取。远程环境使用 HTTPS。后续后台任务必须有持久化与恢复机制，不能依赖请求结束后的进程存活假设。

任务以数据库记录作为事实来源。MF-08 在 `server/` 内实现统一任务服务，按 Provider 能力确定派发、回调、查询与恢复触发方式；不得依赖请求结束后无人管理的 Promise。取得执行权与取消操作使用短事务锁或版本条件互斥，外部调用期间不持有数据库长事务。若采用租约，应验证旧令牌不能提交；中断恢复先判断 Provider 是否已接受请求，再决定查询或安全重试，不能把所有中断直接重排。只有观测到吞吐或运维需求后才讨论独立消息队列。

数据库事务不能覆盖外部网络与对象存储。任务使用稳定请求标识、暂存对象、结果校验和幂等提交补足边界；无引用的暂存文件由清理任务回收。详情见[创作与积分流程](WORKFLOWS.md)。

任务执行中重启后的状态与账本恢复属于核心正确性验证。每日备份、保存周期和备份恢复演练作为实际部署时的可选工作，不增加为课题完成门槛；没有实测前不声称可用性或容灾等级。

## 建议代码布局

项目根目录就是 Nuxt 应用根目录，暂不设独立 Worker 或多包 workspace。MF-02 静态原型位于 `prototype/`，不参与 Nuxt 页面路由或静态资源发布。

```text
app/                     页面、组件、样式和 composables
server/api/              Nitro HTTP 入口，保留 /api/v1 契约
server/services/         服务端配置和后续业务服务
server/database/         数据库连接；迁移及 schema 由 MF-05 建立
shared/contracts/        前后端公共 Zod schema 和类型
prototype/               独立静态原型
tests/                   单元、Nuxt 组件及 SSR/API 集成测试
nuxt.config.ts           Nuxt 配置
```

使用 Nuxt 4 默认 `app/`、`server/` 与 `shared/`，不自定义 `srcDir`；`server/modules` 留给 Nitro 扩展模块，业务代码使用 `server/services`。根目录 tsconfig 引用 Nuxt 生成的 app/server/shared/node 四个类型上下文，不覆写生成的路径别名。公共 schema 通过 `#shared/contracts/health` 等路径显式导入，不重复维护。

前端和 shared 不能依赖数据库或服务端配置。ESLint 检查直接导入、再导出、动态导入和 require；新增客户端依赖需显式更新允许列表并评审。共享 TypeScript 类型不能替代运行时验证，HTTP 和 Provider 响应均须校验。Nuxt 页面路由中间件只处理页面导航，API 必须在 Nitro 服务端独立鉴权。

## 选型参考

原选型分析参考了 [Nuxt 服务端目录](https://nuxt.com/docs/4.x/directory-structure/server)、[AI SDK Nuxt 指南](https://ai-sdk.dev/docs/getting-started/nuxt)、[ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)、[PostgreSQL 行锁](https://www.postgresql.org/docs/17/explicit-locking.html)及 [LangGraph 持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence)文档。初始化时按选定版本复核；这些资料不能代替本项目的兼容性和恢复测试。
