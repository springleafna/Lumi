# Lumi

Lumi 是一个自用的个人知识管理系统，用于收集、解析、保存、整理和阅读网页文章，并提供 AI 摘要、批注与知识库问答。各阶段方案文档见 `docs/`（MVP0–MVP9），开发约定见 `AGENTS.md`。

## 功能速览

- 收集：浏览器插件（URL / 整页 HTML / 选中内容）、Web 导入 URL 与本地 `.md` / `.txt`、移动端系统分享接收
- 阅读：Web 与移动端双阅读器——目录、字号、深色模式、图片全屏预览、阅读位置记忆、正文高亮与划词批注
- AI：导入后自动生成摘要与标签、单篇文章即时问答、知识库级检索问答（会话 / 引用 / 重新生成）、移动端 AI 导读卡
- 整理：未读 / 已读、收藏、归档与回收站、标签（手动 + AI 生成，可编辑）、状态与来源筛选
- 基建：BullMQ + Redis 异步导入管线、图片归档到 S3 兼容存储（可选）、文档向量索引、开放注册

## 环境要求

- Node.js >= 20，pnpm >= 9
- PostgreSQL、Redis
- RustFS / S3 兼容对象存储（可选；未配置时保留原站图片 URL）

默认端口：Server `http://localhost:3000`（API 前缀 `/api`）、Web `http://localhost:5173`、移动端 `http://localhost:5175`、Redis `redis://localhost:6379`。

## 快速开始

1. 创建数据库：

   ```sql
   CREATE DATABASE lumi;
   ```

2. 复制并修改环境变量（全部键位见 `.env.example`）：

   ```powershell
   Copy-Item .env.example .env
   ```

   至少确认 `DATABASE_URL`（密码含特殊字符需 URL 编码）、`JWT_SECRET`、`REDIS_URL`、`ADMIN_USERNAME` / `ADMIN_PASSWORD`。

3. 初始化并启动：

   ```powershell
   pnpm install
   pnpm db:generate
   pnpm db:migrate
   pnpm db:init-user
   pnpm dev:all   # 同时启动 web + server + worker
   ```

   移动端不在 `dev:all` 里，需要单独开终端跑 `pnpm dev:mobile`；移动端服务器地址是运行时配置，首次进入在 `/setup` 页填写。

4. 浏览器打开 `http://localhost:5173`，用 `.env` 里的管理员账号登录（默认 `admin` / `admin123456`），或在注册页自建账号（`AUTH_REGISTER_ENABLED=false` 可关闭注册）。

## 常用脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev:all` | 同时启动 web + server + worker（不含 mobile） |
| `pnpm dev:server` / `dev:worker` / `dev:web` / `dev:extension` / `dev:mobile` | 单独启动某一端 |
| `pnpm build:packages` / `build:server` / `build:web` / `build:extension` / `build:mobile` | 按范围构建 |
| `pnpm db:generate` / `db:migrate` / `db:init-user` | Prisma 生成、迁移、初始化管理员 |

## 浏览器插件

```powershell
pnpm dev:extension
```

在 Options 页配置 API 地址（`http://localhost:3000/api`）并用 Lumi 账号登录，Popup 内保存当前 URL / 完整页面 / 选中内容。插件只在点击保存时读取页面内容，不做后台抓取。

## 移动端

开发模式以移动网页方式运行（浏览器访问 `http://localhost:5175`）。安卓 APK 打包与真机验证清单见 `apps/mobile/README.md`（Capacitor，需自行安装 Android Studio）。

## Workspace

| 路径 | 说明 |
| --- | --- |
| `apps/web` | Vue 3 Web 客户端 |
| `apps/server` | NestJS API 服务（含独立 Worker 进程） |
| `apps/extension` | WXT 浏览器插件 |
| `apps/mobile` | Vue 3 + Vant 4 移动端（Capacitor 安卓壳） |
| `apps/cli` | CLI 预留 |
| `packages/shared` | 共享 DTO 与类型 |
| `packages/api-client` | axios + SSE 封装（web / extension / mobile 共用） |
| `packages/parser` | 网页正文提取与 HTML → Markdown |
| `packages/storage` | S3 兼容对象存储封装 |
| `packages/ai` | AI Provider 预留 |
