## 1. 目标

MVP1 目标是在 MVP0 monorepo 工程基础上，实现 Lumi 的第一个可用闭环：

```txt
用户登录
  -> Web 端提交公开网页 URL
  -> 后端抓取网页
  -> 提取正文
  -> 清洗 HTML
  -> 转换为 Markdown
  -> 保存到 PostgreSQL
  -> Web 端查看、搜索、阅读、删除文章
```

本阶段只支持后端可以直接访问的普通公开图文网页。

---

## 2. 实现范围

MVP1 实现以下能力：

1. 用户登录。
2. JWT 鉴权。
3. 初始化管理员用户。
4. Web 端文章列表。
5. Web 端 URL 导入入口。
6. Web 端文章详情阅读。
7. Markdown 内容渲染。
8. 基础搜索。
9. 删除文章。
10. 后端 URL 抓取。
11. 后端正文提取。
12. 后端 HTML 清洗。
13. 后端 HTML 转 Markdown。
14. 文章保存到 PostgreSQL。
15. 每次导入记录 IngestJob。
16. api-client 公共包封装前端请求。
17. README 更新本地启动说明。

---

## 3. 当前不实现

MVP1 明确不实现：

1. 浏览器插件导入。
2. 微信公众号等受限页面导入。
3. 选中内容导入。
4. CLI 导入。
5. Redis。
6. BullMQ 异步任务。
7. Docker Compose。
8. pgvector。
9. AI 总结、标签、问答、向量检索。
10. 对象存储。
11. 图片本地化。
12. PDF、RSS、视频、音频解析。
13. Shiki 代码高亮。
14. 注册页。
15. 多用户权限系统。
16. 自动站点适配规则。
17. 自动化测试。

---

## 4. 技术选型

### 4.1 Web

```txt
Vue3
TypeScript
Vite
Vue Router
TailwindCSS
shadcn-vue
lucide-vue-next
axios
markdown-it
DOMPurify
@tailwindcss/typography
```

MVP1 不使用 Pinia，登录状态使用 `localStorage + composable` 管理。

### 4.2 Server

```txt
NestJS
TypeScript
Prisma
PostgreSQL
JWT
bcryptjs
axios
```

### 4.3 Parser

```txt
@mozilla/readability
jsdom
DOMPurify
turndown
turndown-plugin-gfm
```

### 4.4 Monorepo 公共包

MVP1 涉及：

```txt
@lumi/shared
@lumi/api-client
@lumi/parser
```

---

## 5. 默认端口与环境变量

默认端口：

```txt
Server: http://localhost:3000
Web:    http://localhost:5173
```

后端环境变量示例：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lumi?schema=public"
JWT_SECRET="change-this-secret"
JWT_EXPIRES_IN="30d"
SERVER_PORT=3000
WEB_ORIGIN="http://localhost:5173"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123456"
```

前端环境变量示例：

```env
VITE_API_BASE_URL="http://localhost:3000/api"
```

---

## 6. 数据库设计

MVP1 使用 Prisma + 本地 PostgreSQL。

核心模型：

```txt
User
Document
IngestJob
```

### 6.1 User

```prisma
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  documents  Document[]
  ingestJobs IngestJob[]
}
```

说明：

1. `password` 字段保存 bcryptjs hash。
2. MVP1 不做注册页。
3. MVP1 不需要 `displayName`。
4. MVP1 不需要 `role`。

### 6.2 Document

```prisma
model Document {
  id          String       @id @default(cuid())
  type        DocumentType @default(article)
  title       String
  url         String?      @unique
  source      String?
  author      String?
  excerpt     String?
  coverImage  String?
  markdown    String
  contentText String?
  wordCount   Int?
  deletedAt   DateTime?
  publishedAt DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  userId      String
  user        User         @relation(fields: [userId], references: [id])
  ingestJobs  IngestJob[]
}
```

说明：

1. Web 上显示为“文章”，内部模型命名为 `Document`。
2. MVP1 中 `type` 固定使用 `article`。
3. `markdown` 直接保存在 `documents` 表中，后续可拆分。
4. `contentText` 用于基础搜索。
5. `url` 全局唯一。
6. 删除使用 `deletedAt` 软删除。
7. 列表和详情默认不展示已软删除文章。
8. 同 URL 未删除文章重复导入时，直接返回已有文章。
9. 同 URL 已删除文章再次导入时，重新抓取并恢复该文章。

### 6.3 IngestJob

```prisma
model IngestJob {
  id           String          @id @default(cuid())
  type         IngestJobType   @default(url)
  status       IngestJobStatus
  inputUrl     String?
  errorMessage String?
  documentId   String?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  startedAt    DateTime?
  finishedAt   DateTime?

  userId       String
  user         User            @relation(fields: [userId], references: [id])
  document     Document?       @relation(fields: [documentId], references: [id])
}
```

说明：

1. MVP1 虽然同步导入，但每次导入都创建 `IngestJob`。
2. 成功导入时状态为 `succeeded`。
3. 失败导入时状态为 `failed`，保存 `errorMessage`。
4. 重复导入已有文章时，仍创建 `IngestJob`，状态为 `succeeded`，并关联已有 `Document`。

### 6.4 Enums

```prisma
enum DocumentType {
  article
  video
  audio
  pdf
  fragment
}

enum IngestJobType {
  url
  html
  selection
  file
}

enum IngestJobStatus {
  pending
  processing
  succeeded
  failed
}
```

---

## 7. 后端模块规划

NestJS 后端模块：

```txt
PrismaModule
AuthModule
UsersModule
DocumentsModule
IngestModule
```

职责：

```txt
PrismaModule      PrismaClient 封装
UsersModule       用户查询、初始化用户脚本复用逻辑
AuthModule        登录、JWT 签发、JWT Guard、当前用户
DocumentsModule   文章列表、详情、搜索、删除
IngestModule      URL 导入、抓取、解析、保存、IngestJob 状态记录
```

---

## 8. 用户认证

登录方式：

```txt
用户名 + 密码
```

认证方式：

```txt
JWT access token
```

前端保存方式：

```txt
localStorage
```

MVP1 不实现：

```txt
refresh token
注册页
找回密码
角色权限
```

JWT 默认有效期通过环境变量配置：

```env
JWT_EXPIRES_IN="30d"
```

---

## 9. 初始化用户

提供初始化用户命令：

```powershell
pnpm --filter @lumi/server db:init-user
```

脚本读取：

```env
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123456"
```

行为：

```txt
如果用户不存在，则创建用户。
如果用户已存在，则更新密码。
密码使用 bcryptjs hash 后保存到 User.password。
```

根目录增加脚本：

```json
{
  "db:migrate": "pnpm --filter @lumi/server prisma migrate dev",
  "db:generate": "pnpm --filter @lumi/server prisma generate",
  "db:init-user": "pnpm --filter @lumi/server db:init-user"
}
```

---

## 10. API 设计

后端统一 API 前缀：

```txt
/api
```

### 10.1 Auth API

```txt
POST /api/auth/login
GET  /api/auth/me
```

登录请求：

```json
{
  "username": "admin",
  "password": "admin123456"
}
```

登录响应 data：

```json
{
  "accessToken": "jwt-token",
  "user": {
    "id": "user-id",
    "username": "admin"
  }
}
```

### 10.2 Ingest API

```txt
POST /api/ingest/url
```

请求：

```json
{
  "url": "https://example.com/article"
}
```

响应 data：

```json
{
  "document": {},
  "job": {}
}
```

### 10.3 Documents API

```txt
GET    /api/documents?keyword=xxx&page=1&pageSize=20
GET    /api/documents/:id
DELETE /api/documents/:id
```

列表规则：

```txt
默认 page=1
默认 pageSize=20
默认按 createdAt desc 排序
排除 deletedAt 不为空的数据
```

搜索规则：

```txt
keyword 同时搜索 title 和 contentText
MVP1 使用 Prisma contains 实现
```

---

## 11. 统一响应格式

成功响应：

```json
{
  "code": 0,
  "message": "OK",
  "data": {}
}
```

失败响应：

```json
{
  "code": "UNAUTHORIZED",
  "message": "未登录",
  "data": null
}
```

说明：

1. 后端统一包装响应。
2. `@lumi/api-client` 自动 unwrap `data`。
3. 请求失败时 `@lumi/api-client` 抛出 `LumiApiError`。

---

## 12. URL 导入流程

URL 导入为同步处理。

流程：

```txt
1. 用户在 Web 端提交 URL。
2. 后端创建 IngestJob，状态 pending。
3. 后端将 IngestJob 更新为 processing。
4. 检查当前用户下是否已有相同 URL 的 Document。
5. 如果已有且未删除，直接返回已有 Document。
6. 如果已有但已软删除，重新抓取网页并更新该 Document，同时清空 deletedAt。
7. 如果不存在，抓取网页并创建新 Document。
8. 抓取网页使用 axios。
9. 请求超时时间为 15 秒。
10. 请求时设置普通浏览器 User-Agent。
11. 将 HTML 交给 @lumi/parser 处理。
12. parser 使用 Readability 提取正文。
13. Readability 失败时 fallback 到 body。
14. 清洗 HTML。
15. 使用 turndown 转换为 Markdown。
16. 生成 contentText、wordCount、source 等字段。
17. 保存 Document。
18. IngestJob 更新为 succeeded，并关联 Document。
19. 返回 Document 和 IngestJob。
```

失败流程：

```txt
1. IngestJob 更新为 failed。
2. 保存 errorMessage。
3. API 返回错误响应。
```

---

## 13. Parser 包设计

`@lumi/parser` 不负责 HTTP 抓取，只负责 HTML 解析。

建议导出：

```ts
export async function parseArticleFromHtml(input: {
  html: string
  url: string
}): Promise<{
  title: string
  author?: string
  excerpt?: string
  siteName?: string
  coverImage?: string
  publishedAt?: string
  markdown: string
  contentText: string
  wordCount?: number
}>
```

内部职责：

```txt
1. 使用 jsdom 构建 DOM。
2. 使用 Readability 提取正文。
3. Readability 失败时 fallback 到 body。
4. 使用 DOMPurify 清洗 HTML。
5. 使用 turndown + turndown-plugin-gfm 转 Markdown。
6. 提取纯文本 contentText。
7. 统计 wordCount。
8. 从 URL 提取 source。
```

---

## 14. API Client 包设计

`@lumi/api-client` 提供模块化 client。

创建方式：

```ts
createLumiClient({
  baseUrl,
  getToken,
})
```

模块：

```ts
client.auth.login()
client.auth.me()

client.ingest.url()

client.documents.list()
client.documents.get()
client.documents.delete()
```

职责：

```txt
1. 封装 axios。
2. 自动附加 Authorization: Bearer token。
3. 自动解析统一响应格式。
4. 成功时返回 data。
5. 失败时抛出 LumiApiError。
```

---

## 15. Web 路由

使用 Vue Router。

路由：

```txt
/login
/documents
/documents/:id
```

访问 `/` 时：

```txt
已登录 -> /documents
未登录 -> /login
```

未登录访问受保护页面时：

```txt
跳转 /login
```

页面文案使用中文。

---

## 16. Web 页面功能

### 16.1 登录页

功能：

```txt
用户名输入框
密码输入框
登录按钮
登录失败 toast 提示
登录成功跳转 /documents
```

### 16.2 文章列表页

功能：

```txt
顶部导航
搜索框
导入文章按钮
文章列表
分页
退出登录
```

导入文章使用 shadcn-vue Dialog：

```txt
点击“导入文章”
输入 URL
点击确认
按钮显示 loading
成功后关闭弹窗并跳转文章详情
失败时 toast 提示
```

### 16.3 文章详情页

功能：

```txt
显示文章标题
显示来源
显示原文链接
显示创建时间
渲染 Markdown 正文
删除文章按钮
```

删除文章使用 shadcn-vue AlertDialog：

```txt
点击删除
弹出确认框
确认后删除
删除成功后跳转 /documents
失败时 toast 提示
```

---

## 17. Markdown 渲染

Web 端 Markdown 渲染规则：

```txt
使用 markdown-it 将 Markdown 转为 HTML
使用 DOMPurify 清洗渲染后的 HTML
使用 @tailwindcss/typography 的 prose 样式展示正文
MVP1 不接入 Shiki
```

---

## 18. 依赖安装

后端依赖：

```powershell
pnpm --filter @lumi/server add @nestjs/config @nestjs/jwt passport passport-jwt bcryptjs axios @prisma/client
pnpm --filter @lumi/server add -D prisma @types/passport-jwt
```

Parser 包依赖：

```powershell
pnpm --filter @lumi/parser add @mozilla/readability jsdom dompurify turndown turndown-plugin-gfm
pnpm --filter @lumi/parser add -D @types/jsdom @types/dompurify @types/turndown
```

Web 依赖：

```powershell
pnpm --filter @lumi/web add vue-router axios markdown-it dompurify lucide-vue-next
pnpm --filter @lumi/web add -D @tailwindcss/typography
```

API Client 依赖：

```powershell
pnpm --filter @lumi/api-client add axios
```

TailwindCSS 和 shadcn-vue 按 Vue + Vite 项目方式初始化。

---

## 19. README 更新

MVP1 需要更新根目录 README，包含：

```txt
项目简介
环境要求
本地 PostgreSQL 准备
.env 配置
Prisma migrate
初始化用户
启动后端
启动 Web
MVP1 功能范围
当前不支持的内容
```

本地启动流程：

```powershell
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:init-user
pnpm dev:server
pnpm dev:web
```

---

## 20. 推荐执行顺序

MVP1 建议按以下顺序实现：

```txt
1. 安装依赖。
2. 配置 Prisma。
3. 创建 User、Document、IngestJob 数据模型。
4. 执行 Prisma migration。
5. 实现初始化用户脚本。
6. 实现 AuthModule。
7. 实现 JWT Guard。
8. 实现 @lumi/parser。
9. 实现 IngestModule。
10. 实现 DocumentsModule。
11. 实现统一响应格式。
12. 实现 @lumi/api-client。
13. 配置 Web Router。
14. 实现登录页。
15. 实现文章列表页。
16. 实现导入文章 Dialog。
17. 实现文章详情页。
18. 实现 Markdown 渲染。
19. 实现删除文章确认弹窗。
20. 更新 README。
21. 手动验收 MVP1。
```

---

## 21. 验收标准

MVP1 完成后需要满足：

```txt
1. 可以启动后端服务。
2. 可以启动 Web 前端。
3. 可以连接本地 PostgreSQL。
4. 可以执行 Prisma migration。
5. 可以通过命令初始化管理员用户。
6. 用户可以打开登录页。
7. 用户可以使用初始化账号登录。
8. 未登录访问文章页面会跳转登录页。
9. 登录后可以进入文章列表页。
10. 可以打开导入文章 Dialog。
11. 可以输入公开网页 URL 并提交。
12. 后端可以抓取网页。
13. 后端可以提取网页正文。
14. 后端可以将正文转换为 Markdown。
15. 后端可以保存 Document。
16. 每次导入都会生成 IngestJob。
17. 重复导入同 URL 会返回已有文章。
18. 已软删除的同 URL 再导入会恢复并刷新文章。
19. Web 可以查看文章列表。
20. Web 可以按 keyword 搜索标题和正文。
21. Web 可以查看文章详情。
22. Markdown 可以正常渲染。
23. Markdown 渲染结果经过 DOMPurify 清洗。
24. Web 可以删除文章。
25. 删除后跳转 /documents。
26. 删除是软删除。
27. 已删除文章不会出现在列表和详情中。
28. README 包含本地启动说明。
```