# Lumi Agent Notes

## 项目概览

Lumi 是一个个人知识管理应用，用于收集、解析、保存、整理和阅读网页文章。仓库为 pnpm monorepo，脚本统一在仓库根目录执行。`docs/` 里有各 MVP 的方案文档。

| 部分 | 路径 | 说明 |
| --- | --- | --- |
| Web 客户端 | `apps/web` | Vue 3 + Vite |
| API 服务 | `apps/server` | NestJS + Prisma 7，异步任务走 BullMQ + Redis |
| Worker | `apps/server/src/worker.ts` | 独立进程，消费 `lumi-ingest` / `lumi-ai-analysis` / `lumi-embedding` 队列 |
| 浏览器扩展 | `apps/extension` | WXT；popup 支持保存当前 URL / 整页 HTML / 选中内容 |
| 移动端 | `apps/mobile` | Vue 3 + Vite + Vant 4；安卓优先，Capacitor 打包，可当移动网页/PWA 用 |
| 共享包 | `packages/*` | `shared`（DTO）、`api-client`（axios 封装）、`parser`（HTML 转 Markdown）、`storage`（S3 兼容对象存储）、`ai`（占位） |

## 常用脚本

```powershell
pnpm install
pnpm dev:all   # 同时启动 web + server + worker
pnpm dev:server / dev:worker / dev:web / dev:extension
pnpm build:web / build:server / build:extension
pnpm db:generate / db:migrate / db:init-user
```

- 根目录脚本会自动先执行 `build:packages`（shared/parser/storage/api-client 构建到 `dist/`）。
- 改动后按范围跑聚焦构建：`pnpm build:web` / `build:server` / `build:extension` / `build:mobile`。
- PostgreSQL 不可用时，`db:migrate` 和 `db:init-user` 按设计直接失败。

## 环境变量

- 根目录 `.env` 驱动 server、worker 和 Prisma；web 使用 `VITE_API_BASE_URL`。所有键位见 `.env.example`。
- 默认值：服务 `http://localhost:3000`（API 前缀 `/api`）、web `http://localhost:5173`、Redis `redis://localhost:6379`。
- PostgreSQL 密码含特殊字符时必须在 `DATABASE_URL` 中做 URL 编码（`#` → `%23`）。
- 对象存储（图片归档）是可选的；未配置时 URL/HTML 导入保留原图地址。桶需手动创建并配置公开读。
- 日志：server 和 worker 按天写文件到仓库根目录 `logs/`（已被 gitignore），保留 14 天；可通过 `LOG_LEVEL`（默认 `info`）和 `LOG_DIR` 配置。

## 服务端要点

- 认证为 JWT；管理员由 `db:init-user` 初始化；文档按用户隔离。
- 导入是异步的：API 创建占位文档 + BullMQ 任务，worker 负责抓取/解析/图片归档/落库，然后接着投递 AI 分析和向量索引任务。Redis 必须先启动。
- 文档状态字段：`deletedAt`（回收站）、`archivedAt`（归档）、`ingestStatus`（占位/解析进度）、`readingStatus`（`unread`/`read`；详情页会把解析成功且非回收站的未读文档自动标为已读）、`favoritedAt`（独立于归档和阅读状态）、本地文件导入 `source = 本地`。
- 标签是手动纯文本标签；AI 生成的标签写入同一体系，保持可编辑。
- 导入限额：HTML `5MB`（超出返回 `页面内容过大，暂不支持保存`）、文件 `.md`/`.txt` 最大 `2MB`（不做 URL 去重）、选区最大 `200KB`（选区导入不自动触发 AI 分析）。
- Express JSON 解析器上限为 `6mb`（供扩展 HTML 导入使用）。
- 图片归档只作用于新导入的 URL/HTML 文章（历史文章、选区、本地文件不归档）：仅支持 JPEG/PNG/WebP/GIF/AVIF，每篇正文最多 60 张，单图限制 10MB / 10s / 3 次重定向，禁止私有/本地 IP。永久删除时尽力清理已归档对象，失败不阻塞文档删除。

## Web

视觉方向：安静的阅读产品（对标 shadcn/ui、Notion、Readwise Reader、Linear）——只用黑白灰，zinc/neutral 中性色表面，细边框、小圆角、浅阴影。不用蓝/琥珀/紫强调色，不用重渐变和超大胶囊形。标签是浅灰底、无边框。
  
- 前端统一使用 shadcn/ui 风格：可复用组件在 `apps/web/src/components/ui`（Button、Input、Select、Card、Badge、Tabs、Dialog、EmptyState、SearchInput、Toaster）。优先使用它们，再考虑页面局部控件；toast 反馈走 `composables/useToast.ts`。
- 图标统一使用已安装的 `lucide-vue-next` 图标库，不引入其他图标方案。
- 三层结构：`components/ui`（全局）→ `components/<area>`（领域组件，如 `document-detail`、`documents`、`knowledge-chat`、`settings`）→ `views`（页面壳，只做组装）。单个 `.vue` 控制在 ~500 行内（~800 为硬上限）。
- 拆分优先级：纯函数放 `src/lib`（不含 Vue 响应式）→ 组合式函数放 `src/composables`（不得直接 import `useToast`，错误处理由调用方注入）→ 领域组件 → 可复用组件。
- 样式：全局 CSS 按页面/组件拆分在 `src/styles/`（base / ui / layout / document-list / document-detail / markdown-reader / ai-drawer / shared-forms / reader-marks / settings / knowledge-chat / annotation-list / loading / responsive），`src/style.css` 仅作 `@import` 入口，按上述顺序保持层叠不变，`responsive.css` 必须最后。`v-html` 注入的内容（`.markdown-reader`、高亮/引用标记）必须用全局样式。新增样式进对应拆分文件；只服务单个组件的新控件优先放它自己的 `<style scoped>`。优先用 props 传递，少用 `:deep()`。
- 文档列表：阅读状态和收藏筛选在搜索工具栏；不要在卡片底部重复加收藏角标。
- 文章详情页：AI 问答是即时问答，抽屉只显示当前一轮、不读取历史（服务端 `AiConversation` 仍照常落库），回答按 Markdown 渲染（与知识库问答共用 `useMarkdownRenderer({ html: false })` + DOMPurify 管线）。服务端单文档问答不做检索，直接把正文全文放进 prompt（超长按 `MAX_ARTICLE_CHARS` 截断），不要往回加片段检索。批注为双向定位：点正文高亮会在抽屉列表中选中并滚动到对应条目，点列表条目会滚动正文并短暂闪烁标记。

## 扩展

- popup 通过 `client.ingest.*` 保存当前 URL、整页 HTML 和选中内容；options 页配置地址和登录（存 `browser.storage.local`）。
- 扩展端不清洗抓取的 HTML；解析和净化统一在服务端 `@lumi/parser` 完成。
- 移动端服务器地址是运行时配置（localStorage，首次进 `/setup`），不是构建时 env；改地址后必须整页跳转重建 `client` 单例。AI/Embedding 配置管理只在桌面 Web，移动端只做消费和轻交互。

## 实现约定

- DTO 变更先加在 `packages/shared`，再同步 `api-client` / server / web。
- web 和扩展统一走 `@lumi/api-client`，不要直接裸写 axios。
- API 端点（documents、ingest、settings/ai、embedding-jobs、knowledge-chat）以 `packages/api-client` 和服务端控制器为准。
- AI 提示词统一放 `apps/server/src/ai/prompts/`（按用途一个文件，导出 `buildXxxMessages`），服务代码只负责引入调用，不要把提示词内嵌回业务逻辑；长文本截断统一用 `common/text.utils.ts` 的 `truncate`。
- 可复用的 Web 控件放 `apps/web/src/components/ui`。
- 功能改动不要夹带无关重构。
