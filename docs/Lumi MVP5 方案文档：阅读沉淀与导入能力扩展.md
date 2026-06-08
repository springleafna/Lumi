# Lumi MVP5 方案文档：阅读沉淀与导入能力扩展

## 1. 背景

MVP0 已完成 Lumi 的 Monorepo 工程结构搭建；MVP1 打通了 Web 端 URL 导入、解析、保存和阅读闭环；MVP2 补全了浏览器插件 URL/HTML 导入能力；MVP3 增强了文章列表筛选、标签、归档、回收站和阅读界面体验；MVP4 建立了 Redis + BullMQ 异步任务体系，并加入单篇文章 AI 分析与当前文章问答。

MVP5 不继续扩展跨文章 AI、语义检索或知识库问答，而是回到 Lumi 作为个人阅读产品的日常使用体验：

- 让用户能标记一篇内容的阅读进度和重要程度。
- 让用户能在阅读正文时留下高亮和批注。
- 让浏览器插件支持保存网页中的选中内容。
- 让 Web 端支持导入本地 Markdown / 文本文档。
- 让技术文章中的代码块获得基础高亮展示。

MVP5 完成后，Lumi 将从“能保存、整理、AI 辅助理解文章”推进到“能沉淀个人阅读痕迹，并更灵活收集资料的阅读工作台”。

## 2. MVP5 目标

MVP5 聚焦阅读沉淀与导入能力扩展：

- 新增文章阅读状态：
  - 未读。
  - 已读。
- 新增收藏能力：
  - 收藏和取消收藏文章。
  - 收藏不影响归档和阅读状态。
- 支持文章正文高亮与批注：
  - 选中文字后创建单色高亮。
  - 创建高亮时可以填写可选批注。
  - 正文内回显高亮。
  - 右侧辅助抽屉展示“高亮与批注”列表。
- 扩展详情页右侧辅助抽屉：
  - 与 MVP4 AI 抽屉共用右侧区域。
  - 使用 `AI / 批注` Tab 切换。
- Web 端导入弹窗增加文件导入：
  - 支持 `.md` 和 `.txt` 单文件上传。
  - 上传后立即创建完整文章。
  - 文件导入成功后自动触发 AI 分析，但 AI 入队失败不阻塞导入。
- 浏览器插件增加选中内容导入：
  - 用户选中网页内容后，在 Popup 中点击“保存选中内容”。
  - 保存为 `fragment` 类型文档。
- Markdown 阅读器增加 Shiki 基础代码高亮：
  - 仅处理 fenced code block。
  - 固定浅色主题。
  - 加载失败时降级为普通代码块。

## 3. 非目标

MVP5 暂不包含以下能力：

- 跨文章知识库问答。
- 语义搜索、混合搜索、`pgvector` 向量检索。
- PDF 导入。
- RSS 导入或订阅。
- CLI 导入。
- 图片本地化存储。
- 批量文件导入。
- 批量导入任务管理页。
- 收藏页、批注页、阅读统计页。
- Markdown 导出。
- 多色高亮。
- 独立笔记系统。
- 高亮和批注参与 AI 分析或问答上下文。
- Shiki 代码块复制按钮。
- Shiki 代码块行号。
- 插件右键菜单导入。
- 插件 iframe 选区导入。
- 插件剪贴板导入。

## 4. 产品语义

### 4.1 归档、收藏和阅读状态的关系

MVP3 已有归档能力。MVP5 不改变归档语义。

- 归档：
  - 表示从默认列表中隐藏。
  - 更接近“已收纳 / 不再打扰”。
  - 不表示已读，也不表示重要。
- 收藏：
  - 表示内容重要或值得长期关注。
  - 不影响默认列表是否展示。
  - 不影响阅读状态。
- 阅读状态：
  - 表示用户对文章的阅读进度。
  - 包含 `未读 / 已读`。

一篇文章可以同时是：

- 已读 + 收藏 + 归档。
- 未读 + 收藏。
- 已读 + 未收藏 + 未归档。

### 4.2 默认列表规则

MVP5 不改变 MVP3 的默认列表规则：

- 默认列表仍展示未归档、未删除文章。
- 已归档文章进入归档视图。
- 回收站文章进入回收站视图。
- 阅读状态和收藏筛选不改变默认列表范围，只在当前状态视图内进一步收窄结果。
- 列表搜索工具栏提供 `全部 / 未读 / 已读` 阅读状态筛选和独立收藏筛选。

## 5. 产品范围

### 5.1 阅读状态

阅读状态取值：

- `unread`：未读。
- `read`：已读。

初始化规则：

- 新导入文章默认 `unread`。
- 已有文章迁移后默认 `unread`。

自动变更规则：

- 详情页加载到非回收站文章后，如果当前文章 `readingStatus = unread`，前端调用接口将其改为 `read`。
- 只有 `unread -> read` 会自动发生。
- 已读文章再次打开详情页时不会产生阅读状态写入。
- 归档文章打开详情页时也遵守同一规则。
- 回收站文章保持只读，不触发阅读状态写入。
- `GET /api/documents/:id` 不产生写入副作用。

手动操作：

- MVP5 不提供手动修改阅读状态入口。
- 阅读状态由详情页打开行为自动维护。

展示规则：

- 列表卡片显示当前阅读状态。
- 详情页正文头部显示当前阅读状态。
- 未读徽章通过小红点做轻量区分。
- MVP5 不在左侧筛选栏增加阅读状态筛选，而是在列表搜索工具栏提供 `全部 / 未读 / 已读` 筛选。

### 5.2 收藏

收藏规则：

- 用户可以收藏或取消收藏文章。
- 收藏不影响归档。
- 收藏不影响阅读状态。
- 收藏不自动生成标签。

展示与操作：

- 列表卡片显示收藏图标，并可直接收藏 / 取消收藏。
- 详情页顶部显示收藏图标，并可直接收藏 / 取消收藏。
- 列表搜索工具栏提供独立收藏筛选开关，可与阅读状态、搜索、标签、来源、类型叠加。
- MVP5 不新增收藏统计。

### 5.3 高亮与批注

高亮和批注统一作为 `Annotation`。

一条 `Annotation` 表示：

- 一段正文高亮。
- 可选的一条批注。

创建方式：

1. 用户在文章详情页 Markdown 正文中选中文字。
2. 页面出现小浮层。
3. 点击“高亮”时直接创建高亮。
4. 点击“批注”时打开小弹窗，填写批注后创建。
5. 创建成功后正文立即回显高亮，右侧批注列表同步出现。

适用范围：

- 只支持文档详情页 Markdown 正文。
- 不支持标题、元信息、标签区、AI 摘要、AI 问答历史高亮。
- `article` 和 `fragment` 都支持高亮与批注。
- 未来 PDF / video / audio 等类型真正实现正文阅读后再决定是否支持。

样式：

- MVP5 只做单色高亮。
- 高亮样式保持低调，不使用夸张颜色。
- 视觉上继续沿用 Lumi 黑白灰、安静阅读产品风格。

编辑规则：

- 可以编辑批注内容。
- 不允许编辑高亮原文。
- 选错文本时删除后重新创建。
- 删除高亮会同时删除绑定批注。

长度限制：

- 高亮选中文本最大 `2000` 字符。
- 批注内容最大 `1000` 字符。
- 前端提示，后端最终校验。

重叠规则：

- 不允许重叠高亮。
- 前端先做即时检测。
- 后端做最终校验。
- 发生重叠时返回或提示“该区域已有高亮”。

跨段落规则：

- 允许跨段落选择。
- 如果渲染时无法重新定位，仍在批注列表中保留记录。

回收站和归档规则：

- 归档文章仍可创建、编辑、删除高亮批注。
- 回收站文章只读：
  - 可以查看正文。
  - 可以查看已有高亮批注。
  - 不允许新增、编辑、删除高亮批注。
  - 恢复后才允许继续编辑。

AI 关系：

- MVP5 高亮和批注暂不参与 AI 分析。
- 当前文章问答仍只基于 MVP4 的文章正文、摘要卡片和依据片段逻辑。

### 5.4 高亮定位

MVP5 使用文本引用定位为主，辅助偏移量为辅。

前端从用户选区生成：

- `selectedText`：选中的原文。
- `prefix`：选区前方少量上下文。
- `suffix`：选区后方少量上下文。
- `occurrenceIndex`：同一文本在正文中的出现序号或匹配信息。
- `startOffset`：选区在正文纯文本中的起始偏移量。
- `endOffset`：选区在正文纯文本中的结束偏移量。

使用规则：

- `selectedText / prefix / suffix / occurrenceIndex` 用于正文渲染时重新匹配高亮。
- `startOffset / endOffset` 用于后端重叠校验和批注列表排序。
- 渲染回填不把偏移量作为唯一依据。
- 如果文本引用匹配失败，批注列表中仍展示该条记录，并提示无法定位。

### 5.5 高亮与批注列表

详情页右侧辅助抽屉新增 `批注` Tab。

规则：

- 详情页右侧辅助区包含 `AI` 和 `批注` 两个 Tab。
- 点击工具栏 `AI` 按钮时打开抽屉并切换到 `AI` Tab。
- 点击工具栏 `批注` 按钮时打开抽屉并切换到 `批注` Tab。
- `批注` Tab 展示当前文档所有高亮与批注。
- 点击列表项时定位到正文中的对应高亮。
- 无法定位的高亮仍展示在列表中。

排序：

- 默认按原文出现顺序排列。
- 能定位到正文位置的高亮按位置排序。
- 无法定位的高亮放到列表末尾。
- MVP5 不做排序切换。

### 5.6 Web 文件导入

Web 端现有“导入文章”入口保留，但 Dialog 内改为 Tab：

- `URL` Tab：
  - 保持 MVP4 URL 异步导入逻辑。
- `文件` Tab：
  - 上传 `.md` 或 `.txt` 单文件。

支持范围：

- `.md`
- `.txt`

不支持：

- PDF。
- RSS。
- HTML 文件上传。
- 多文件批量上传。

限制：

- 单文件最大 `2MB`。
- 只按 UTF-8 读取。
- 编码读取失败时返回“文件编码暂不支持”。

标题提取：

- Markdown 文件优先取第一个 `# 一级标题`。
- 如果没有一级标题，则使用去掉扩展名的文件名。
- `.txt` 文件使用去掉扩展名的文件名。

正文处理：

- `.md` 正文直接保存为 Markdown。
- `.txt` 转成简单 Markdown。
- 文件导入后的 `Document.type = article`。

重复规则：

- 每次上传都创建新文章。
- 不按文件名去重。
- 不按内容 hash 去重。
- 允许用户保存同一文件的不同版本。

导入任务：

- 文件导入创建 `IngestJob`。
- `IngestJob.type = file`。
- 文件导入由 API Server 立即处理。
- 成功时 `IngestJob.status = succeeded`。
- 失败时 `IngestJob.status = failed` 并记录 `errorMessage`。
- 文件导入不进入导入解析 Worker。

AI 分析：

- 文件导入成功后自动加入 MVP4 AI 分析队列。
- AI Provider 未配置、Redis 不可用或 AI 入队失败时，不影响文件导入成功。
- 详情页 AI 抽屉展示失败或可重试状态。
- 用户可手动重试 AI 分析。

成功行为：

- 上传成功后跳转新文章详情页。

### 5.7 浏览器插件选中内容导入

插件 Popup 新增“保存选中内容”按钮。

用户流程：

1. 用户在当前网页中选中文字。
2. 打开 Lumi 插件 Popup。
3. 点击“保存选中内容”。
4. 插件读取当前 active tab 的主文档选区。
5. 插件提交选区 HTML 和纯文本到后端。
6. 后端创建 `fragment` 文档。
7. Popup 显示保存成功、片段标题，并提供“打开片段”按钮。
8. 用户点击后新开 Web 详情页。

捕获范围：

- 只捕获当前 active tab 主页面中的 `window.getSelection()`。
- 不支持 iframe 内选区。
- 不读取剪贴板。
- 没有选中内容时提示“请先在页面中选中内容”。

提交内容：

- `url`：当前页面 URL。
- `title`：当前页面标题。
- `selectedHtml`：选区 HTML。
- `selectedText`：选区纯文本。

处理规则：

- 后端优先清洗选区 HTML 并转换为 Markdown。
- 如果 HTML 不可用或解析失败，则降级保存纯文本。
- 保留链接、段落、列表、加粗等基础格式。
- 不做图片本地化。

文档规则：

- `Document.type = fragment`。
- 标题格式：`摘录：页面标题`。
- 正文只展示用户选中的内容。
- 来源、原文链接、创建时间放在文档元信息区。
- 不在正文中额外插入“摘录自……”系统文字。

大小限制：

- 选中内容最大 `200KB`。
- 前端提示，后端最终校验。

重复规则：

- 每次保存选区都创建新的 `fragment`。
- 不按 URL + 文本去重。
- 不提示合并或覆盖。

导入任务：

- 选中内容导入创建 `IngestJob`。
- `IngestJob.type = selection`。
- API Server 立即处理。
- 成功时 `IngestJob.status = succeeded`。
- 失败时 `IngestJob.status = failed` 并记录 `errorMessage`。
- 不进入导入解析 Worker。

AI 分析：

- 选中内容导入后不自动触发 AI 分析。
- 详情页中仍可手动打开 AI 抽屉并触发分析或当前文章问答。
- 复用 MVP4 AI 分析重试接口：
  - 没有分析记录时创建分析任务。
  - 失败记录时重试。
  - 成功记录时重新生成。

### 5.8 Shiki 代码高亮

Markdown 阅读器增加 Shiki 基础代码高亮。

范围：

- 仅处理 fenced code block：

````txt
```ts
const a = 1
```
````

- 不处理普通 inline code。
- 不做行号。
- 不做复制按钮。
- 不做主题切换。

主题：

- 固定浅色主题。
- 建议使用 `github-light`，或与 Lumi 黑白灰风格接近的浅色主题。

降级：

- Shiki 加载失败时，仍显示普通 `<pre><code>`。
- Shiki 渲染失败时，不影响 Markdown 正文展示。

## 6. 数据设计

### 6.1 Document

MVP5 给 `Document` 增加阅读状态和收藏字段。

新增字段：

```prisma
readingStatus DocumentReadingStatus @default(unread)
favoritedAt   DateTime?
```

新增枚举：

```prisma
enum DocumentReadingStatus {
  unread
  read
}
```

说明：

- `readingStatus` 表示阅读进度。
- `favoritedAt = null` 表示未收藏。
- `favoritedAt != null` 表示已收藏。
- 已有文章迁移后 `readingStatus = unread`，`favoritedAt = null`。

列表和详情 DTO 需要返回：

- `readingStatus`
- `favoritedAt`
- 可选派生字段 `isFavorite`

### 6.2 Annotation

新增模型：

```prisma
model Annotation {
  id              String   @id @default(cuid())
  selectedText    String
  note            String?
  prefix          String?
  suffix          String?
  occurrenceIndex Int      @default(0)
  startOffset     Int
  endOffset       Int
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId     String
  user       User     @relation(fields: [userId], references: [id])

  @@index([documentId, startOffset])
  @@index([userId])
}
```

说明：

- 一条 `Annotation` 代表一段高亮和可选批注。
- `selectedText` 最大 `2000` 字符。
- `note` 最大 `1000` 字符。
- `startOffset / endOffset` 用于排序和重叠校验。
- `prefix / suffix / occurrenceIndex` 用于前端重新定位。
- 删除文档时级联删除 Annotation。
- 回收站文章不删除 Annotation，只限制编辑。

## 7. API 设计

### 7.0 列表筛选

`GET /api/documents` 在 MVP3 筛选参数基础上新增：

```txt
readingStatus=unread|read
favorite=true
```

规则：

- `readingStatus` 只接受 `unread` 和 `read`，非法值忽略。
- `favorite=true` 表示只返回已收藏文章。
- 阅读状态筛选和收藏筛选可与 `keyword`、`status`、`type`、`tag`、`source`、`sort` 叠加。
- 筛选结果仍遵守当前 `status=active|archived|trash` 视图范围。

### 7.1 阅读状态

新增：

```txt
PATCH /api/documents/:id/reading-status
```

请求：

```json
{
  "readingStatus": "read"
}
```

可选值：

```txt
unread
read
```

规则：

- 只能修改当前用户自己的文档。
- 活跃文章和归档文章可修改。
- 回收站文章不可修改。
- 修改成功后返回更新后的文档摘要或详情。

### 7.2 收藏

新增：

```txt
PATCH /api/documents/:id/favorite
```

请求：

```json
{
  "favorite": true
}
```

规则：

- `favorite = true` 时写入 `favoritedAt = now()`。
- `favorite = false` 时写入 `favoritedAt = null`。
- 只能修改当前用户自己的文档。
- 活跃文章和归档文章可修改。
- 回收站文章不可修改。

### 7.3 高亮与批注

新增：

```txt
GET    /api/documents/:id/annotations
POST   /api/documents/:id/annotations
PATCH  /api/documents/:id/annotations/:annotationId
DELETE /api/documents/:id/annotations/:annotationId
```

#### 查询

`GET /api/documents/:id/annotations`

返回当前文档的高亮与批注列表。

排序：

- 按 `startOffset asc`。
- 无法定位或异常数据放在末尾的处理可由前端兜底。

#### 创建

`POST /api/documents/:id/annotations`

请求：

```json
{
  "selectedText": "选中的原文",
  "note": "可选批注",
  "prefix": "前文上下文",
  "suffix": "后文上下文",
  "occurrenceIndex": 0,
  "startOffset": 120,
  "endOffset": 168
}
```

规则：

- `selectedText` 必填。
- `selectedText` 最大 `2000` 字符。
- `note` 可选，最大 `1000` 字符。
- `startOffset < endOffset`。
- 不允许和同文档已有 Annotation 重叠。
- 活跃文章和归档文章可创建。
- 回收站文章不可创建。

#### 编辑批注

`PATCH /api/documents/:id/annotations/:annotationId`

请求：

```json
{
  "note": "新的批注内容"
}
```

规则：

- 只允许编辑 `note`。
- 不允许编辑 `selectedText`、定位信息和偏移量。
- 回收站文章不可编辑。

#### 删除

`DELETE /api/documents/:id/annotations/:annotationId`

规则：

- 删除整条高亮和批注。
- 回收站文章不可删除。

### 7.4 文件导入

新增：

```txt
POST /api/ingest/file
```

请求：

```txt
multipart/form-data
file: .md 或 .txt
```

限制：

- 单文件最大 `2MB`。
- 只允许 `.md` 和 `.txt`。
- 按 UTF-8 读取。

响应 data：

```json
{
  "document": {},
  "job": {}
}
```

处理：

- API Server 直接读取文件并创建完整 Document。
- 创建 `IngestJob(type=file)`。
- 成功后 `job.status = succeeded`。
- 创建文档后尝试加入 AI 分析队列。
- AI 入队失败不影响接口成功返回。

错误文案建议：

- `仅支持 .md 和 .txt 文件`
- `文件内容过大，暂不支持保存`
- `文件编码暂不支持`

### 7.5 选中内容导入

新增：

```txt
POST /api/ingest/selection
```

请求：

```json
{
  "url": "https://example.com/article",
  "title": "页面标题",
  "selectedHtml": "<p>选中的内容</p>",
  "selectedText": "选中的内容"
}
```

限制：

- `url` 必填，必须是 http 或 https。
- `selectedHtml` 和 `selectedText` 至少一个有内容。
- 选中内容最大 `200KB`。

响应 data：

```json
{
  "document": {},
  "job": {}
}
```

处理：

- 创建 `IngestJob(type=selection)`。
- 创建 `Document(type=fragment)`。
- 标题为 `摘录：页面标题`。
- 优先将 `selectedHtml` 清洗并转换为 Markdown。
- 失败时降级使用 `selectedText`。
- 不自动触发 AI 分析。

错误文案建议：

- `请先在页面中选中内容`
- `选中内容过大，暂不支持保存`
- `选中内容保存失败`

### 7.6 AI 分析接口语义补充

MVP4 已有：

```txt
POST /api/documents/:id/ai-analysis/retry
```

MVP5 补充语义：

- 当文档没有 AI 分析记录时，该接口允许创建一次分析任务。
- 当分析失败时，该接口作为重试入口。
- 当分析成功时，该接口作为重新生成入口。
- `article` 和 `fragment` 都可使用该接口。

## 8. Shared DTO 与 API Client

### 8.1 Shared

`packages/shared` 新增或扩展：

- `DocumentReadingStatus`
- `AnnotationDto`
- `CreateAnnotationRequest`
- `UpdateAnnotationRequest`
- `UpdateReadingStatusRequest`
- `UpdateFavoriteRequest`
- `IngestFileResponse`
- `IngestSelectionRequest`
- `IngestSelectionResponse`

文档 DTO 需要增加：

- `readingStatus`
- `favoritedAt`

### 8.2 API Client

`packages/api-client` 新增：

```ts
client.documents.updateReadingStatus(id, payload)
client.documents.updateFavorite(id, payload)
client.documents.listAnnotations(id)
client.documents.createAnnotation(id, payload)
client.documents.updateAnnotation(id, annotationId, payload)
client.documents.deleteAnnotation(id, annotationId)
client.ingest.file(formData)
client.ingest.selection(payload)
```

说明：

- 文件上传使用 `multipart/form-data`。
- 插件选中内容导入使用 JSON。

## 9. 后端模块规划

### 9.1 DocumentsModule

扩展：

- 更新阅读状态。
- 更新收藏状态。
- 列表和详情返回新增字段。
- 回收站文档限制修改阅读沉淀字段。

### 9.2 AnnotationsModule 或 Documents 子服务

可以新增独立模块：

```txt
apps/server/src/annotations
```

职责：

- 查询文档 Annotation。
- 创建 Annotation。
- 校验重叠。
- 编辑批注。
- 删除 Annotation。

也可以先作为 `DocumentsModule` 下的子服务实现，但文件结构建议独立，避免 DocumentsService 过大。

### 9.3 IngestModule

新增：

- `POST /api/ingest/file`
- `POST /api/ingest/selection`

处理：

- 文件导入由 API Server 立即创建完整文章。
- 选中内容导入由 API Server 立即创建片段。
- 两者都记录 `IngestJob`。
- 文件导入成功后尝试调用 AI 分析入队逻辑。

### 9.4 Parser 包

`@lumi/parser` 可新增或复用工具：

- 清洗片段 HTML。
- 将片段 HTML 转 Markdown。
- 纯文本转简单 Markdown。
- 从 Markdown 提取一级标题。

### 9.5 AI Analysis

扩展：

- `retry` 接口在无分析记录时可创建任务。
- 文件导入成功后可复用现有入队服务。
- AI 入队失败时创建或更新失败状态，或在详情页允许手动重试。

## 10. Web 端设计

### 10.1 列表页

文章卡片新增：

- 阅读状态展示。
- 收藏 / 取消收藏按钮。
- 搜索工具栏提供 `全部 / 未读 / 已读` 筛选。
- 搜索工具栏提供收藏筛选按钮。

规则：

- 不新增统计。
- 阅读状态筛选和收藏筛选可以叠加。
- 收藏状态只通过卡片右上角星标按钮展示，不在卡片底部重复显示“已收藏”标签。
- 视觉保持克制，避免把卡片做成复杂操作面板。

### 10.2 导入 Dialog

现有导入入口调整为 Tabs：

- `URL`
- `文件`

`URL` Tab：

- 保持现有 URL 导入体验。
- 仍创建异步导入任务。

`文件` Tab：

- 文件选择器。
- 只允许选择 `.md` / `.txt`。
- 显示大小限制。
- 上传时按钮 loading。
- 成功后跳转详情页。
- 失败时 toast 提示。

### 10.3 详情页顶部

新增：

- 收藏按钮。
- 批注按钮。

行为：

- 详情页加载到 `unread` 文档后，前端调用阅读状态接口改为 `read`。
- 点击批注按钮打开右侧辅助抽屉并切到 `批注` Tab。
- 点击 AI 按钮打开同一个辅助抽屉并切到 `AI` Tab。

### 10.4 Markdown 阅读器

新增能力：

- Shiki fenced code block 高亮。
- 正文高亮回填。
- 选中文字后显示高亮/批注浮层。

实现建议：

- Markdown 渲染仍先经过安全净化。
- 高亮回填只作用于 Markdown 正文区域。
- 高亮定位失败时不破坏正文渲染。
- 代码块高亮失败时降级普通代码块。

### 10.5 右侧辅助抽屉

MVP4 AI 抽屉调整为通用辅助抽屉：

- Tab：`AI`
- Tab：`批注`

`AI` Tab：

- 保留 MVP4 AI 分析和当前文章问答。

`批注` Tab：

- 显示高亮和批注列表。
- 按原文顺序展示。
- 点击定位正文高亮。
- 支持编辑批注。
- 支持删除高亮。
- 回收站文章中只读展示。

## 11. Extension 设计

### 11.1 Popup

新增按钮：

- 保存选中内容。

展示：

- 未登录时提示登录。
- 没有选中内容时提示“请先在页面中选中内容”。
- 保存中显示 loading。
- 保存成功显示片段标题。
- 保存成功后展示“打开片段”按钮。

### 11.2 Capture 工具

扩展：

```txt
captureSelection()
```

职责：

- 在当前 active tab 主页面执行脚本。
- 使用 `window.getSelection()` 获取选区。
- 生成 `selectedText`。
- 尽量生成 `selectedHtml`。
- 返回当前页面标题和 URL。

不做：

- iframe 选区。
- 剪贴板读取。
- 页面后台自动抓取。
- 右键菜单。

### 11.3 API 调用

新增：

```ts
client.ingest.selection({
  url,
  title,
  selectedHtml,
  selectedText,
})
```

成功后按现有插件逻辑打开 Web 详情页。

## 12. 实现步骤

建议按以下顺序实现：

1. 编写 MVP5 方案文档。
2. 更新 Prisma schema：
   - `Document.readingStatus`
   - `Document.favoritedAt`
   - `Annotation`
   - `DocumentReadingStatus`
3. 执行 Prisma migration。
4. 扩展 `packages/shared` DTO。
5. 扩展 `packages/api-client`。
6. 后端 DocumentsModule 增加阅读状态和收藏接口。
7. 后端增加 Annotation 查询、创建、编辑、删除能力。
8. 后端实现 Annotation 重叠校验。
9. 后端 IngestModule 增加文件导入接口。
10. 后端 IngestModule 增加选中内容导入接口。
11. 扩展 parser 工具：
    - Markdown 标题提取。
    - 文本转 Markdown。
    - 片段 HTML 清洗转 Markdown。
12. 文件导入成功后接入 AI 分析入队。
13. 补充 AI 分析 retry 接口无记录时创建任务的语义。
14. Web 列表卡片增加阅读状态展示和收藏操作。
15. Web 列表搜索工具栏增加阅读状态和收藏筛选。
16. Web 导入 Dialog 改为 URL / 文件 Tabs。
17. Web 详情页顶部增加收藏、批注按钮，正文头部展示阅读状态。
18. Web 详情页加载时实现 `unread -> read` 前端触发。
19. Web Markdown 阅读器接入 Shiki 基础代码高亮。
20. Web Markdown 阅读器实现选区浮层。
21. Web Markdown 阅读器实现高亮回填。
22. Web 辅助抽屉改为 AI / 批注 Tabs。
23. Web 批注列表实现定位、编辑、删除。
24. Extension capture 工具增加 `captureSelection()`。
25. Extension Popup 增加“保存选中内容”入口。
26. Extension 接入 `POST /api/ingest/selection`。
27. 更新 README 和 AGENTS 中 MVP5 相关说明。
28. 运行构建：
    - `pnpm build:server`
    - `pnpm build:web`
    - `pnpm build:extension`
29. 手动验收 MVP5。

## 13. 验收标准

MVP5 完成后需要满足：

- 已有文章迁移后默认 `readingStatus = unread`。
- 已有文章迁移后默认未收藏。
- 新导入 URL / HTML / 文件 / 选中内容文档默认 `unread`。
- 列表卡片能展示阅读状态。
- 列表卡片不提供手动阅读状态切换。
- 列表卡片能收藏和取消收藏。
- 列表搜索工具栏可以按全部 / 未读 / 已读筛选。
- 列表搜索工具栏可以只看收藏文章。
- 阅读状态筛选和收藏筛选可以叠加。
- 列表卡片底部不重复显示“已收藏”标签。
- 详情页正文头部能展示阅读状态。
- 详情页顶部能收藏和取消收藏。
- 首次打开 `unread` 文档详情页后，前端自动将其改为 `read`。
- 已读文档再次打开不会产生阅读状态写入。
- 归档文章可编辑收藏、高亮和批注，未读归档文章打开后自动标记已读。
- 回收站文章只读，不可编辑收藏、高亮和批注，不触发阅读状态写入。
- 用户可以在 Markdown 正文中选中文字并创建高亮。
- 用户可以在 Markdown 正文中选中文字并创建带批注的高亮。
- 高亮能在正文内回显。
- 高亮和批注能在右侧 `批注` Tab 中集中展示。
- 点击批注列表项能定位到正文高亮。
- 无法定位的高亮仍保留在列表中。
- 用户可以编辑批注内容。
- 用户可以删除高亮和批注。
- 不允许创建重叠高亮。
- 高亮选中文本超过 `2000` 字符时被拒绝。
- 批注超过 `1000` 字符时被拒绝。
- Web 导入 Dialog 包含 `URL` 和 `文件` Tab。
- `.md` 文件可以上传并创建 `article`。
- `.txt` 文件可以上传并创建 `article`。
- `.md` 标题优先取第一个一级标题。
- 无一级标题时使用文件名作为标题。
- 文件超过 `2MB` 时返回错误。
- 非 `.md/.txt` 文件上传被拒绝。
- 文件编码不是 UTF-8 时返回明确错误。
- 文件导入每次上传都创建新文章，不去重。
- 文件导入会创建 `IngestJob(type=file)`。
- 文件导入成功后尝试触发 AI 分析。
- AI 入队失败不影响文件导入成功。
- 插件 Popup 可以保存当前主页面选中内容。
- 没有选区时插件提示“请先在页面中选中内容”。
- 插件选中内容导入会创建 `Document(type=fragment)`。
- 片段标题为 `摘录：页面标题`。
- 片段正文只包含选中内容。
- 选中内容导入创建 `IngestJob(type=selection)`。
- 选中内容导入不自动触发 AI 分析。
- 选中内容超过 `200KB` 时被拒绝。
- 选中内容每次保存都创建新片段，不去重。
- Shiki 能高亮 Markdown fenced code block。
- Shiki 加载失败时 Markdown 正文仍能正常渲染。
- `pnpm build:server` 通过。
- `pnpm build:web` 通过。
- `pnpm build:extension` 通过。

## 14. 风险与处理

### 14.1 高亮定位失败

风险：

- Markdown 渲染后的文本结构和保存时的纯文本结构不完全一致。
- 正文重新解析或更新后，原高亮位置可能无法匹配。

处理：

- 保存 `selectedText + prefix + suffix + occurrenceIndex`。
- 同时保存 `startOffset / endOffset` 作为辅助信息。
- 渲染时匹配失败不丢数据。
- 批注列表仍展示，并提示无法定位。

### 14.2 重叠高亮导致渲染复杂

风险：

- 多条高亮交叉或嵌套会让正文渲染和点击定位复杂化。

处理：

- MVP5 不允许重叠高亮。
- 前端先做即时检测。
- 后端做最终校验。

### 14.3 文件导入与 AI 入队耦合

风险：

- Redis 未启动或 AI Provider 未配置时，如果强依赖 AI 入队，会导致文件无法保存。

处理：

- 文件创建成功即视为导入成功。
- AI 入队失败不阻塞导入。
- 详情页 AI 抽屉提供失败状态和重试入口。

### 14.4 插件选区 HTML 不稳定

风险：

- 不同网页的选区 HTML 结构复杂。
- 选区可能包含无效标签、脚本或外部样式。

处理：

- 后端清洗 HTML。
- 只保留基础格式。
- 解析失败时降级使用纯文本。
- 不做图片本地化。

### 14.5 阅读状态和归档语义混淆

风险：

- 用户可能把归档理解为已读或收藏。

处理：

- 产品语义中明确：
  - 归档是列表收纳。
  - 阅读状态是进度。
  - 收藏是重要性。
- MVP5 不改变归档行为。

### 14.6 Shiki 增加 Markdown 渲染复杂度

风险：

- Shiki 包体和异步加载可能影响阅读页渲染。

处理：

- 只做基础 fenced code block 高亮。
- 使用固定浅色主题。
- 渲染失败降级普通代码块。
- 不做行号、复制按钮和主题切换。

## 15. 后续扩展

MVP5 完成后，后续版本可以继续扩展：

- 收藏页。
- 阅读统计页。
- 我的高亮 / 我的批注汇总页。
- 单篇 Markdown 导出。
- 高亮和批注导出。
- 多色高亮。
- 高亮标签。
- 批注参与当前文章问答。
- AI 根据用户高亮和批注生成阅读笔记。
- 插件右键菜单保存选中内容。
- PDF 导入。
- RSS 导入。
- CLI 导入。
- 图片本地化存储。
- 批量文件导入。
- Shiki 代码块复制按钮。
- Shiki 行号。
- 跨文章知识库问答。
- `pgvector` 语义搜索。
