# MuseFlow

MuseFlow 是《软件工程课程设计》课题十二「AI音乐创作SaaS平台系统」的协作仓库。项目围绕对话式音乐创作、个性化推荐、生成物管理和用户双积分计费展开。

**需求和设计基线已具备，可以开始按 Issue 协作开发。** MF-04 提供根目录 Nuxt 4、公共契约和服务端数据库连接骨架；`prototype` 保留 MF-02 独立静态交互原型。业务认证、生成、计费及业务表尚未实现。

## 评审页面原型

在仓库根目录执行 `python -m http.server 4173 --bind 127.0.0.1 --directory prototype`，浏览器打开 <http://127.0.0.1:4173/>。无需安装前端依赖，Ctrl+C 停止服务。

后续 MF-06/07/09/10/14/15 页面以 MF-02 原型为基线，使用 Nuxt UI 实现；必要设计调整在 PR 中说明，MF-16 验收原型一致性及真实流程替换。

原型覆盖模拟登录、创作工作区、作品库、灵感、双积分和后台。工作区通过对话、参数提议、报价、任务卡和右侧当前状态呈现完整创作流程；音频样例在结果或详情卡内试听。顶部“演示场景”可切换异常状态。所有生成、账户与积分均为本地模拟。启动、素材、接口映射、实际检查及限制见 [UI 原型交接说明](docs/UI_PROTOTYPE.md)。样例音频元数据、加载和下载已验证，可听播放仍需外部浏览器复核；这些检查不能视为真实 Provider 验收。

MF-02 的本地原型与说明已具备评审条件；完成验收要求包括关联 PR、另一成员评审和合并证据，满足这些要求后方可标记为“已完成”。

## 从这里开始

| 文档 | 解决的问题 |
| --- | --- |
| [产品需求 PRD](docs/PRD.md) | 给谁用，做什么，首轮做多少，如何验收 |
| [系统架构与技术选型](docs/ARCHITECTURE.md) | 已确认与待定选型、Agent 方案、模块职责和部署设计 |
| [数据模型与字典](docs/DATA_MODEL.md) | 核心实体、关系、约束、索引及数据生命周期 |
| [创作与积分流程](docs/WORKFLOWS.md) | Agent 如何调用工具，异步任务和积分怎样保持一致 |
| [接口契约草案](docs/API_CONTRACT.md) | 前后端、Agent、任务服务如何协作 |
| [测试与验收计划](docs/TEST_PLAN.md) | 功能、隔离、故障、推荐和计费需要什么证据 |
| [可认领 Issue 清单](docs/ISSUE_BACKLOG.md) | 推进阶段，每项的范围、依赖、验收条件和完成证据 |
| [协作约定与模板](CONTRIBUTING.md) | 认领、分支、Issue/PR 模板、评审与文档变更规则 |
| [课程要求与交付清单](docs/COURSE_REQUIREMENTS.md) | 原始要求、追踪矩阵和最终材料检查，提交准备时查阅 |

开工先读 PRD、架构和 Issue 清单；开始某个模块前，再查对应的数据模型、接口、流程和验收条目。日常直接维护这些文档，设计讨论和变更理由记录在 Issue/PR。

## 开始协作

协作仓库为公开的 [A-Words/museflow](https://github.com/A-Words/museflow)，文档基线维护在 `main`，已准备忽略规则及文本换行约定。21 项任务已发布到 [GitHub Issues](https://github.com/A-Words/museflow/issues)，成员在那里认领和更新进度；[任务索引](docs/ISSUE_BACKLOG.md#issue-索引)记录实际链接及依赖，`MF-xx` 不代表远端 Issue 编号。

```sh
git clone https://github.com/A-Words/museflow.git
cd museflow
```

运行要求：Node.js 24 LTS（最低 24.11，具体版本见 `.node-version`）、pnpm 12.5.1、PostgreSQL 17。安装与启动步骤如下。

```sh
pnpm install --frozen-lockfile
```

复制根目录 `.env.example` 为 `.env`，填写 `NUXT_DATABASE_URL`；`NUXT_STORAGE_ROOT` 设置为私有绝对路径（例如仓库根目录下的 `storage`）。不得放在 `public`、静态原型或公开托管目录。配置示例中的数据库用户和密码仅是本地样例，请按自己的数据库修改。生产环境通过进程环境变量或显式 `--env-file` 注入配置；Nuxt 构建产物不会自动读取开发用 `.env`。

启动开发服务：

```sh
pnpm dev
```

Web 默认监听 `http://127.0.0.1:3000`，首页用于检查 Nuxt UI 表单和弹窗。`GET /api/v1/health` 只表示 Web 进程存活；Web 校验配置但不会据此宣称数据库可用。当前不提供独立 Worker；后台任务调度留待后续业务实现。

运行中空闲数据库连接断开时，连接池记录固定的脱敏错误，由 pg 移除损坏连接，后续查询按需重新建连；不会自动重放查询或任务。执行中的查询失败仍由调用方处理。

项目根目录就是 Nuxt 根目录：`app/` 放页面和组件，`server/` 放 Nitro API、服务和数据库连接，`shared/` 放前后端共用的纯代码。没有多包 workspace；`pnpm-workspace.yaml` 仅保留 pnpm 12 的安装策略配置。

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm build
pnpm start
```

`test` 覆盖单元、SDK 兼容性与 Nuxt 组件，`test:integration` 使用 Nuxt Test Utils 验证真实 SSR/API（无需数据库或浏览器）。`test:db` 必须另行配置：在根目录 `.env` 中填写指向隔离测试数据库的 `TEST_DATABASE_URL`，再运行 `pnpm test:db`。缺少配置或连接失败均返回非零退出码，不静默跳过。构建和常规测试不需要真实 Provider 凭据。

首批无前置依赖的任务是 [MF-01 技术选择与公共约定](https://github.com/A-Words/museflow/issues/1)、[MF-02 页面原型](https://github.com/A-Words/museflow/issues/2)、[MF-03 Provider 契约与样例](https://github.com/A-Words/museflow/issues/3)，认领前查看对应 Issue 是否已有负责人。MF-01 完成后，由 MF-04 统一建立应用骨架、锁定依赖并补齐启动说明。具体供应商、成员材料和交付日期可随后补充。

## 文档状态

- 版本：`v0.2`，创建于 `2026-09-17`，范围确认与文档整理于 `2026-09-20`；具体设计持续评审。
- 已明确：以课题十二的四类模块和三项创新点为产品范围；3 人协作；使用 Nuxt + TypeScript；接受 P0/P1 分阶段实现；文本、音乐、TTS 采用可切换供应商的接口与适配器设计。
- 推进方式：按功能阶段推进，当前不固定交付日期；P0 先完成核心流程，P1 补齐翻唱和声音克隆。课题外扩展不作为完成条件。
- 协作方式：三名成员在 GitHub Issues 自行认领，每项一名主责、至少一名其他成员评审；不按成员长期固定前端、后端或 Agent 岗位。本地文档保留任务索引和范围，负责人、进度及验收证据在 Issue 中维护。
- 已建立应用骨架：Nuxt 页面与 Nitro API 同源，根目录采用 Nuxt 标准结构，暂不设独立 Worker 或共享包；耗时任务执行留待后续 Issue。
- AI SDK 原生 UI 消息流、Vue 客户端及 Zod 的 Mock 兼容性已验证，首轮不引入 LangGraph；Better Auth + Drizzle 已验证实例构造，PostgreSQL 已验证连接。注册登录、迁移、真实 Provider 和业务事务仍由后续 Issue 实现与验收。双积分含义及供应商配置按[技术选型与待定项](docs/ARCHITECTURE.md#技术选型与待定项)处理。
- 独立静态原型与 Nuxt 骨架分别运行，未将原型当作生产页面迁移。
- 运行时校验使用 Zod；测试入口采用 Vitest + Nuxt Test Utils，不建立 Playwright 浏览器自动化，关键浏览器流程手动验收。
- 文件存储已确认开发期私有本地目录、部署期私有对象存储，通过统一 Storage Adapter 访问；具体对象存储服务在部署时选择，尚未实现。
- UI 骨架接入 Nuxt UI + Tailwind CSS，布局和创作交互仍以 MF-02 设计为依据。MF-01 已关闭；MF-04 的合并与关闭仍需按协作约定评审。

原始课程文件仅作为需求来源，未复制到仓库。文档明确区分课程要求与团队设计，个人环境路径不作为协作者的运行前提。
