---
name: nuxt-docs
description: 使用 Nuxt 官方 llms.txt 索引辅助 Nuxt 应用开发、审查与调试，涵盖配置、路由、SSR、数据获取、服务端接口、模块、迁移和部署；适用于本项目的 Nuxt 工作。
---

# Nuxt 官方文档

来源：[Nuxt llms.txt](https://nuxt.com/llms.txt)，于 2026-09-22 核对。该地址是文档导航索引；使用时获取最新内容，再按任务读取相关页面。

## 使用流程

1. 先查看项目的 `package.json`、锁文件及 `nuxt.config.*`，确定 Nuxt 实际版本和配置。若尚未初始化，查阅 `docs/ARCHITECTURE.md`、`README.md` 和当前任务范围，区分已选技术与已安装依赖；不要为了查文档擅自初始化应用或升级版本。
2. 获取官方 `https://nuxt.com/llms.txt`，按 API 名称或任务关键词定位条目，仅打开相关文档。索引当前以 Nuxt 4 为主；使用前确认内容适合项目锁定版本，不能把文档中的新 API 当作已安装版本支持的能力。
3. 优先读取索引提供的 Markdown 链接。普通文档页面可在 URL 后追加 `.md`，或请求 `Accept: text/markdown`。需要查找索引以外的页面时使用 `https://nuxt.com/sitemap.md`；仅在确实需要跨文档检索时读取体积较大的 `https://nuxt.com/llms-full.txt`。
4. 将查到的行为与项目实现对照，按现有脚本验证所做修改。说明关键结论对应的官方页面，以及版本或验证限制。网络不可用时明确说明无法核实最新文档，不把记忆中的 API 当作已验证事实。

## 范围与检索

- 配置与部署：检索 `nuxt.config`、`runtimeConfig`、rendering、deployment。
- 页面与运行环境：检索 pages、layouts、middleware、plugins、SSR、hydration。
- 数据与状态：检索 `useFetch`、`useAsyncData`、`useState`。
- 服务端与扩展：检索 server、routes、modules、Nuxt Kit、migration。

Vue、Vite、Nitro、UnJS 和具体模块的独立 API 应继续查阅各自官方文档；Nuxt UI 的组件细节也应查 Nuxt UI 文档。

如果当前环境已经提供 Nuxt MCP，可使用它进行结构化查找；官方入口为 `https://nuxt.com/mcp`。普通 HTTP 读取已足够，无需为此修改全局 MCP 配置。
