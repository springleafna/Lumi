# Lumi MVP4 方案文档：AI 阅读助手与异步任务体系

## 1. 背景

MVP0 已完成 Lumi 的 Monorepo 工程结构搭建；MVP1 打通了 Web 端 URL 导入、解析、保存和阅读闭环；MVP2 补全了浏览器插件导入能力；MVP3 增强了文章列表筛选、标签、归档、回收站和阅读界面体验。

MVP4 开始进入 Lumi 的 AI 能力阶段。本阶段不只是在文章详情页增加一个 AI 摘要按钮，而是需要建立一套可扩展的 AI 阅读助手基础设施：

- 导入和解析进入异步任务系统。
- 文章解析完成后自动触发 AI 分析。
- AI 分析结果长期保存。
- 文章详情页提供安静、可折叠的 AI 助手抽屉。
- 用户可以基于当前文章内容提问，并获得带依据片段的回答。

MVP4 完成后，Lumi 将从“可保存、可整理、可阅读的个人知识库”推进到“能辅助理解和提炼文章的个人阅读助手”。

## 2. MVP4 目标

MVP4 聚焦 AI 阅读助手和异步任务体系：

- 引入 Redis + BullMQ。
- 将 URL 导入解析和插件 HTML 导入解析改为异步任务。
- 拆分独立 Worker 进程处理导入解析和 AI 分析任务。
- 导入后立即在文章列表展示占位卡片，状态为“解析中”。
- 文章解析完成后自动进入 AI 分析队列。
- 支持 OpenAI-Compatible Provider 抽象。
- 当前优先支持 DeepSeek 和硅基流动 SiliconFlow。
- 默认从后端 `.env` 读取 AI Provider 配置，同时预留 Web 设置页扩展。
- 新增 `AiAnalysis` 表，一篇文章保存一条当前 AI 分析结果。
- AI 分析包含结构化完整卡片：
  - 一句话总结。
  - 详细摘要。
  - 关键要点。
  - 核心概念。
  - 行动项。
  - 适合人群。
  - 自动标签。
- AI 生成的标签直接写入文章标签，用户可删除和修改。
- 文章详情页支持当前文章问答。
- 问答回答使用流式输出。
- 问答只围绕当前文章，并附带原文依据片段。
- 问答历史按文章保存。
- 前端通过轮询感知解析和 AI 生成状态。

## 3. 非目标

MVP4 暂不包含以下能力：

- 跨文章知识库问答。
- 语义搜索。
- 向量数据库或 `pgvector`。
- 自动 Provider 降级。
- Web 设置页中配置 API Key。
- AI 结果多版本历史。
- 多用户独立 AI Key。
- AI 标签和人工标签分开展示。
- 摘要生成流式输出。
- WebSocket 或 SSE 实时推送。
- 批量导入任务管理页。
- 复杂任务监控仪表盘。

## 4. 产品范围

### 4.1 异步导入体验

导入入口仍保持 MVP1/MVP2 的使用方式：

- Web 端输入 URL 导入。
- 浏览器插件保存当前 URL。
- 浏览器插件保存当前页面完整 HTML。

但导入行为从同步处理改为异步处理：

1. 用户发起导入。
2. 后端校验 URL 或 HTML 输入。
3. 后端创建 `IngestJob`。
4. 后端创建或更新一篇占位 `Document`。
5. 后端将导入解析任务加入 BullMQ。
6. API 立即返回占位文章和任务信息。
7. Worker 抓取/解析/转换正文。
8. Worker 更新文章正文、摘要、字数等内容。
9. Worker 将 `IngestJob` 标记为成功或失败。
10. 解析成功后自动创建 AI 分析任务。

列表页展示规则：

- 导入后文章立即出现在默认文章列表。
- 占位卡片标题优先使用输入标题，其次使用 URL。
- 占位卡片展示状态“解析中”。
- 解析完成后卡片变成正常文章。
- 解析失败后卡片展示“解析失败”，并提供重试入口。

### 4.2 AI 自动分析

文章解析成功后自动进入 AI 分析流程：

1. Worker 创建或更新 `AiAnalysis` 为 `pending`。
2. AI 分析任务进入 BullMQ。
3. AI Worker 调用当前启用的 Provider。
4. AI 返回结构化 JSON。
5. 后端校验和归一化 AI 输出。
6. 保存 `AiAnalysis`。
7. 将 AI 生成标签写入文章标签。

AI 失败体验：

- 列表页不强打扰，不显示明显失败提示。
- 详情页 AI 抽屉中显示失败状态和重试入口。
- 失败原因可保存在数据库中，但前端只在 AI 抽屉内安静展示。

### 4.3 文章详情页 AI 抽屉

详情页默认仍以阅读为中心，不把 AI 信息强塞进正文区域。

新增右侧可折叠 AI 抽屉：

- 默认关闭。
- 顶部工具栏提供 `AI` 按钮。
- 点击后从右侧展开。
- 移动端可以改为底部抽屉或全屏面板。

AI 抽屉包含：

- AI 生成状态。
- 结构化摘要卡片。
- 自动标签展示。
- 重新生成入口。
- 当前文章问答。
- 问答历史。
- 失败后的重试入口。

### 4.4 结构化摘要卡片

AI 分析结果结构：

- `oneSentenceSummary`：一句话总结。
- `summary`：详细摘要。
- `keyPoints`：关键要点，建议 3-8 条。
- `concepts`：核心概念，建议 3-8 个。
- `actions`：行动项或启发，建议 0-6 条。
- `audience`：适合人群。
- `tags`：自动标签，建议 3-8 个。

展示原则：

- 使用中文输出。
- 不使用夸张颜色和大面积装饰。
- 以 shadcn/ui + Notion 风格为主。
- 不影响正文阅读节奏。

### 4.5 当前文章问答

问答范围：

- 只围绕当前文章。
- 不跨文章检索。
- 不使用向量库。
- 通过当前文章分段切块 + 关键词/简单相关度匹配选出依据片段。

问答输出：

- 回答使用中文。
- 依据片段保留原文。
- 回答中需要提醒用户“基于当前文章内容”。
- 如果文章没有相关依据，应明确说明文章中没有足够信息。

问答交互：

- 用户在 AI 抽屉中输入问题。
- 后端创建问答记录。
- 使用流式响应返回回答内容。
- 流式完成后保存完整回答。
- 问答历史按文章展示。

## 5. 技术方案

### 5.1 总体架构

MVP4 后端拆为两个运行角色：

- API Server：
  - 处理 HTTP API。
  - 鉴权。
  - 创建导入任务。
  - 查询文档、AI 分析、问答历史。
  - 发起 AI 问答流式响应。
- Worker：
  - 消费 BullMQ 队列。
  - 执行 URL 抓取。
  - 执行 HTML 解析。
  - 执行 AI 分析。
  - 写入任务状态和结果。

运行依赖：

- PostgreSQL：主数据存储。
- Redis：BullMQ 队列依赖。
- DeepSeek / SiliconFlow：OpenAI-Compatible LLM Provider。

### 5.2 BullMQ 队列

新增两个主要队列：

- `ingest`
  - 处理 URL/HTML 导入解析。
- `ai-analysis`
  - 处理文章结构化 AI 分析和自动标签。

可选预留：

- `ai-maintenance`
  - 后续用于批量重新生成、模型迁移、失败任务补偿。

任务命名：

- `ingest:url`
- `ingest:html`
- `ai:analyze-document`

### 5.3 Worker 运行方式

MVP4 直接采用独立 Worker 进程：

```bash
pnpm dev:server
pnpm dev:worker
pnpm dev:web
```

根目录新增统一开发脚本：

```bash
pnpm dev:all
```

`dev:all` 用于同时启动 Web、Server、Worker。实现时可以使用 `concurrently` 或类似工具。

### 5.4 重试策略

默认策略：

- 导入解析任务重试 3 次。
- AI 分析任务重试 2 次。
- 重试间隔使用递增退避。

建议默认间隔：

- 第一次重试：5 秒。
- 第二次重试：15 秒。
- 第三次重试：45 秒。

支持通过 `.env` 配置：

```env
INGEST_JOB_ATTEMPTS=3
AI_JOB_ATTEMPTS=2
JOB_BACKOFF_DELAY_MS=5000
```

失败状态：

- 导入失败：`IngestJob.status = failed`，文章展示解析失败。
- AI 失败：`AiAnalysis.status = failed`，详情页 AI 抽屉可重试。

## 6. 数据设计

### 6.1 Document

MVP4 需要给 `Document` 增加导入解析状态字段。

新增字段：

- `ingestStatus DocumentIngestStatus`
- `ingestErrorMessage String?`

建议枚举：

```prisma
enum DocumentIngestStatus {
  pending
  processing
  succeeded
  failed
}
```

含义：

- `pending`：已创建占位文章，等待 Worker 处理。
- `processing`：Worker 正在抓取或解析。
- `succeeded`：正文解析完成。
- `failed`：解析失败。

占位文章字段规则：

- `title`：使用传入标题或 URL。
- `markdown`：空字符串。
- `contentText`：空。
- `excerpt`：空。
- `wordCount`：空。

### 6.2 IngestJob

现有 `IngestJob` 继续使用。

MVP4 调整语义：

- API Server 只负责创建任务记录和入队。
- Worker 负责更新 `processing`、`succeeded`、`failed`。
- `documentId` 应在创建占位文章后尽早写入。

可选新增字段：

- `attempts Int @default(0)`
- `lastErrorAt DateTime?`

如果 BullMQ 已能提供足够任务尝试信息，MVP4 可暂不把 attempts 固化到数据库。

### 6.3 AiAnalysis

新增模型：一篇文章一条当前 AI 分析结果。

建议字段：

```prisma
model AiAnalysis {
  id                 String           @id @default(cuid())
  status             AiAnalysisStatus @default(pending)
  provider           String?
  model              String?
  language           String           @default("zh-CN")
  oneSentenceSummary String?
  summary            String?
  keyPoints          Json?
  concepts           Json?
  actions            Json?
  audience           String?
  suggestedTags      Json?
  errorMessage       String?
  startedAt          DateTime?
  finishedAt         DateTime?
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt

  documentId String   @unique
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId     String
  user       User     @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([status])
}

enum AiAnalysisStatus {
  pending
  processing
  succeeded
  failed
}
```

说明：

- `suggestedTags` 保存 AI 原始建议标签。
- 写入 `Tag` 和 `DocumentTag` 后，文章标签仍走 MVP3 的标签体系。
- `provider` 和 `model` 记录生成结果使用的服务，方便后续排查和重新生成。

### 6.4 AiConversation

新增文章问答记录模型。

建议字段：

```prisma
model AiConversation {
  id        String   @id @default(cuid())
  question  String
  answer    String?
  citations Json?
  status    AiConversationStatus @default(processing)
  provider  String?
  model     String?
  errorMessage String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  finishedAt DateTime?

  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId     String
  user       User     @relation(fields: [userId], references: [id])

  @@index([documentId, createdAt])
  @@index([userId])
}

enum AiConversationStatus {
  processing
  succeeded
  failed
}
```

`citations` 保存依据片段数组：

```json
[
  {
    "index": 1,
    "text": "原文片段",
    "score": 0.82
  }
]
```

## 7. AI Provider 设计

### 7.1 Provider 抽象

MVP4 不直接在业务服务中写死 DeepSeek 或 SiliconFlow，而是封装统一接口。

建议接口：

```ts
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AiProvider = {
  name: string;
  model: string;
  chat(input: {
    messages: ChatMessage[];
    temperature?: number;
    responseFormat?: 'json' | 'text';
  }): Promise<string>;
  streamChat(input: {
    messages: ChatMessage[];
    temperature?: number;
  }): AsyncIterable<string>;
};
```

### 7.2 Provider 配置

支持多个 Provider 配置，但只启用一个默认 Provider。

`.env.example` 需要新增：

```env
REDIS_URL="redis://127.0.0.1:6379"

AI_PROVIDER="deepseek"
AI_OUTPUT_LANGUAGE="zh-CN"

DEEPSEEK_API_KEY=""
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-chat"

SILICONFLOW_API_KEY=""
SILICONFLOW_BASE_URL="https://api.siliconflow.cn/v1"
SILICONFLOW_MODEL=""

INGEST_JOB_ATTEMPTS=3
AI_JOB_ATTEMPTS=2
JOB_BACKOFF_DELAY_MS=5000
```

规则：

- `AI_PROVIDER=deepseek` 时读取 DeepSeek 配置。
- `AI_PROVIDER=siliconflow` 时读取 SiliconFlow 配置。
- API Key 只放后端环境变量，不暴露给 Web 或插件。
- 后续 Web 设置页可以扩展 Provider 配置，但 MVP4 不实现。

### 7.3 AI 输出语言

MVP4 采用固定策略：

- 摘要、要点、标签、问答回答使用中文。
- 依据片段保留原文。

## 8. AI Prompt 设计

所有Prompt应分别写入单独的文件中，在业务逻辑中使用时则引入对应的Prompt文件而不要把大段的Prompt字符串写在业务逻辑中。  

### 8.1 结构化摘要 Prompt

输入：

- 标题。
- 来源。
- 作者。
- 摘要。
- 正文纯文本。

输出必须是 JSON：

```json
{
  "oneSentenceSummary": "一句话总结",
  "summary": "详细摘要",
  "keyPoints": ["要点1", "要点2"],
  "concepts": ["概念1", "概念2"],
  "actions": ["行动项1"],
  "audience": "适合人群",
  "tags": ["标签1", "标签2"]
}
```

约束：

- 不要编造文章未提及的信息。
- 标签使用短中文词。
- 标签数量控制在 3-8 个。
- 如果文章信息不足，字段可以给出保守描述，但不能伪造。

### 8.2 当前文章问答 Prompt

输入：

- 用户问题。
- 当前文章标题。
- 命中的依据片段。
- 可选 AI 摘要卡片。

回答规则：

- 使用中文回答。
- 只基于给定片段和当前文章信息。
- 如果没有依据，明确说明“当前文章中没有足够信息回答这个问题”。
- 回答后列出依据片段编号。
- 不生成跨文章结论。

## 9. API 设计

### 9.1 导入接口

保留现有接口：

```txt
POST /api/ingest/url
POST /api/ingest/html
```

但响应语义调整为“任务已创建”。

返回：

- 占位 `document`。
- `job`。

`IngestUrlResponse` 和 `IngestHtmlResponse` 可以继续复用现有结构，但前端需要根据 `document.ingestStatus` 判断是否为可阅读文章。

### 9.2 重试导入解析

新增：

```txt
POST /api/ingest/jobs/:id/retry
```

规则：

- 只能重试当前用户自己的导入任务。
- 仅 `failed` 状态可重试。
- 重试后状态回到 `pending`，并重新加入 BullMQ。

也可以补充文章维度重试：

```txt
POST /api/documents/:id/retry-ingest
```

MVP4 优先实现哪一个可以根据前端更容易调用的方式决定。建议优先文章维度，因为列表卡片拿到的是 document id。

### 9.3 查询文章列表和详情

`GET /api/documents`

新增返回字段：

- `ingestStatus`
- `ingestErrorMessage`
- `aiAnalysisStatus`

`GET /api/documents/:id`

新增返回字段：

- `ingestStatus`
- `ingestErrorMessage`
- `aiAnalysis`

### 9.4 AI 分析接口

新增：

```txt
GET  /api/documents/:id/ai-analysis
POST /api/documents/:id/ai-analysis/retry
```

说明：

- `GET` 获取当前文章 AI 分析状态和结果。
- `retry` 只在 AI 分析失败或用户手动重新生成时使用。
- 文章必须解析成功后才允许 AI 分析。

### 9.5 AI 问答接口

新增：

```txt
GET  /api/documents/:id/ai-conversations
POST /api/documents/:id/ai-conversations
```

`GET` 返回当前文章问答历史。

`POST` 创建一次问答，并使用流式响应返回：

请求：

```json
{
  "question": "这篇文章的核心观点是什么？"
}
```

流式返回建议使用 `text/event-stream` 或 fetch readable stream。

MVP4 如果前端实现流式解析复杂，可以采用纯文本 chunk 流：

- API 返回 `text/plain` stream。
- 前端逐段追加显示。
- 服务端在流结束后保存完整回答和依据。

## 10. 前端设计

### 10.1 文章列表页

新增状态展示：

- `解析中`
- `解析失败`

列表卡片行为：

- `pending` / `processing`：
  - 显示标题或 URL。
  - 摘要位置显示“正在解析文章内容”。
  - 不允许进入正文阅读，或进入详情页但展示加载状态。
- `failed`：
  - 显示“解析失败”。
  - 提供重试按钮。
- `succeeded`：
  - 按现有文章卡片展示。

轮询：

- 当列表中存在 `pending` / `processing` 的文章时，每隔 3-5 秒刷新列表。
- 当当前详情页文章处于解析中或 AI 生成中时，每隔 3-5 秒刷新详情或 AI 分析。

### 10.2 文章详情页

解析状态：

- 如果文章还在解析中，正文区域显示轻量加载状态。
- 如果解析失败，正文区域显示失败状态和重试按钮。
- 解析成功后展示 Markdown 阅读器。

AI 抽屉：

- 顶部工具栏增加 `AI` 按钮。
- 抽屉默认关闭。
- 抽屉打开后加载 AI 分析和问答历史。
- AI 分析 `pending/processing` 时显示生成中。
- AI 分析 `failed` 时显示安静失败状态和重试按钮。
- AI 分析 `succeeded` 时显示结构化摘要卡片。

问答：

- 输入框固定在抽屉底部。
- 提交后立即创建用户问题消息。
- 回答流式追加。
- 完成后刷新问答历史。

视觉要求：

- 继续使用黑白灰 Notion/shadcn 风格。
- 不使用蓝色、琥珀色、紫色强调色。
- 不做花哨 AI 渐变。
- AI 抽屉应像阅读辅助工具，而不是聊天产品首页。

## 11. Shared DTO 与 API Client

`packages/shared` 需要新增或扩展：

- `DocumentIngestStatus`
- `AiAnalysisStatus`
- `AiConversationStatus`
- `AiAnalysisDto`
- `AiConversationDto`
- `CreateAiConversationRequest`
- `RetryAiAnalysisResponse`
- `RetryIngestResponse`

`packages/api-client` 需要新增：

- `documents.getAiAnalysis(id)`
- `documents.retryAiAnalysis(id)`
- `documents.listAiConversations(id)`
- `documents.createAiConversation(id, payload)`
- `documents.retryIngest(id)`

流式问答如果 axios 不适合浏览器流读取，可以在 Web 端针对该接口使用原生 `fetch`，但鉴权和错误处理要和 `api-client` 保持一致。

## 12. Worker 与模块拆分

后端建议新增模块：

```txt
apps/server/src/queue
apps/server/src/worker
apps/server/src/ai
apps/server/src/ai-analysis
```

建议职责：

- `queue`
  - Redis 连接配置。
  - Queue 实例。
  - 入队服务。
- `worker`
  - Worker bootstrap。
  - 注册 ingest worker 和 ai-analysis worker。
- `ai`
  - Provider 抽象。
  - DeepSeek provider。
  - SiliconFlow provider。
  - Prompt 构造。
- `ai-analysis`
  - AI 分析业务服务。
  - 问答服务。
  - 文本切块和依据片段匹配。

入口文件：

```txt
apps/server/src/worker.ts
```

Server package 脚本：

```json
{
  "start:worker": "nest start --entryFile worker",
  "start:worker:dev": "nest start --watch --entryFile worker"
}
```

具体 Nest CLI 对 entry file 的支持需要实现时验证；如果不顺，可使用 `ts-node` 单独启动 worker bootstrap。

## 13. 实现步骤

建议按以下顺序实现：

1. 编写 MVP4 方案文档。
2. 安装 BullMQ、ioredis、concurrently 等必要依赖。
3. 更新 `.env.example`，加入 Redis 和 AI Provider 配置。
4. 更新 Prisma schema：
   - `Document.ingestStatus`
   - `Document.ingestErrorMessage`
   - `AiAnalysis`
   - `AiConversation`
   - 相关枚举和关系。
5. 执行 Prisma migration。
6. 扩展 `packages/shared` DTO。
7. 扩展 `packages/api-client`。
8. 新增 queue 模块，封装 BullMQ 队列。
9. 新增 worker 入口和 Worker bootstrap。
10. 将 URL/HTML 导入接口改为创建占位文章和入队。
11. 将现有同步抓取解析逻辑迁移到 ingest worker。
12. 解析成功后自动入队 AI 分析任务。
13. 实现 AI Provider 抽象。
14. 实现 DeepSeek Provider。
15. 实现 SiliconFlow Provider。
16. 实现结构化摘要 Prompt 和 JSON 结果校验。
17. 实现 AI 分析 Worker。
18. 实现 AI 标签写入文章标签。
19. 实现 AI 分析查询和重试接口。
20. 实现当前文章分段切块和依据片段匹配。
21. 实现文章问答历史接口。
22. 实现文章问答流式接口。
23. 更新 Web 列表页解析中/解析失败状态。
24. 更新 Web 详情页解析状态。
25. 实现详情页 AI 抽屉。
26. 实现 AI 摘要卡片展示。
27. 实现 AI 问答流式 UI。
28. 实现前端轮询。
29. 更新 README 和 AGENTS。
30. 运行构建和手动验收。

## 14. 验收标准

MVP4 完成后需要满足：

- 本机 Redis 启动后，`pnpm dev:worker` 可以正常连接 Redis。
- `pnpm dev:server` 和 `pnpm dev:worker` 可分别启动。
- 根目录存在统一开发脚本用于同时启动 Web、Server、Worker。
- Web 端 URL 导入后接口立即返回，不等待抓取和解析完成。
- 插件 URL 导入后可以创建占位文章。
- 插件 HTML 导入后可以创建占位文章。
- 文章列表能显示“解析中”的占位卡片。
- 解析成功后文章卡片自动变成正常文章。
- 解析失败后文章卡片显示失败状态，并可重试。
- 文章解析成功后自动触发 AI 分析任务。
- AI 分析成功后详情页 AI 抽屉展示结构化摘要卡片。
- AI 自动标签会写入文章标签。
- 用户可以删除或修改 AI 自动写入的标签。
- AI 分析失败时列表页不打扰，详情页 AI 抽屉可重试。
- AI Provider 可通过 `.env` 在 DeepSeek 和 SiliconFlow 之间切换。
- 文章详情页可以对当前文章提问。
- 问答回答使用流式输出。
- 问答回答附带原文依据片段。
- 问答历史刷新后仍然保留。
- 当前文章问答不会跨文章编造内容。
- 前端通过轮询更新解析和 AI 状态。
- `pnpm build:server` 通过。
- `pnpm build:web` 通过。
- `pnpm build:extension` 通过。

## 15. 风险与处理

### 15.1 AI JSON 输出不稳定

风险：

- 模型可能输出非 JSON。
- 字段缺失。
- 标签数量过多。

处理：

- Prompt 明确要求只输出 JSON。
- 服务端做 JSON parse 和字段归一化。
- 字段缺失时保存空数组或空字符串。
- 标签做 trim、去重、长度限制。

### 15.2 异步导入影响现有插件体验

风险：

- 插件保存后以前可以立即打开文章，现在可能打开的是解析中详情页。

处理：

- 插件仍打开 Web 详情页。
- 详情页显示解析中状态。
- 解析完成后通过轮询自动展示正文。

### 15.3 Worker 与 API Server 配置不一致

风险：

- API Server 和 Worker 读取不同 `.env` 或包构建产物不同。

处理：

- 两者都从根目录 `.env` 读取。
- 根脚本先执行 `pnpm build:packages`。
- README 明确启动顺序。

### 15.4 Redis 未启动

风险：

- 导入接口无法入队。

处理：

- Server 启动时记录 Redis 连接状态。
- 导入接口在 Redis 不可用时返回明确错误。
- README 说明先启动本机 Redis。

### 15.5 模型调用成本

风险：

- 导入后自动 AI 分析会产生模型费用。

处理：

- MVP4 先通过 `.env` 控制 Provider。
- AI 分析失败可重试，但不会无限重试。
- 后续可加“是否导入后自动分析”的设置。

## 16. 后续扩展

MVP4 完成后，后续可以继续扩展：

- Web 设置页配置 AI Provider。
- 每个用户独立 AI Key。
- AI 分析结果多版本历史。
- Provider 主备自动降级。
- 跨文章知识库问答。
- `pgvector` 语义检索。
- 混合搜索。
- AI 生成阅读笔记。
- 批量重新生成 AI 分析。
- 导入任务管理页。
- SSE 或 WebSocket 实时状态推送。
