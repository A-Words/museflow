# MuseFlow

MuseFlow 是《软件工程课程设计》课题十二「AI音乐创作SaaS平台系统」的协作仓库。项目围绕对话式音乐创作、个性化推荐、生成物管理和用户双积分计费展开。

**需求和设计基线已具备，可以开始按 Issue 协作开发。** 当前在 `apps/web/prototype` 提供 MF-02 独立静态交互原型；Nuxt、Worker 和共享包目录及工具链留待 MF-04 初始化。功能、接口、数据模型和验收指标是设计约定或候选方案，不代表生产功能已经实现或测试通过。

## 评审页面原型

在仓库根目录执行 `python -m http.server 4173 --bind 127.0.0.1 --directory apps/web/prototype`，浏览器打开 <http://127.0.0.1:4173/>。无需安装前端依赖，Ctrl+C 停止服务。

原型覆盖模拟登录、创作工作区、作品库、灵感、双积分和后台。工作区通过对话、参数提议、报价、任务卡和右侧当前状态呈现完整创作流程；音频样例在结果或详情卡内试听。顶部“演示场景”可切换异常状态。所有生成、账户与积分均为本地模拟。启动、素材、接口映射、实际检查及限制见 [UI 原型交接说明](docs/UI_PROTOTYPE.md)。样例音频元数据、加载和下载已验证，可听播放仍需外部浏览器复核；这些检查不能视为真实 Provider 验收。

MF-02 的本地原型与说明已具备评审条件；远端 Issue #2 仍为 Open，且尚无关联 PR、另一成员评审和合并证据，因此当前状态是“待评审”，不是“已完成”。

## 从这里开始

| 文档 | 解决的问题 |
| --- | --- |
| [产品需求 PRD](docs/PRD.md) | 给谁用，做什么，首轮做多少，如何验收 |
| [系统架构与技术选型](docs/ARCHITECTURE.md) | 已确认与待定选型、Agent 方案、模块职责和部署设计 |
| [数据模型与字典](docs/DATA_MODEL.md) | 核心实体、关系、约束、索引及数据生命周期 |
| [创作与积分流程](docs/WORKFLOWS.md) | Agent 如何调用工具，异步任务和积分怎样保持一致 |
| [接口契约草案](docs/API_CONTRACT.md) | 前后端、Agent、Worker 如何协作 |
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

以上只获取仓库；当前仅包含静态原型，生产应用目录、工具链以及安装与运行命令由 MF-04 补充。

首批无前置依赖的任务是 [MF-01 技术选择与公共约定](https://github.com/A-Words/museflow/issues/1)、[MF-02 页面原型](https://github.com/A-Words/museflow/issues/2)、[MF-03 Provider 契约与样例](https://github.com/A-Words/museflow/issues/3)，认领前查看对应 Issue 是否已有负责人。MF-01 完成后，由 MF-04 统一建立应用骨架、锁定依赖并补齐启动说明。具体供应商、成员材料和交付日期可随后补充。

## 文档状态

- 版本：`v0.2`，创建于 `2026-09-17`，范围确认与文档整理于 `2026-09-20`；具体设计持续评审。
- 已明确：以课题十二的四类模块和三项创新点为产品范围；3 人协作；使用 Nuxt + TypeScript；接受 P0/P1 分阶段实现；文本、音乐、TTS 采用可切换供应商的接口与适配器设计。
- 推进方式：按功能阶段推进，当前不固定交付日期；P0 先完成核心流程，P1 补齐翻唱和声音克隆。课题外扩展不作为完成条件。
- 协作方式：三名成员在 GitHub Issues 自行认领，每项一名主责、至少一名其他成员评审；不按成员长期固定前端、后端或 Agent 岗位。本地文档保留任务索引和范围，负责人、进度及验收证据在 Issue 中维护。
- 已确认应用结构：Nuxt 页面与 Nitro API 同源，独立 Node.js + TypeScript Worker 执行耗时生成任务，pnpm workspace 管理 Web、Worker 和共享包；目录骨架、工具链与生产代码待 MF-04 初始化。
- Agent 库已确认 AI SDK 及其原生 UI 消息流，首轮不引入 LangGraph；认证已确认 Better Auth 数据库会话，数据库与查询库已确认 PostgreSQL + Drizzle，均待安装与兼容性验证。版本核验、双积分业务含义及实际接入的供应商配置按[技术选型与待定项](docs/ARCHITECTURE.md#技术选型与待定项)在相关 Issue 中处理。供应商与日期均不作为开始接口设计的前置条件。
- 当前可运行 `apps/web/prototype` 下的独立静态原型；生产应用运行说明将在工具链实际建立后补充。
- 运行时校验已确认 Zod；测试采用 Vitest + Nuxt Test Utils，不引入 Playwright，关键浏览器流程手动验收。尚未安装依赖或建立测试入口。
- 文件存储已确认开发期私有本地目录、部署期私有对象存储，通过统一 Storage Adapter 访问；具体对象存储服务在部署时选择，尚未实现。
- UI 已确认 Nuxt UI + Tailwind CSS，布局和创作交互由 MF-02 细化；尚未安装验证。MF-01 的本轮决策已记录，仍待另两位协作者评审，不视为 Issue 已验收。

原始课程文件仅作为需求来源，未复制到仓库。文档明确区分课程要求与团队设计，个人环境路径不作为协作者的运行前提。
