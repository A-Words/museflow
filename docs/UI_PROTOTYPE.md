# MF-02 核心页面与交互原型

关联 [Issue #2](https://github.com/A-Words/museflow/issues/2)，覆盖 FR-01～FR-08、FR-10、NFR-06；FR-09 的声音授权随 P1 实现，本次只标注入口边界。本文和原型是设计交付，不是生产功能验收。

## 1. 目标、基线与范围

交付可运行的六类页面、可点击的创作旅程、组件说明、状态矩阵与接口映射。使用独立 HTML/CSS/JavaScript，不安装 Nuxt、Worker、数据库、认证、支付或收费 Provider，不承担 MF-04。

2026-09-20 开工检查：当前分支为 `docs/mf-02-prototype`，工作区干净，无既有原型。检查仓库及上级目录未发现适用 AGENTS.md；已阅读 CONTRIBUTING.md 和 PRD、ARCHITECTURE、API_CONTRACT、WORKFLOWS、DATA_MODEL、TEST_PLAN、ISSUE_BACKLOG。通过 GitHub 连接读取 Issue 最新正文：无前置依赖，要求主旅程、来源/计费/失败差异、API 状态映射及键盘/窄屏说明。远端 assignee 为 LazySlippers，正文仍保留初始“未认领”文字；以远端字段为准，本次未改认领、未发送评论。

设计先按提议、确认、任务、结算的状态关系搭建低保真交互，再应用颜色、间距、字体和响应式样式；不改变公共业务规则。公共文档的业务规则保持原样，设计差异见第 12 节。

## 后续 Nuxt 实现约定

MF-06/07/09/10/14/15 分别基于本原型实现注册登录、积分用量、对话工作区、作品库、推荐及后台，使用 Nuxt UI 在根目录 `app/` 中落地，接口与业务服务放在 `server/`。保留已确认的布局、信息层级及关键交互，必要调整在 PR 中说明；原型未覆盖的功能先补充设计。MF-16 对照本说明验收页面一致性与真实流程替换。

原型中的模拟认证、计费和任务逻辑不能直接作为生产实现复用。加载、空态、错误、权限和任务状态应由真实接口驱动，测试 Mock 与真实结果明确区分。场景控制、演示角色切换及手动推进任务等原型辅助功能不迁入正式页面。P1 未覆盖的页面另行补充设计。

## 2. 启动与评审

在仓库根目录运行（Python 3 标准库，无第三方安装）：

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory prototype
```

浏览器打开 <http://127.0.0.1:4173/>。停止服务用 Ctrl+C。无需构建。推荐 HTTP 打开，不将 `file://` 双击作为验收路径（UUID、安全上下文和存储支持随浏览器不同）。

入口：[prototype/index.html](../prototype/index.html)。文件组织：

- `index.html`：语义骨架、全局模拟标识、状态播报和原生 dialog。
- `styles.css`：Design Tokens、布局、组件与断点。
- `model.js`：纯本地状态模拟器、报价/任务/账本与演示数据。
- `app.js`：页面、导航、表单、场景及本地交互。
- `assets/cover.svg`、`assets/sample.wav`：自制素材；`generate_sample.py` 可重新生成音频。
- `check-model.cjs`：无需框架的风险定向状态检查，运行 `node prototype/check-model.cjs`（实测 Node 22.20.0）。

模拟邮箱默认 `creator@example.test`，密码是不可编辑占位，不读取、不发送、不保存真实密码，邮箱和昵称不写入存储。点击“模拟登录”进入工作区；注册页同样只有模拟提交。

顶栏下展开“演示场景 · 原型辅助功能”，选择状态后“载入场景”，确认替换本标签页数据。每个场景有独立一致的余额和流水，不在既有任务上篡改终态。任务通过“推进模拟任务”手动排队 → 运行 → 成功，便于评审停留观察；不是允许用户控制生产任务状态的设计。

本地 `sessionStorage` 键为 `museflow-mf02-v1`，只保存本标签页的演示会话、任务、作品元数据、偏好和账本。刷新恢复本地快照；关闭标签页后不保证保留，更不模拟后台持续执行。关闭页面没有发送取消操作。需要干净起点时使用“重置全部演示数据”。不要输入私人内容。

## 3. 信息架构与导航

```text
注册 / 登录（访客）
└─ 模拟个人工作空间
   ├─ 创作工作区 → 会话 → 参数提议 → 报价 → 任务 → 结果
   │                                                   ├─ 作品详情
   │                                                   └─ 关联积分流水
   ├─ 作品库 → 搜索 / 类型 / 风格 / 日期 → 详情
   │                                      ├─ 人工歌词新版本
   │                                      └─ AI 改写 / 以歌词生成音乐 → 新会话
   ├─ 灵感推荐 → 标签 / 收藏 / 不感兴趣 → 创作起点
   ├─ 积分与用量 → 双钱包 / 方案 / 任务统计 / 流水
   └─ 原型辅助功能 → 查看管理后台演示 → 演示角色切换 → 用户 / 工具 / 版本 / 异常 / 审计
```

桌面左侧固定信息层级，右侧为主内容；工作区侧栏提供会话、当前任务状态和工具能力说明。音频样例在生成结果、作品详情或推荐卡内就地试听，默认不自动播放。窄屏将导航改为可水平滚动的紧凑条，内容卡片单列，任务状态移到对话之前。场景控制与角色切换始终注明原型辅助，正式产品不迁移这些控制。

核心旅程由对话中的参数提议、报价和任务卡，以及右侧动态状态共同表达。页面不再额外重复步骤导航，以减少纵向占用和视觉噪声。

## 4. 核心评审旅程

1. 模拟登录；页面保持普通邮箱、密码和主按钮结构。使用无效邮箱可检查表单校验，`error@example.test` 与 `disabled@example.test` 分别用于评审失败和停用状态，不在用户界面展示原型开关。
2. 点击“写一首晚风的歌”，或输入意图。助手请求语言、风格、内容等缺失参数；仅固定规则模拟，不是模型推理。
3. 确认参数，看到 `lyrics.generate` 提议；此时任务数、冻结额不变。
4. 获取报价：演示创作积分 8、可用 120、冻结 0、价格版本、10 分钟有效期。点击“确认并冻结”才创建任务。
5. 排队可取消；用辅助按钮推进到运行，再推进成功。成功后 8 从冻结结算，余额 112 / 冻结 0。
6. 结果可阅读、下载歌词、进入作品详情；人工编辑保存 `manual` 新版本，不收费，既有音频不变。
7. 选择“以此歌词继续生成音乐”，引用具体 `lyricsAssetId`；生成新提议，再报价 24，再明确确认。不会自动运行第二个收费步骤。
8. 推进音乐任务，显示自制音阶播放器和下载入口。样例不是根据本次输入生成的音乐。
9. 在作品库检索与查看音乐、歌词或封面；详情链接原会话和任务流水。音乐详情保留选定歌词版本 ID。
10. 积分页查看 8 + 24 的创作结算；语音钱包仍为 60。另建会话选择“把文字读出来”可演示 `speech.synthesize` 报价 6，单独使用语音钱包。

所有生成结果都是固定 Mock；TTS 只演示工具、参数、任务、独立积分及播放器布局，没有可用人声结果。音阶仅为媒体测试替身，有紧邻说明。

## 5. 页面与可复用组件

| 组件 / 页面 | 内容与行为 | Nuxt UI 迁移方向（待 MF-04 安装验证） |
| --- | --- | --- |
| AppShell / DemoBanner | 全局来源、个人空间、五项导航、退出 | 页面布局、导航、Badge |
| AuthForm | 全屏双栏登录、右上角“图标 + 中文”注册入口、单一主提交、标签校验、提交禁用、错误关联、停用说明 | Form、FormField、Button、Icon、Input、Alert |
| ConversationPanel | 会话列表、消息、草稿、缺参澄清 | 自定义消息组件 + Textarea |
| ProposalCard | 工具名、可编辑内容、固定能力参数、引用歌词 | Card、Select、Form |
| QuoteCard | 币种、数值、价格版本、有效期、余额、明确确认 | Card、Button、Alert |
| TaskCard | 状态文字、来源、冻结状态、taskId、allowedActions | Badge、Card、状态播报 |
| AssetCard / AssetDetail | 封面/歌词/音频、来源、版本、关联任务、改名/删除 | Card、Modal、原生 audio |
| InlineAudioPreview | 当前样例、来源和原生播放控制；留在相关结果卡内且不自动播放 | Card、原生 audio |
| RecommendationCard | 理由、标签、同一测试音频、收藏/负反馈/采用 | Card、Button、Checkbox |
| WalletSummary / Ledger | 两个钱包、方案限制、次数与结算统计、流水 | Card、Table |
| ReasonDialog / AdminPanel | 原因必填、明确确认、审计、证据选项 | Modal、Form、Table |

视觉采用浅灰画布、白色卡片、紫色主操作、柔和原创波纹。`styles.css` 的 `--primary`、`--surface`、`--ink`、`--muted`、`--line`、`--good`、`--warn`、`--bad`、`--radius` 为基础 tokens；常用间距 8/16/24/32px，卡片圆角 16px，控件圆角 9px，正文 14px，标题 24～28px。状态同时使用文案和 Badge，不靠颜色辨识。系统字体，无外部字体或 CDN。

管理价格与权益只演示发布递增版本，不提供复杂编辑器；示例金额不改变。异常核对提供“无证据”“模拟明确失败”“模拟找到结果”三种证据路径；无证据不改任务或冻结。管理员额度调整用精确整数，禁止负余额且不能动用冻结额度。原因和操作追加到本地审计列表。

## 6. 状态展示矩阵

契约来源：[API_CONTRACT](API_CONTRACT.md#关键数据结构)、[WORKFLOWS](WORKFLOWS.md#任务状态)。TaskStatus **仅有** queued / running / reconciling / cancel_requested / succeeded / failed / canceled。空、加载、余额不足和报价过期等是视图、消息或错误状态，不能加入 TaskStatus。

| API 字段及值 / UI 状态 | 页面文案与视觉 | 允许操作 | 积分状态 | 恢复 / 下一步 |
| --- | --- | --- | --- | --- |
| `items=[]`；UI 空态 | “今天，想创造什么声音？”或无匹配作品，空态图形 | 输入意图、调整筛选、创作 | 不变 | 获取列表或创建会话 |
| 请求 pending；UI 加载 | “正在加载会话历史”，role=status | 原型按钮结束加载 | 不变 | 正式 GET 历史；未构造假任务 |
| 完整 tool call + Quote，尚无 Task | 紫色“等待明确确认” | 编辑参数、获取报价、确认 | 不冻结 | `POST /quotes` → 用户确认 → `POST /tasks` |
| `error.code=INSUFFICIENT_CREDITS` | 红色余额不足文案 | 调整参数、联系演示管理员；确认禁用 | 不新增冻结 | 增加可用额或新的合法报价后再确认 |
| `Quote.expiresAt` 已过期 / `QUOTE_EXPIRED` | 警示“报价已过期” | 重新报价；无旧确认入口 | 不变 | 新 quoteId，再明确确认；提交时二次检查 |
| `INPUT_CHANGED` | 修改参数作废报价 | 重新补齐、报价 | 不变 | inputHash 与确认输入一致 |
| `Task.status=queued`，`allowedActions=['cancel']` | “排队中” + Mock | 请求取消、查询 | held | 领取后 running；取消确认后 canceled |
| `running`，`allowedActions=['cancel']`（支持取消的示例） | “运行中” | 请求取消、查询 | held | 查询原 taskId；页面关闭不取消 |
| `running`，`allowedActions=[]` | “运行中”；无取消按钮 | 只查询 | held | `CANCEL_NOT_SUPPORTED` 不能转失败/退款 |
| `succeeded`，`allowedActions=['view_result']` | 绿色“已交付”，作品卡 | 查看、试听、下载、关联流水 | captured | 已归档后结算；变体需另建任务 |
| `failed`，`allowedActions=['requote']` | 红色“明确失败” | 重新报价、查询、流水 | released | 新任务保存 retryOfTaskId，重新确认 |
| `cancel_requested`，`allowedActions=[]` | 橙色“取消请求处理中” | 查询；无重复取消或再次付费 | held | 可转 canceled/succeeded/failed/reconciling；辅助推进示例选 canceled |
| `canceled`，`allowedActions=['requote']` | “已取消” + 已释放 | 重新报价、查询 | released | 可开始新的确认尝试 |
| `reconciling`，`allowedActions=[]` | 橙色“正在核对”，明确不确定 | 查询原任务、查看流水；管理员证据核对 | held，不能超时自动释放 | 查询/归档/人工核对，禁止重新付费提交 |
| `messages.status=interrupted` | “消息 interrupted”，保留草稿 | 恢复历史 | 已有任务不变 | GET 历史 + GET 原任务；不续传任意 token |
| 网络失败（无可靠 Task 响应） | “网络异常不代表生成失败” | 恢复并查询原任务 | 原快照不变 | 正式响应丢失用原幂等键查询式重送；不换新 key |
| `sourceMode=mock` | 紫色 Mock + 全局模拟标识 | 按任务允许操作 | 仅演示钱包 | 不计入真实服务验收 |
| `Task.sourceMode=real` 样式夹具 | “真实来源 · 仅样式示例”；全局模拟标识仍在 | 查看测试样例 | 仍是模拟 | 夹具只演示标签，Asset 保持 mock，绝非真实调用 |
| `Asset.sourceMode=manual` | “人工版本 / 自制素材” | 查看、下载、创建歌词新版本 | 人工编辑不扣费 | parentAssetId 追溯，不更新旧音频 |
| 账户停用 / 401 / 403 | 登录错误区域 / 后台权限说明 | 联系管理员、模拟退出 | 不能新建冻结 | 正式认证错误遵循 Better Auth 原生协议 |
| 删除 `202 deletion_pending` / `204` | 确认后移出可访问列表，保留不含正文的删除回执 | 查看回执、模拟完成清理；不能预览/下载 | 保留任务与账本 | 生产按 202 轮询或 204 完成；被报价引用的作品删除后禁止确认 |

查询按钮是页面读取原任务的通用动作，不将 `query` 发明为 `allowedActions` 新枚举。“推进模拟任务”和场景切换是原型辅助，不映射业务 API。

## 7. API 字段与页面映射

除认证外路径前缀为 `/api/v1`。以下是后续实现映射，原型不发送这些请求。

| 页面动作 | 契约路由 / 字段 | 原型对应与边界 |
| --- | --- | --- |
| 注册 / 登录 / 退出 | `/api/auth/sign-up/email`、`sign-in/email`、`sign-out` | 本地 boolean，不是 Better Auth 实现，不持久化密码 |
| 身份 / 权益 / 能力 | GET `/me`、`/tools` | Mock 工具表；实际工具/规格必须来自服务端 |
| 会话 / 历史 / 消息 | GET/POST `/conversations`；GET/POST `/conversations/:id/messages`；content、selectedAssetIds、clientMessageId | 本地会话和固定文本；不实现 AI SDK SSE/UIMessage 传输 |
| 参数编辑 | PATCH `/tool-calls/:id` input、version | 新建本地提议并使旧报价失效；未实现版本竞争 |
| 报价 | POST `/quotes` toolCallId → id、inputHash、currency、amount、priceVersion、expiresAt | UUID、字符串积分、UTC ISO 日期；inputHash 仅 JSON 字符串比较，非生产 hash |
| 确认 | POST `/tasks` quoteId、retryOfTaskId? + Idempotency-Key | 同 quoteId 返回原 task；不实现数据库唯一约束与 HTTP 幂等中间件 |
| 查询 / 取消 | GET `/tasks/:id`；POST `/tasks/:id/cancel` | status、sourceMode、assetIds、reservation、allowedActions、createdAt、updatedAt；本地读取和状态机 |
| 作品检索 | GET `/assets` q、kind、tag、from、to、cursor | 标题/歌词子串、类型、标签、起止日期与本地访问状态；分页交接后续，访问状态不新增后端枚举 |
| 作品详情 / 改名 | GET/PATCH `/assets/:id` title、tags、coverAssetId、version | 本地标题；封面自制固定样例；无上传和并发编辑 |
| 人工新版本 | POST `/assets/:id/versions` textContent | 新 id、parentAssetId、sourceMode=manual；不消耗积分 |
| 试听 / 下载 / 删除 | GET `/assets/:id/content`；DELETE `/assets/:id` | 静态 WAV/SVG 或歌词 Blob；无鉴权、Range 代理、签名链接及存储删除 |
| 推荐 / 反馈 | GET `/recommendations` reasonTags、runId；POST `/behavior-events` | 固定三条自制灵感，标签/收藏优先，负反馈隐藏；无真实事件采集、去重或 runId 服务 |
| 偏好 | PATCH `/me/preferences` personalizationEnabled；DELETE `/me/preferences/history` | enabled 对应 personalizationEnabled；关闭停止本地反馈，重置不删作品和流水 |
| 钱包 / 流水 / 用量 | GET `/credits/accounts` available、held；GET `/credits/entries`；GET `/usage` | 两个独立钱包、任务统计；kind 取自 DATA_MODEL/WORKFLOWS 的 grant/reserve/capture/release/adjustment |
| 后台用户 / 额度 | PATCH `/admin/users/:id/status` status、reason；POST `/admin/credit-adjustments` currency、delta、reason | 演示启停和精确整数调整、原因审计 |
| 工具 / 价格 / 权益 | POST `/admin/tool-configs`、`/admin/price-rules`、`/admin/plan-versions`；PUT 用户 entitlement | 开关及递增版本演示，无真实配置发布 |
| 异常核对 / 审计 | GET `/admin/tasks` status、age；POST `/admin/tasks/:id/reconcile` evidenceRef、requestedAction；GET `/admin/audit-logs` | 固定模拟证据选择，不能任意覆盖终态；生产必须外部验证证据 |

后续实现应采用共享 Zod schema，不能从原型 UI 反向定义服务端状态。Task 的业务额外字段（quoteId、tool、input、conversationId）只是模拟存储关联；不声称它们已包含在当前 Task HTTP DTO。Asset 的 version、camelCase 映射依据逻辑模型与路由用途，完整响应 schema 尚待相关任务确定。

## 8. 双积分与一致性

名称“创作积分 creation / 语音积分 voice”、初始发放 120 / 60、价格 8 / 24 / 6、10 分钟有效期、8 秒音频和并发 1 全是演示提案，不是已确认商业规则。没有支付或充值入口。

`model.js` 钱包和流水对外保存十进制字符串，用 BigInt 加减。初始发放可重建余额。每个任务只使用一个币种：冻结 available -= q、held += q；成功归档后 held -= q 并 capture；明确失败或成功取消 available += q、held -= q 并 release；核对中不变。终态不能被另一个终态覆盖。重复确认同 quoteId 返回原任务，不再次冻结。失败再次尝试创建新的报价及任务，关联 retryOfTaskId。

这是单标签页内的模拟一致性，不证明多进程、数据库事务、并发、回调乱序、任务执行权控制或真实服务账本正确。

## 9. 键盘、窄屏与可访问性要求

使用 main/nav/header/aside/form/button、显式 label、表单错误关联、原生 dialog 和 audio。全局 `role=status` 播报关键操作，错误用 alert。焦点样式为 3px 紫色轮廓；跳转链接可跳到主内容。dialog 打开聚焦首控件，原生模态约束 Tab；Escape 或返回关闭后恢复触发按钮，原按钮不再存在时回主内容。

目标断点：>1050px 为双栏工作区；650～1050px 侧栏下移；≤650px 单列、紧凑导航和换行按钮。表格在自身容器内滚动，不扩展页面；UUID 自动换行。音频不自动播放。

未经过完整屏幕阅读器、对比度、放大和跨浏览器审计，不宣称 WCAG 或其他认证。已执行的局部键盘和宽度检查见下节。

## 10. 模拟数据与素材来源

所有歌词、标题、推荐理由和风格文案为本次原创演示文本（AI 辅助编写，经本次实现者核对范围）；未复制歌曲。`cover.svg` 是本次编写的渐变、曲线和圆形矢量插画；CSS 渐变封面无需外部素材。`sample.wav` 由同目录 Python 脚本用正弦波自行合成，8 秒、22050Hz、16-bit、单声道，无真人声音、录音或采样。本次自制素材可随项目源码用于课程演示、修改和分发，不代表真实生成作品，也不赋予任何第三方素材权利。

所有推荐卡共用同一音阶，只用于控件测试，不代表所标风格的歌曲质量。TTS 不提供人声结果；翻唱、声音克隆与授权档案明确 P1 未开放。没有外部图片、字体、密钥、账户令牌、私人作品或人声样本。

## 11. 实际检查记录

执行日期：2026-09-20～2026-09-21；Windows、Node 22.20.0、Python 3.13、Codex 内置浏览器，127.0.0.1:4173。下面仅为 MF-02 模拟原型检查，不修改 TEST_PLAN 中真实功能用例状态。

按 2026-09-21 读取的 Issue #2 最新正文逐项复核：六类页面、主旅程、空/加载/确认/不足/失败/核对状态、Mock/真实来源样式、冻结/结算/释放、失败/未知差异、API 状态映射、键盘和窄屏说明均已交付。Issue 的完成流程还要求另一成员评审及 PR 合并证据；在取得这些证据前不把 Issue 标记为已关闭。

| 检查 | 实际结果 |
| --- | --- |
| `node --check` app.js / model.js | 通过；初次发现 model.js 数组括号缺失，修正后复查通过 |
| `node prototype/check-model.cjs` | 19 项通过：含未确认不建任务、重复确认幂等、结算/释放一次、未知保留冻结、取消、过期/不足、双钱包、JSON 恢复、重试关联、精确整数、输入/工具/并发拦截；并覆盖重试编辑继承、被删歌词引用、派发前删除、取消能力保持、人工版本隔离、输入快照和双账本重建 |
| 登录及校验 | 浏览器正常登录、提交中、无效邮箱、停用提示可观察；另一次模拟错误提示已观察 |
| 登录按钮层级 | 9 月 21 日按页面截图复查：宽屏页面铺满可用高度，默认显示登录；注册降为右上角紧凑的“用户加号 + 注册”入口，注册页显示“返回箭头 + 返回登录”；页面只保留一个实心主提交。两种模式的标题、字段、焦点与按钮文案已在浏览器复验 |
| 歌词 → 音乐 | 浏览器完成澄清、提议、两次独立报价/确认、排队、运行、归档；歌词 8、音乐 24，创作余额 88、语音 60 |
| 双击确认 / 刷新 | 浏览器双击歌词确认出现一个 task；运行中刷新前后 taskId `b1422c76-f5ec-402c-a061-7f00f59cc3ca` 一致；状态检查覆盖十次重复提交 |
| 不足 / 过期 / 失败 / 核对 | 浏览器分别载入：不足确认 disabled；过期仅可重新报价；失败显示 release +24/-24、可用 120；核对 held 24、无再次付费按钮 |
| 后台核对 | 无证据、填写原因后，原任务仍 reconciling/held，追加本地审计 |
| 推荐 | 浏览器选“流行”后匹配卡排第一；关闭个性化后收藏按钮不可用 |
| 作品管理 | 封面详情、重命名为“微光 · 评审版本”、下载请求反馈、删除确认及空态通过浏览器操作 |
| 删除引用一致性 | 模型检查确认：歌词删除后不能报价或确认；排队后删除会在派发前明确失败并释放一次；浏览器显示无正文的 `deletion_pending` 回执及“模拟完成清理” |
| 窄屏 | 390×844 下读取 DOM 宽度：innerWidth=390、scrollWidth=375，无页面横向溢出；导航、后台、弹窗、推荐和作品操作已执行 |
| 局部键盘 | Enter 打开额度弹窗，初始焦点 currency；Escape 关闭后焦点回“调整演示额度”；390px 下用 Enter 确认报价、请求排队取消并确认，观察释放成功；9 月 21 日重命名弹窗 Tab 移至“返回”且焦点仍在 dialog 内，Escape 后回到“重命名” |
| 媒体播放 | **受阻，不能记通过**：内置浏览器点击 WAV 播放后出现页面崩溃；尝试已有 Edge 连接失败，未能完成可听播放复核 |
| 静态文件与媒体结构 | 9 月 21 日 Python wave 校验 WAV 为 PCM、单声道、16-bit、22050Hz、8 秒；SVG XML 解析通过；6 个 HTTP 静态资源返回 200 且字节与本地一致；这些检查不能替代可听播放 |
| 下载 | 浏览器 `download` 事件已触发；封面实际落盘为 `museflow-original-cover.svg`（905 bytes），音频下载事件也已触发。浏览器决定保存位置，未把下载等同于真实存储授权测试 |
| 屏幕与控制台 | 登录页截图已检查；首轮后续截图出现旧画面/截图失败，未记为有效证据。9 月 21 日重新获得有效 1440×960 工作区及 390×844 报价截图，卡片与按钮可见；宽度分别为 1425/1440、375/390，无页面横向溢出。非媒体巡检后控制台 error/warn 返回空列表 |
| 修复后回归 | `?v=3` 资源下复验：加载历史只显示加载态且发送禁用；歌词澄清→报价→双击确认只创建一个 task；推进成功后创作积分 120→112、结果卡可见；390×844 作品库起止日期/访问状态筛选可见且 scrollWidth 375；控制台无 error/warn |
| 人工版本与 AI 改写 | 9 月 21 日浏览器保存歌词 v2，显示 manual 和 parentAssetId，创作余额仍 112；AI 改写显示未执行提议，仍需获取报价 |
| TTS 模拟流程 | 9 月 21 日浏览器完成 6 语音积分报价、确认、排队、运行、样例归档；voice 可用 54 / held 0，creation 保持 112，关联 reserve/capture 一致；没有验证真人语音能力 |

未执行：真实认证/权限/Provider/支付、真实 TTS、数据库并发、AI SDK 流恢复、存储授权、真实取消与回调、完整屏幕阅读器审计、另一成员独立复现。这些不在原型实现范围，须由后续功能任务验收。

## 12. 设计冲突、限制和后续交接

1. CONTRIBUTING 默认业务代码 TypeScript；本任务明确优先独立静态 JavaScript，因此仅原型采用 JS，生产迁移仍遵循 TypeScript + Zod，不初始化工具链。
2. 两类积分的名字、价格、额度、权益、音色和时长规格未最终确认。本原型醒目标为提案，由 MF-07/Provider 任务评审；没有修改公共规则。
3. 当前 API 未完整定义用户 status、工具可用性、Asset 状态/版本、推荐事件类型、后台列表 schema；原型内部 boolean/筛选是 UI 夹具，不新增后端枚举。访问状态筛选和删除回执只用于表达可访问性及清理过程；分页、上传和真实删除轮询交接 MF-10。
4. 查询/消息恢复只读本地快照。生产必须从持久化历史与独立 Task 查询恢复，不信任旧卡片；未知结果不重新提交，响应丢失复用原 key。MF-08/MF-09 补真实恢复。
5. 页面按本地数据重新渲染；音频控件属于当前结果或详情卡，切换页面时停止并卸载。它仍只播放同一个本地样例，不提供播放列表、后台媒体会话、流式音频、真实模型或根据输入生成内容。播放崩溃目前未能确定是浏览器环境还是媒体兼容问题，需团队在 Chrome/Edge 手动复核。
6. 后台角色是演示开关；本地参数可被开发工具修改，不提供安全边界。用户停用阻止新任务，排队推进时检查开关；真实撤销会话、并发停止和后台权限留给 MF-06/MF-15。
7. 价格/权益递增版只作示意，未实现完整历史配置检索、权限审计落库或 Provider 切换；旧报价金额保留原快照。正式供应商配置始终服务端保密。
8. “真实来源样式”只改夹具 Task 的标签，作品仍为 mock，并保留全局模拟提示；不得用于宣称真实服务成功。
9. 交接建议：MF-06 接认证；MF-07 接钱包与报价；MF-08 接任务查询与取消；MF-09 接会话/Agent；MF-10 接作品；MF-14 接推荐；MF-15 接后台。移植组件时删除场景控制、模拟角色及手动推进，保留 UI 状态文案、确认边界与来源说明。
10. Issue #2 的完成验收要求：另一成员评审、合并及证据确认；满足这些要求后方可关闭 Issue。

## 13. 建议提交与 PR

Conventional Commit：

```text
feat(prototype): add MF-02 core page flows and state mapping
```

PR 标题：`feat(prototype): MF-02 核心页面与交互原型`

PR 正文建议：

```markdown
## 目的与关联

Refs #2。为 FR-01～FR-08、FR-10、NFR-06 提供可评审的六类页面与交互依据；P1 标注边界，不实现真实认证、Provider、数据库或支付，不承担 MF-04。

## 变更后的行为

新增独立静态原型。用户可从模拟登录、意图澄清、参数提议和逐步报价确认，走到任务、样例作品及关联流水。失败与取消释放、未知结果冻结、过期重新确认、重复确认幂等以契约状态呈现。包含作品版本、推荐反馈、后台原因确认和原型场景切换。

## 接口 / 文档

新增 docs/UI_PROTOTYPE.md，记录 IA、组件、状态矩阵、API 映射、双积分提案、素材来源与交接限制；公共业务契约未修改。README 补原型入口。

## 验证与证据

Node 语法检查与 19 项本地状态检查通过。浏览器执行歌词到音乐逐步确认、刷新原任务恢复、关键异常、关联流水、推荐与作品管理及局部键盘/390px 检查。对应 T-01/03/06/08/09/10/12/14/15/16/17/23/24 的设计场景，不能代替这些真实功能测试。

WAV 元数据、浏览器媒体就绪状态和音频/封面下载事件已验证，封面文件已确认落盘；内置浏览器点击原生播放控件导致标签页关闭，Edge 连接不可用，因此可听试听仍保留为未完成。详见 UI_PROTOTYPE 的实际检查记录。

## 待评审

请另一成员检查积分名称/参数提案、完整媒体播放、窄屏视觉和状态/API 对齐；后续实现按对应功能 Issue 迁移。
```

### 本轮导航与滚动修正

管理后台演示入口移入顶部“演示场景 · 原型辅助功能”，不再占用创作者主导航。桌面和窄屏均保持导航与顶栏可见，正文独立滚动；切换主导航回到正文顶部，同页更新保留滚动位置，恢复焦点不触发浏览器自动滚动。正式产品仍需由服务端验证管理员权限和资源归属，入口调整不构成权限隔离。
