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
- MVP5：
- 阅读状态扩展为 `未读 / 已读` 两态，新文章默认未读
- 打开文章详情页后自动将未读文章标记为已读
- 收藏 / 取消收藏文章，收藏不影响归档和阅读状态
- 文章列表支持未读、已读和收藏筛选
- 文章详情页支持正文高亮与批注
- Web 支持导入本地 `.md` / `.txt` 文档，本地导入来源显示为“本地”
- 浏览器插件支持保存网页选中内容为片段
- Markdown 阅读器支持 fenced code block 基础高亮
- MVP6：
- Web 端 AI 配置中心，支持 Chat 和 Embedding 分开配置与测试
- 文档解析完成后自动创建知识库向量索引任务
- 知识库级 AI 问答，支持会话列表、引用来源和重新生成
- 索引任务列表支持查看状态、失败重试和完成任务分片内容
- MVP7：
- 优化网页正文提取、元信息提取、链接和图片候选规范化
- 文章目录改为从渲染后 `h2 / h3` 读取纯文本并高亮当前位置
- URL / HTML 新导入文章支持正文图片和封面图归档到 RustFS / S3-compatible 存储
- 新增 `DocumentMediaAsset` 记录图片归档成功、失败和跳过结果
- 阅读页优化图片、`figure`、`figcaption` 展示，并在图片加载失败时显示原图链接

## 当前不支持

CLI 导入、插件保存历史、Docker Compose、历史文章批量重新提取、历史文章批量图片归档、图片压缩转码、对象存储连接测试 UI、PDF/RSS/视频/音频解析、批量文件导入、收藏页、批注汇总页、阅读统计页和注册页暂不实现。

## 环境要求

- Node.js >= 20
- pnpm >= 9
- PostgreSQL
- Redis
- RustFS / S3-compatible 对象存储（可选；未配置时会保留原站图片 URL）

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
OBJECT_STORAGE_ENDPOINT=""
OBJECT_STORAGE_BUCKET=""
OBJECT_STORAGE_PUBLIC_BASE_URL=""
OBJECT_STORAGE_ACCESS_KEY_ID=""
OBJECT_STORAGE_SECRET_ACCESS_KEY=""
OBJECT_STORAGE_REGION="us-east-1"
OBJECT_STORAGE_FORCE_PATH_STYLE=true
AI_PROVIDER="deepseek"
AI_CONFIG_ENCRYPTION_KEY="change-me-at-least-32-characters-long"
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
保存选中内容
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
POST   /api/ingest/file
POST   /api/ingest/selection
GET    /api/documents
GET    /api/documents/facets
GET    /api/documents/:id
DELETE /api/documents/:id
PATCH  /api/documents/:id/archive
PATCH  /api/documents/:id/unarchive
PATCH  /api/documents/:id/restore
DELETE /api/documents/:id/permanent
PATCH  /api/documents/:id/reading-status
PATCH  /api/documents/:id/favorite
POST   /api/documents/:id/tags
DELETE /api/documents/:id/tags/:tagId
GET    /api/documents/:id/annotations
POST   /api/documents/:id/annotations
PATCH  /api/documents/:id/annotations/:annotationId
DELETE /api/documents/:id/annotations/:annotationId
POST   /api/documents/:id/retry-ingest
GET    /api/documents/:id/ai-analysis
POST   /api/documents/:id/ai-analysis/retry
GET    /api/documents/:id/ai-conversations
POST   /api/documents/:id/ai-conversations
GET    /api/settings/ai
PUT    /api/settings/ai/chat
PUT    /api/settings/ai/embedding
DELETE /api/settings/ai/chat
DELETE /api/settings/ai/embedding
POST   /api/settings/ai/chat/test
POST   /api/settings/ai/embedding/test
GET    /api/settings/embedding-jobs
GET    /api/settings/embedding-jobs/:id/chunks
POST   /api/settings/embedding-jobs/:id/retry
GET    /api/knowledge-chat/sessions
POST   /api/knowledge-chat/sessions/ask
GET    /api/knowledge-chat/sessions/:id
PATCH  /api/knowledge-chat/sessions/:id
DELETE /api/knowledge-chat/sessions/:id
POST   /api/knowledge-chat/sessions/:id/messages
POST   /api/knowledge-chat/messages/:messageId/regenerate
```

文章列表支持以下常用查询参数：

```txt
keyword
status=active|archived|trash
type=article|video|audio|pdf|fragment
tag
source
readingStatus=unread|read
favorite=true
sort=created_desc|created_asc|updated_desc|updated_asc
page
pageSize
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

文件导入使用 `multipart/form-data` 上传字段 `file`，仅支持 `.md` / `.txt`，单文件最大 2MB，来源写为“本地”。

选中内容导入请求体：

```json
{
  "url": "https://example.com/article",
  "title": "页面标题",
  "selectedHtml": "<p>选中内容</p>",
  "selectedText": "选中内容"
}
```

阅读状态只有两种取值：`unread` 和 `read`。新导入文档默认 `unread`，打开非回收站文章详情页后会自动标记为 `read`。收藏使用 `favoritedAt` 记录，和归档、阅读状态相互独立。

MVP4 后 URL / HTML 导入接口会立即创建占位文章和导入任务，真正的网页抓取、正文解析和 AI 分析由 Worker 异步完成。MVP5 的文件导入和选中内容导入会立即创建完整文档或片段。

MVP7 后 URL / HTML 新导入文章会在 Worker 解析阶段尝试归档正文图片和封面图。对象存储配置完整时，图片会上传到 RustFS / S3-compatible Bucket，并把 Markdown 图片 URL 和 `coverImage` 替换为公共访问地址；配置缺失、下载失败、格式不支持或超过限制时会保留原始图片 URL，不阻断文章导入。图片归档只处理新导入 URL / HTML 文章，不处理历史文章、选中内容和本地文件。

## Workspace

- `apps/web`: Vue 3 Web 客户端
- `apps/server`: NestJS API 服务
- `apps/extension`: WXT 浏览器插件
- `apps/cli`: CLI 预留
- `packages/shared`: 共享类型
- `packages/api-client`: API Client
- `packages/parser`: 网页正文解析和 Markdown 转换
- `packages/ai`: AI Provider 预留
- `packages/storage`: RustFS / S3-compatible 对象存储封装
