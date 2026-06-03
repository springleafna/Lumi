# Lumi

Lumi 是一个自用的个人知识管理系统，用于收集、转换、保存和阅读日常浏览的图文网页内容。

## MVP1 功能范围

- 用户登录和 JWT 鉴权
- 初始化管理员用户
- Web 端提交公开网页 URL
- 后端抓取网页、提取正文、清洗 HTML、转换 Markdown
- PostgreSQL 保存文章和 IngestJob 导入记录
- Web 端文章列表、搜索、详情阅读和软删除
- `@lumi/api-client` 封装前端请求
- `@lumi/parser` 封装 HTML 到 Markdown 解析

## 当前不支持

浏览器插件导入、微信公众号等受限页面导入、选中内容导入、CLI 导入、Redis、BullMQ、Docker Compose、pgvector、AI 总结/问答、图片本地化、PDF/RSS/视频/音频解析和注册页暂不实现。

## 环境要求

- Node.js >= 20
- pnpm >= 9
- PostgreSQL

默认端口：

- Server: `http://localhost:3000`
- Web: `http://localhost:5173`

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
VITE_API_BASE_URL="http://localhost:3000/api"
```

## 启动流程

```powershell
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:init-user
pnpm dev:server
pnpm dev:web
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
pnpm db:generate
pnpm db:migrate
pnpm db:init-user
```

## Workspace

- `apps/web`: Vue 3 Web 客户端
- `apps/server`: NestJS API 服务
- `apps/extension`: WXT 浏览器插件预留
- `apps/cli`: CLI 预留
- `packages/shared`: 共享类型
- `packages/api-client`: API Client
- `packages/parser`: 网页正文解析和 Markdown 转换
- `packages/ai`: AI Provider 预留
- `packages/storage`: 对象存储预留
