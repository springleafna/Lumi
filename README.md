# Lumi

Lumi 是一个自用的个人知识管理系统，用于收集、转换、保存和阅读日常浏览的图文网页内容。

## MVP 功能范围

- MVP1：
- 用户登录和 JWT 鉴权
- 初始化管理员用户
- Web 端提交公开网页 URL
- 后端抓取网页、提取正文、清洗 HTML、转换 Markdown
- PostgreSQL 保存文章和 IngestJob 导入记录
- Web 端文章列表、搜索、详情阅读和软删除
- `@lumi/api-client` 封装前端请求
- `@lumi/parser` 封装 HTML 到 Markdown 解析
- MVP2：
- 浏览器插件内登录
- 插件 Options 页配置 API 地址和 Web 地址
- 插件 Options 页测试连接
- 插件 Popup 保存当前页面 URL
- 插件 Popup 保存当前完整页面 HTML
- 后端新增 HTML 导入接口 `POST /api/ingest/html`
- 保存成功后可从插件打开 Web 文章详情页
- MVP3：
- 文章状态筛选、搜索、标签、来源和排序
- 归档、回收站、恢复和永久删除
- 文章详情页阅读体验和 Web UI 风格优化
- MVP4：
- Redis + BullMQ 异步导入和 AI 分析任务
- 独立 Worker 处理文章解析和 AI 分析
- DeepSeek / 硅基流动 OpenAI-Compatible Provider 配置
- 导入后显示解析中占位文章
- 解析完成后自动生成结构化 AI 摘要和标签
- 文章详情页 AI 抽屉和当前文章问答

## 当前不支持

选中内容导入、CLI 导入、插件保存历史、Docker Compose、pgvector、跨文章知识库问答、语义搜索、图片本地化、PDF/RSS/视频/音频解析和注册页暂不实现。

## 环境要求

- Node.js >= 20
- pnpm >= 9
- PostgreSQL
- Redis

默认端口：

- Server: `http://localhost:3000`
- Web: `http://localhost:5173`
- Extension API 默认地址：`http://localhost:3000/api`
- Extension Web 默认地址：`http://localhost:5173`

## 本地 PostgreSQL

创建本地数据库，例如：

```sql
CREATE DATABASE lumi;
```

然后复制环境变量文件：

```powershell
Copy-Item .env.example .env
```

按需修改 `.env`：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lumi?schema=public"
JWT_SECRET="change-this-secret"
JWT_EXPIRES_IN="30d"
SERVER_PORT=3000
WEB_ORIGIN="http://localhost:5173"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123456"
REDIS_URL="redis://localhost:6379"
VITE_API_BASE_URL="http://localhost:3000/api"
AI_PROVIDER="deepseek"
DEEPSEEK_API_KEY=""
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-chat"
```

## 启动流程

```powershell
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:init-user
pnpm dev:server
pnpm dev:worker
pnpm dev:web
```

也可以使用统一开发脚本同时启动 Web、Server 和 Worker：

```powershell
pnpm dev:all
```

浏览器插件开发：

```powershell
pnpm dev:extension
```

插件构建：

```powershell
pnpm build:extension
```

登录默认账号来自 `.env`：

- 用户名：`admin`
- 密码：`admin123456`

## 常用脚本

```powershell
pnpm build:packages
pnpm build:server
pnpm build:web
pnpm build:extension
pnpm dev:server
pnpm dev:worker
pnpm dev:web
pnpm dev:extension
pnpm db:generate
pnpm db:migrate
pnpm db:init-user
```

## 浏览器插件使用

1. 启动后端和 Web：

```powershell
pnpm dev:server
pnpm dev:web
```

2. 启动插件开发模式：

```powershell
pnpm dev:extension
```

3. 在插件 Options 页配置：

```txt
API 地址：http://localhost:3000/api
Web 地址：http://localhost:5173
```

4. 在插件 Options 页使用管理员账号登录。

5. 打开任意网页，在插件 Popup 中选择：

```txt
保存完整页面
保存当前 URL
```

保存成功后可以点击“打开文章”进入 Web 文章详情页。

插件权限说明：

- 插件使用 `<all_urls>` 读取当前页面。
- 插件只在用户主动点击保存时读取页面内容。
- 插件不做后台批量抓取，不自动遍历网页链接。

## API

后端统一前缀：

```txt
/api
```

当前主要接口：

```txt
POST   /api/auth/login
GET    /api/auth/me
POST   /api/ingest/url
POST   /api/ingest/html
GET    /api/documents
GET    /api/documents/:id
DELETE /api/documents/:id
POST   /api/documents/:id/retry-ingest
GET    /api/documents/:id/ai-analysis
POST   /api/documents/:id/ai-analysis/retry
GET    /api/documents/:id/ai-conversations
POST   /api/documents/:id/ai-conversations
```

HTML 导入请求体：

```json
{
  "url": "https://example.com/article",
  "title": "页面标题",
  "html": "<html>...</html>"
}
```

HTML 最大 5MB，超过会返回错误。

MVP4 后导入接口会立即创建占位文章和导入任务，真正的网页抓取、正文解析和 AI 分析由 Worker 异步完成。

## Workspace

- `apps/web`: Vue 3 Web 客户端
- `apps/server`: NestJS API 服务
- `apps/extension`: WXT 浏览器插件
- `apps/cli`: CLI 预留
- `packages/shared`: 共享类型
- `packages/api-client`: API Client
- `packages/parser`: 网页正文解析和 Markdown 转换
- `packages/ai`: AI Provider 预留
- `packages/storage`: 对象存储预留
