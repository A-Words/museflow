# 数据库基线与迁移

MF-05 使用 PostgreSQL 17、Drizzle ORM 0.45.3 和 Drizzle Kit 0.31.11。物理定义在 `server/database/schema.ts`，已评审的 SQL 与快照在 `server/database/migrations/`。认证表、创作会话与消息、Provider 配置、报价任务、作品、积分账户与流水以及幂等和审计基础表共 21 张。P1 的声音授权、个性化推荐等表留给相应 Issue 新增迁移。

## 初始化与升级

1. 安装 Node 24.11+、pnpm 12.5.1 和 PostgreSQL 17；运行 `pnpm install --frozen-lockfile`。
2. 在 `.env` 设置目标库的 `NUXT_DATABASE_URL`。先创建空数据库，再运行 `pnpm db:migrate`。
3. 对已有库再次运行相同命令。Drizzle 的迁移日志会跳过已执行版本；不要直接运行 `db:generate` 或 `drizzle-kit push` 更新运行库。
4. 要验证真实数据库，在隔离库中设置名称包含 `test` 的 `TEST_DATABASE_URL`，运行 `pnpm test:db`。它迁移两次，使用 Better Auth 实际注册并清理一个测试用户，在回滚事务中核对跨用户外键、余额非负、唯一约束以及流水和审计日志的只追加触发器。

后续改表：编辑 `schema.ts`，运行 `pnpm db:generate --name=<description>`，检查 SQL、快照、删除策略和索引，连同代码提交。已应用的 SQL 不回写；需要新约束或数据修复时新增迁移。自定义 SQL（如本基线的流水只追加触发器）保留在迁移中并在评审时说明。部署前备份目标库，先在隔离库演练升级。`db:migrate` 是唯一应用入口；Better Auth CLI 不另行迁移认证表。

## 演示账号

演示种子仅使用 `example.test` 邮箱，不复制真实用户。设置 `DEMO_PASSWORD`（至少 12 字符）和 `ALLOW_DEMO_SEED=1`，然后运行 `pnpm db:seed`。在空库中会建立 `creator-a@example.test`、`creator-b@example.test` 两名普通用户及 `admin@example.test` 管理员，并为每人建立余额为零的 `creation` 和 `voice` 钱包；同时写入六个标为 `mock` 的 Provider 配置和三种默认配置。如果邮箱已存在，会跳过该用户及其凭据和钱包，避免给已有用户附加演示密码。重复运行不会改已有密码、余额或默认配置。不要在共享或生产数据库设置演示种子开关；演示密码由运行者提供，不进入仓库。

## 约束与模块边界

Better Auth 1.7 使用 `users`、`sessions`、`accounts`、`verifications`；`authSchema` 从 `server/database/schema.ts` 导出，MF-06 的 Drizzle adapter 应传入该对象，并将业务用户附加字段映射到 `role`、`status`、`personalizationEnabled`。用户 ID 是 Better Auth 的字符串；业务 ID 是 UUID。认证会话和凭据字段不得写进业务响应。

会话消息、工具调用、报价、任务、重试来源、作品和账本的复合外键约束用户归属及关联关系；Provider 默认配置与指定配置也必须匹配能力种类和版本。资源读取仍必须在服务层校验归属。金额用 PostgreSQL `bigint`，应用/API 使用十进制整数字符串。钱包可用额、冻结额不小于零，冻结额大于零，报价和价格非负；积分流水及审计日志只追加，数据库拒绝更新、删除和清空，余额变动与流水插入必须在同一数据库事务内进行。`operation_key`、报价任务关联、任务尝试、任务事件与产物槽位有唯一约束；有任务的作品必须有产物槽位。账本及审计记录外键使用限制删除，认证凭据与会话随用户删除；后续账户注销需遵循这些保留关系。

种子不预设价格、供应商密钥或初始积分；这些由 MF-07 和真实 Provider 配置流程决定。当前没有验证真实 PostgreSQL 时，不应把静态 schema 或 Mock 测试称为已通过数据库验收。

## MF-05 验证记录

2026-10-07，在本地隔离的 PostgreSQL 17 容器与 Node.js 24.19.0、pnpm 12.5.1 环境执行。`pnpm test:db` 通过，覆盖空库迁移、重复迁移、Better Auth 实际注册、跨用户报价及作品关联拒绝、报价与任务关联拒绝、缺少产物槽位拒绝、Provider 种类不匹配拒绝、负余额与重复钱包拒绝、跨用户账本及重试关联拒绝，以及积分流水和审计日志的更新、清空拒绝；测试用户已清理，约束测试写入在事务中回滚。`pnpm db:seed` 连续运行两次后，库内仍为 3 个用户、3 个凭据账户、6 个钱包、6 个 Mock Provider 配置和 3 个默认配置。另构造已有同邮箱但无 credential 的用户：运行种子两次后，该用户仍无 credential 或演示钱包；删除冲突用户后再运行种子，最终计数仍为 3、3、6、6、3。`pnpm db:migrate` 在已有库连续运行两次通过。另通过 `pnpm typecheck`、`pnpm lint`、`pnpm test` 和 `pnpm build`。账本并发扣款与任务调度不属于此次基础迁移验证。
