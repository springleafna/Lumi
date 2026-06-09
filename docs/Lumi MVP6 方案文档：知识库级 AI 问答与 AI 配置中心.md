# Lumi MVP6 方案文档：知识库级 AI 问答与 AI 配置中心

## 1. 背景

MVP0 已完成 Lumi 的 Monorepo 工程结构搭建；MVP1 打通 Web 端 URL 导入、解析、保存和阅读闭环；MVP2 补全浏览器插件 URL/HTML 导入能力；MVP3 增强文章管理、筛选、归档、回收站和阅读体验；MVP4 建立 Redis + BullMQ 异步任务体系，并加入单篇文章 AI 分析与当前文章问答；MVP5 完成阅读沉淀能力，加入未读/已读、收藏、高亮批注、文件导入、选中内容导入和代码高亮。

MVP6 开始把 Lumi 从“单篇文章阅读助手”推进到“知识库级 AI 助手”：

- 让用户可以对自己的知识库进行跨文章问答。
- 使用 Embedding + `pgvector` 对新导入内容建立语义索引。
- 在回答中展示可追溯的引用来源。
- 新增 Web AI 设置页，用数据库配置接管所有 AI 能力。
- 新增索引任务管理能力，便于排查新文档未进入知识库问答的问题。

MVP6 不追求一次性补齐历史文章索引，也不做批量重新分析。目标是先把新文档自动索引、知识库问答、AI 配置中心和索引任务管理这条主链路做稳。

## 2. MVP6 目标

MVP6 聚焦知识库级 AI 问答与 AI 配置中心：

- 新增全局 AI 设置页：
  - 配置 Chat Provider。
  - 配置 Embedding Provider。
  - API Key 服务端加密保存。
  - Chat 和 Embedding 分开测试连接。
  - Web 设置接管 MVP4 单篇 AI 和 MVP6 知识库问答。
- 新增知识库向量索引：
  - 新文档正文可用后自动创建索引任务。
  - `article` 和 `fragment` 都进入索引。
  - 只索引正文片段。
  - 使用 `pgvector` 存储 Embedding。
  - MVP6 只索引新文档，不自动补齐已有文章。
- 新增索引任务管理：
  - 设置页内提供“索引任务”Tab。
  - 支持状态筛选和文档标题搜索。
  - 失败任务可单条重试。
- 新增知识库问答页面：
  - 独立主页面。
  - 左侧会话列表，右侧当前会话。
  - 支持多轮问答。
  - 每次提问重新检索知识库，并带上会话上下文。
  - 回答流式输出。
  - 支持停止生成。
  - 回答中使用 `[1] [2]` 编号引用。
  - 回答完成后展示来源卡片。
- 新增知识库问答历史：
  - 会话按用户隔离。
  - 支持重命名和软删除会话。
  - 首轮问答完成后尝试用 AI 自动生成标题。
  - 标题生成失败时显示“新的问答”。

## 3. 非目标

MVP6 暂不包含以下能力：

- 历史文章自动补齐向量索引。
- 批量重新生成单篇 AI 分析。
- 批量重建向量索引。
- 批量重试失败索引任务。
- 独立语义搜索入口。
- 文章列表搜索升级为语义搜索。
- 关键词 + 语义混合检索。
- HNSW / IVFFlat 向量索引优化。
- 多套 AI 配置管理。
- 按能力拆分多套 Chat 模型配置。
- 模型参数配置，例如 temperature、max tokens、召回数量。
- Web 设置页配置 Redis、数据库、对象存储等基础运行配置。
- 管理员角色和权限模型。
- 共享知识库或团队协作问答。
- 会话归档、会话恢复、会话分享。
- 知识库问答引用用户高亮和批注。
- 将 AI 分析结果向量化。
- PDF / RSS / 视频 / 音频导入。
- Embedding 配置变更后的自动索引补偿。
- 从 `.env` 自动导入 AI Provider 配置。
- `.env` AI Provider fallback。

## 4. 产品语义

### 4.1 知识库问答范围

MVP6 的知识库问答范围为：

- 当前登录用户自己的文档。
- 文档状态包含：
  - 活跃文章。
  - 归档文章。
- 文档状态不包含：
  - 回收站文章。
- 文档类型包含：
  - `article`。
  - `fragment`。

归档文章仍然属于知识库，只是从默认列表中收纳起来，因此可以参与知识库问答。回收站文章表示用户已经移出知识库，不参与问答。

### 4.2 AI 配置中心

MVP6 后，所有 AI 能力优先且仅使用 Web 设置页保存的数据库配置：

- MVP4 单篇文章 AI 分析。
- MVP4 当前文章问答。
- MVP6 知识库问答。
- MVP6 Embedding 索引。

MVP6 不再使用 `.env` 中的 AI Provider 配置作为 fallback。`.env` 仍保留数据库、Redis、加密密钥等基础运行配置。

未配置 Web AI 设置时，AI 相关页面和操作统一提示：

```txt
请先配置 AI
```

并提供跳转设置页入口。

### 4.3 Chat 与 Embedding 分离

Chat Provider 和 Embedding Provider 分开配置：

- Chat Provider：
  - 用于单篇 AI 分析。
  - 用于当前文章问答。
  - 用于知识库问答回答生成。
  - 用于知识库问答会话标题生成。
- Embedding Provider：
  - 用于新文档正文切片向量化。
  - 用于知识库问答召回相关片段。

两者都采用 OpenAI-Compatible 风格字段：

- `baseUrl`
- `apiKey`
- `model`

### 4.4 向量索引语义

MVP6 只自动索引 MVP6 上线后正文可用的新文档。

不自动处理：

- MVP6 之前已有但未索引的文章。
- Embedding 配置变更后旧配置生成的索引。
- 之前因配置缺失失败的索引任务。

每条向量记录保存当前 Embedding 配置的指纹。知识库问答只使用当前 Embedding 配置生成的向量，避免不同模型或不同维度的向量空间混用。

### 4.5 与阅读状态、收藏、归档的关系

MVP6 不改变 MVP5 的阅读状态和收藏语义：

- 未读 / 已读只表示阅读状态。
- 收藏只表示重要程度。
- 归档只表示从默认列表收纳。

知识库问答：

- 不受未读 / 已读影响。
- 不受收藏状态影响。
- 包含归档文章。
- 排除回收站文章。

来源卡片引用归档文章时，需要轻量标识“已归档”。

## 5. 产品范围

### 5.1 设置页

Web 端新增独立“设置”页面。

MVP6 设置页先包含两个 Tab：

- `AI 设置`
- `索引任务`

后续账户、导入、插件、存储等设置可以继续放入同一设置页，不在 MVP6 拆出多个主导航入口。

### 5.2 AI 设置 Tab

AI 设置 Tab 包含：

- Chat Provider 配置区。
- Embedding Provider 配置区。

Chat Provider 预设：

- DeepSeek。
- SiliconFlow。
- OpenAI-Compatible 自定义。

Embedding Provider 预设：

- SiliconFlow。
- OpenAI-Compatible 自定义。

预设只用于快速填充默认 `baseUrl` 和推荐模型输入提示。数据库仍保存当前启用的一套 Chat 配置和一套 Embedding 配置，不保存多套 Provider 方案。

### 5.3 AI 设置字段

Chat 配置字段：

- Provider 预设。
- Base URL。
- Model。
- API Key。
- 最近测试状态。
- 最近测试时间。
- 最近测试错误。

Embedding 配置字段：

- Provider 预设。
- Base URL。
- Model。
- API Key。
- 最近测试状态。
- 最近测试时间。
- 最近测试错误。

MVP6 不开放以下参数：

- temperature。
- max tokens。
- 上下文窗口大小。
- 知识库问答召回数量。
- Embedding batch size。
- 高级请求参数。

### 5.4 API Key 编辑规则

API Key 不回显明文。

页面展示规则：

- 已配置时显示“已配置”。
- 未配置时显示“未配置”。
- 输入框为空并保存时，保留现有密钥。
- 输入新值并保存时，加密替换现有密钥。

支持分别清除：

- Chat 配置。
- Embedding 配置。

清除前需要确认。清除后对应能力显示“请先配置 AI”。

### 5.5 API Key 加密

API Key 必须由服务端加密后保存到数据库。

加密密钥来自 `.env`，建议新增：

```env
AI_CONFIG_ENCRYPTION_KEY=""
```

规则：

- 服务端启动时即使缺少加密密钥也允许启动。
- 缺少加密密钥时，AI 设置页提示必须配置加密密钥后才能保存 API Key。
- 缺少加密密钥时，不允许明文保存 API Key。
- 前端永远不接收 API Key 明文。

### 5.6 测试连接

AI 设置页支持分别测试：

- Chat Provider。
- Embedding Provider。

规则：

- 保存配置后可点击测试。
- 测试成功记录最近测试时间和状态。
- 测试失败记录简短错误。
- 测试连接只是辅助诊断，不作为配置是否生效的强制条件。
- 保存即生效。

### 5.7 未配置 AI 时的体验

未配置 Chat 时：

- 单篇 AI 分析入口显示“请先配置 AI”。
- 当前文章问答显示“请先配置 AI”。
- 知识库问答页面显示“请先配置 AI”。
- 新导入 `article` 不创建单篇 AI 分析失败记录。

未配置 Embedding 时：

- 新文档正文可用后仍创建索引任务。
- 索引任务标记为 `failed`。
- 错误提示为“Embedding 未配置”或“Embedding 不可用”。
- 文档保存、导入、阅读不受影响。
- 保存新的 Embedding 配置后，不自动重试旧失败任务。
- 用户可在索引任务 Tab 单条重试。

### 5.8 单篇 AI 自动分析规则

MVP6 保留 MVP4 的单篇 AI 自动分析体验，但前提是 Chat 配置已完成。

自动分析规则：

- `article` 自动分析。
- `fragment` 不自动分析。
- Chat 未配置时，不创建失败分析记录。
- Chat 配置完成后，新导入 `article` 解析成功时自动进入 AI 分析队列。

### 5.9 向量索引触发规则

所有新文档正文可用后自动触发索引任务：

- URL 导入解析成功。
- 插件 HTML 导入解析成功。
- Web 文件导入成功。
- 插件选中内容导入成功。
- 导入失败后重试并解析成功。
- 未来正文更新成功后。

进入索引的文档类型：

- `article`
- `fragment`

不进入索引：

- 回收站文章。
- 没有正文的占位文章。
- 解析失败文章。

### 5.10 向量化内容范围

MVP6 只向量化正文片段。

不向量化：

- 标题。
- 来源。
- 标签。
- 摘要。
- AI 分析结果。
- 高亮。
- 批注。
- 问答历史。

标题、来源、标签等只作为引用展示和筛选元信息，不混入 Embedding 文本。

### 5.11 正文切片策略

MVP6 使用：

```txt
段落优先 + 固定长度切片 + 少量重叠
```

建议规则：

- 每个 chunk 约 `800-1200` 中文字符。
- chunk 之间保留 `100-200` 字符重叠。
- 尽量不切断段落。
- 超长段落允许按固定长度切分。
- 保存 `startOffset` 和 `endOffset`，用于来源定位。

### 5.12 Embedding 批量调用

一个文档切片后，尽量按文档维度批量调用 Embedding 接口。

规则：

- 同一篇文档的多个 chunk 尽量一次或分批提交。
- 失败时整篇索引任务失败。
- 单条重试时重新切片并按当前配置重建。
- 不做跨文档全局聚合批量调用。

### 5.13 重复索引与重建

同一篇文档重复触发索引时：

- 按当前 Embedding 配置重建该文档索引。
- 历史配置生成的向量保留，但不参与当前检索。
- 当前配置下已有旧索引时，先生成新 Embedding。
- 新 Embedding 全部成功后，再替换当前配置下的旧索引。
- 如果重建失败，保留旧索引，避免文章突然从知识库问答中消失。

### 5.14 Embedding 配置变更

Embedding 配置变更后：

- 旧索引保留。
- 旧索引不参与当前知识库问答检索。
- 新文档和重试任务使用当前配置生成新索引。
- 不自动重建旧文档索引。
- 不自动重试旧失败任务。

每条向量记录保存：

- Provider。
- Model。
- Dimension。
- Config fingerprint。

### 5.15 索引任务 Tab

设置页内新增“索引任务”Tab。

展示字段：

- 文档标题。
- 文档类型。
- 索引状态。
- Provider。
- Model。
- Dimension。
- Chunk 数量。
- 错误信息。
- 创建时间。
- 更新时间。
- 完成时间。

筛选：

- 状态筛选：
  - 全部。
  - 待处理。
  - 处理中。
  - 成功。
  - 失败。
- 关键词搜索：
  - 按文档标题搜索。

操作：

- 失败任务支持单条重试。

不支持：

- 批量重试。
- 批量重建。
- 手动创建索引任务。
- 删除索引任务。

### 5.16 文档详情页索引状态

文档详情页轻量展示知识库索引状态：

- 待处理。
- 处理中。
- 已完成。
- 失败。
- 未配置。
- 不适用。

详情页只展示状态和跳转入口。

规则：

- 点击入口跳转到设置页的“索引任务”Tab。
- 失败重试只在索引任务 Tab 中处理。
- 详情页不提供直接重试按钮。

### 5.17 知识库问答页面

Web 端新增独立“知识库问答”页面。

页面布局：

- 左侧会话列表。
- 右侧当前会话。

左侧会话列表：

- 新建会话。
- 展示历史会话。
- 支持重命名。
- 支持删除。
- 删除为软删除。

右侧当前会话：

- 展示多轮问答。
- 底部输入问题。
- 回答流式输出。
- 支持停止生成。
- 失败回答支持重新生成。

### 5.18 会话创建和标题

新建会话规则：

- 用户点击“新建会话”后，前端创建一个临时空会话。
- 临时空会话不立即写入数据库。
- 用户提交首个问题时，后端创建真实会话。

标题规则：

- 新会话默认标题为“新的问答”。
- 首轮问题和回答完成后，使用 Chat Provider 自动生成会话标题。
- 标题生成失败时保留“新的问答”。
- 用户可以手动重命名。

### 5.19 会话历史

会话历史按用户隔离：

- 谁创建谁可见。
- 只检索当前用户自己的会话。
- 删除会话使用软删除。
- MVP6 不做已删除会话恢复入口。

### 5.20 检索策略

知识库问答每次提问都重新检索知识库。

检索规则：

- 当前登录用户自己的文档。
- 活跃文章 + 归档文章。
- 不含回收站文章。
- `article` + `fragment`。
- 只使用当前 Embedding 配置对应的向量。
- 默认召回 8 个 chunk。
- 每篇文章最多取 2 个 chunk。
- 使用 pgvector 精确相似度查询。
- MVP6 不做 HNSW / IVFFlat。
- MVP6 不混合关键词检索。

多轮规则：

- 每次提问都重新检索。
- Prompt 中带上当前会话上下文摘要或最近若干轮上下文。
- 不只局限于上一轮引用来源。

### 5.21 回答生成规则

回答规则：

- 默认使用中文回答。
- 引用片段保留原文。
- 回答必须基于召回片段。
- 不得使用模型自由发挥补充知识库外内容。
- 如果知识库中没有足够依据，需要明确说明：

```txt
知识库中没有足够依据回答这个问题。
```

上下文控制：

- 只把召回的 8 个片段压入 Prompt。
- 超长片段截断。
- MVP6 不做片段压缩链路。
- MVP6 不根据模型上下文窗口动态调整召回数量。

### 5.22 引用展示

回答正文使用编号引用：

```txt
这篇文章提到某个观点 [1]，另一篇文章补充了背景 [2]。
```

回答完成后在下方展示来源卡片。

来源卡片包含：

- 编号。
- 文章标题快照。
- 命中片段快照。
- 来源。
- 创建时间或文档时间。
- 是否已归档。
- 跳转文章详情入口。

引用来源历史保存：

- 引用片段快照。
- 文档关联信息。
- Chunk 关联信息。
- 文档标题快照。
- 来源快照。
- 命中分数。
- 命中位置。

这样历史问答不会因为后续索引重建而对不上当时回答。

### 5.23 来源跳转和临时高亮

点击来源卡片：

- 打开文章详情页。
- 滚动到命中的片段附近。
- 对命中片段做几秒钟临时高亮。

规则：

- 临时高亮不保存为 Annotation。
- 临时高亮不进入高亮批注列表。
- 如果原文已删除，来源卡片禁用跳转。
- 如果定位失败，打开文章详情页并提示无法定位到原文片段。

### 5.24 文章删除后的历史引用

如果引用来源对应文章被永久删除：

- 历史问答仍保留来源卡片。
- 来源卡片展示引用片段快照。
- 来源卡片标记“原文已删除”。
- 禁用跳转入口。

### 5.25 流式输出和停止生成

知识库问答使用 SSE：

```txt
text/event-stream
```

流式事件建议包含：

- `session_created`
- `message_created`
- `answer_delta`
- `citations`
- `title_updated`
- `done`
- `error`

停止生成规则：

- 前端点击“停止生成”。
- 前端中断 SSE 请求。
- 后端监听连接关闭。
- 后端将当前消息标记为 `aborted`。
- 后端保存已生成的部分回答。
- 后端保留本轮引用来源。
- 前端提供“重新生成”入口。

### 5.26 失败和重新生成

知识库问答生成失败时：

- 保留用户问题。
- 助手回答标记为失败。
- 保存错误信息。
- 提供“重新生成”按钮。

重新生成规则：

- 使用当前 AI 配置。
- 重新检索知识库。
- 重新生成回答。
- 引用来源按最新检索结果更新。

## 6. 数据设计

### 6.1 AiSetting

新增全局 AI 设置模型。

建议模型：

```prisma
model AiSetting {
  id String @id @default(cuid())
  key String @unique @default("global")

  chatProviderPreset String?
  chatBaseUrl        String?
  chatModel          String?
  chatApiKeyCipher   String?
  chatApiKeyIv       String?
  chatApiKeyTag      String?
  chatLastTestStatus AiProviderTestStatus?
  chatLastTestError  String?
  chatLastTestedAt   DateTime?

  embeddingProviderPreset String?
  embeddingBaseUrl        String?
  embeddingModel          String?
  embeddingApiKeyCipher   String?
  embeddingApiKeyIv       String?
  embeddingApiKeyTag      String?
  embeddingDimension      Int?
  embeddingLastTestStatus AiProviderTestStatus?
  embeddingLastTestError  String?
  embeddingLastTestedAt   DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum AiProviderTestStatus {
  succeeded
  failed
}
```

说明：

- MVP6 只维护一条全局配置。
- API Key 字段只保存密文和加密参数。
- 接口返回时不返回密文字段，只返回 `hasApiKey`。

### 6.2 DocumentEmbeddingJob

新增索引任务模型。

建议模型：

```prisma
model DocumentEmbeddingJob {
  id        String                 @id @default(cuid())
  status    DocumentEmbeddingStatus @default(pending)
  errorMessage String?

  provider          String?
  model             String?
  dimension         Int?
  configFingerprint String?
  chunkCount        Int @default(0)

  startedAt  DateTime?
  finishedAt DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId     String
  user       User     @relation(fields: [userId], references: [id])

  @@index([userId, status, createdAt])
  @@index([documentId, createdAt])
  @@index([configFingerprint])
}

enum DocumentEmbeddingStatus {
  pending
  processing
  succeeded
  failed
}
```

说明：

- 每次触发索引可以创建一条任务记录。
- 文档详情页展示当前配置下最近一次任务状态。
- 失败任务单条重试时创建新任务或复用原任务均可，最终 UI 需要能追踪最新状态。

### 6.3 DocumentEmbeddingChunk

新增向量片段模型。

建议模型：

```prisma
model DocumentEmbeddingChunk {
  id        String @id @default(cuid())
  chunkIndex Int
  content    String
  contentHash String?
  startOffset Int
  endOffset   Int

  provider          String
  model             String
  dimension         Int
  configFingerprint String
  embedding         Unsupported("vector")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  jobId      String?
  job        DocumentEmbeddingJob? @relation(fields: [jobId], references: [id], onDelete: SetNull)
  userId     String
  user       User @relation(fields: [userId], references: [id])

  @@index([userId, configFingerprint])
  @@index([documentId, configFingerprint])
}
```

说明：

- `embedding` 使用 `pgvector`。
- 为支持不同模型维度，向量字段建议使用不固定维度的 `vector` 类型。
- 查询时必须过滤 `configFingerprint` 和 `dimension`。
- MVP6 不创建 HNSW / IVFFlat 索引。

### 6.4 KnowledgeChatSession

新增知识库问答会话模型。

```prisma
model KnowledgeChatSession {
  id        String @id @default(cuid())
  title     String @default("新的问答")
  deletedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userId String
  user   User @relation(fields: [userId], references: [id])

  messages KnowledgeChatMessage[]

  @@index([userId, deletedAt, updatedAt])
}
```

### 6.5 KnowledgeChatMessage

一条消息表示一次用户问题和一次助手回答。

```prisma
model KnowledgeChatMessage {
  id       String @id @default(cuid())
  question String
  answer   String?
  status   KnowledgeChatMessageStatus @default(processing)

  provider String?
  model    String?
  errorMessage String?

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  finishedAt DateTime?

  sessionId String
  session   KnowledgeChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  userId    String
  user      User @relation(fields: [userId], references: [id])

  citations KnowledgeChatCitation[]

  @@index([sessionId, createdAt])
  @@index([userId, createdAt])
}

enum KnowledgeChatMessageStatus {
  processing
  succeeded
  failed
  aborted
}
```

### 6.6 KnowledgeChatCitation

保存引用来源快照。

```prisma
model KnowledgeChatCitation {
  id            String @id @default(cuid())
  citationIndex Int
  excerpt       String
  score         Float?
  startOffset   Int?
  endOffset     Int?

  documentTitleSnapshot  String
  documentSourceSnapshot String?
  documentArchivedAtSnapshot DateTime?
  documentCreatedAtSnapshot  DateTime?

  createdAt DateTime @default(now())

  messageId String
  message   KnowledgeChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)

  documentId String?
  document   Document? @relation(fields: [documentId], references: [id], onDelete: SetNull)

  chunkId String?
  chunk   DocumentEmbeddingChunk? @relation(fields: [chunkId], references: [id], onDelete: SetNull)

  @@index([messageId, citationIndex])
  @@index([documentId])
}
```

说明：

- 永久删除文章后，`documentId` 置空或查询时视为不可跳转。
- 来源卡片仍展示快照。

## 7. API 设计

### 7.1 AI 设置

新增：

```txt
GET    /api/settings/ai
PUT    /api/settings/ai/chat
PUT    /api/settings/ai/embedding
DELETE /api/settings/ai/chat
DELETE /api/settings/ai/embedding
POST   /api/settings/ai/chat/test
POST   /api/settings/ai/embedding/test
```

`GET /api/settings/ai` 返回：

```json
{
  "chat": {
    "configured": true,
    "providerPreset": "deepseek",
    "baseUrl": "https://api.deepseek.com",
    "model": "deepseek-chat",
    "hasApiKey": true,
    "lastTestStatus": "succeeded",
    "lastTestedAt": "2026-06-08T00:00:00.000Z",
    "lastTestError": null
  },
  "embedding": {
    "configured": true,
    "providerPreset": "siliconflow",
    "baseUrl": "https://api.siliconflow.cn/v1",
    "model": "BAAI/bge-m3",
    "hasApiKey": true,
    "dimension": 1024,
    "lastTestStatus": "succeeded",
    "lastTestedAt": "2026-06-08T00:00:00.000Z",
    "lastTestError": null
  },
  "encryptionReady": true
}
```

保存 Chat 请求：

```json
{
  "providerPreset": "deepseek",
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "apiKey": "sk-..."
}
```

规则：

- `apiKey` 为空字符串或缺省时保留旧密钥。
- `apiKey` 有值时加密替换。
- `baseUrl / model` 必填。
- 未配置加密密钥时，不允许保存新的 API Key。

### 7.2 索引任务

新增：

```txt
GET  /api/settings/embedding-jobs
POST /api/settings/embedding-jobs/:id/retry
```

查询参数：

```txt
status=pending|processing|succeeded|failed
keyword=标题关键词
page=1
pageSize=20
```

重试规则：

- 只能重试当前用户可见的失败任务。
- 重试使用当前启用的 Embedding 配置。
- 重试不会使用任务创建时的旧配置。
- 不支持批量重试。

### 7.3 文档详情索引状态

`GET /api/documents/:id` 返回新增字段：

```json
{
  "embeddingIndexStatus": "succeeded",
  "embeddingIndexErrorMessage": null,
  "embeddingIndexedAt": "2026-06-08T00:00:00.000Z"
}
```

状态建议：

```txt
not_applicable
not_configured
pending
processing
succeeded
failed
```

说明：

- 该状态针对当前 Embedding 配置。
- 历史配置成功索引但当前配置没有索引时，不应显示为当前已完成。

### 7.4 知识库问答会话

新增：

```txt
GET    /api/knowledge-chat/sessions
POST   /api/knowledge-chat/sessions/ask
GET    /api/knowledge-chat/sessions/:id
PATCH  /api/knowledge-chat/sessions/:id
DELETE /api/knowledge-chat/sessions/:id
POST   /api/knowledge-chat/sessions/:id/messages
POST   /api/knowledge-chat/messages/:messageId/regenerate
```

说明：

- `POST /api/knowledge-chat/sessions/ask` 用于临时会话的首轮提问，创建会话并流式返回第一轮回答。
- `POST /api/knowledge-chat/sessions/:id/messages` 用于已有会话继续提问。
- `POST /api/knowledge-chat/messages/:messageId/regenerate` 用于失败或中止消息重新生成。
- `DELETE /api/knowledge-chat/sessions/:id` 为软删除。

### 7.5 知识库问答 SSE

首轮提问请求：

```json
{
  "question": "这些文章里关于长期记忆的核心观点是什么？"
}
```

流式响应事件示例：

```txt
event: session_created
data: {"id":"sessionId","title":"新的问答"}

event: message_created
data: {"id":"messageId"}

event: answer_delta
data: {"text":"根据知识库内容，"}

event: citations
data: [{"index":1,"documentId":"...","excerpt":"..."}]

event: title_updated
data: {"title":"长期记忆的核心观点"}

event: done
data: {"messageId":"messageId"}
```

错误事件：

```txt
event: error
data: {"message":"请先配置 AI"}
```

客户端主动中断 SSE 时，后端不一定能再发送 `aborted` 事件，但必须在数据库中将消息标记为 `aborted`。

## 8. Shared DTO 与 API Client

### 8.1 Shared

`packages/shared` 新增或扩展：

- `AiSettingsDto`
- `UpdateAiProviderConfigRequest`
- `AiProviderTestResultDto`
- `DocumentEmbeddingStatus`
- `DocumentEmbeddingJobDto`
- `ListEmbeddingJobsQuery`
- `RetryEmbeddingJobResponse`
- `KnowledgeChatSessionDto`
- `KnowledgeChatMessageDto`
- `KnowledgeChatCitationDto`
- `CreateKnowledgeChatRequest`
- `UpdateKnowledgeChatSessionRequest`

文档 DTO 增加：

- `embeddingIndexStatus`
- `embeddingIndexErrorMessage`
- `embeddingIndexedAt`

### 8.2 API Client

`packages/api-client` 新增：

```ts
client.settings.getAiSettings()
client.settings.updateChatConfig(payload)
client.settings.updateEmbeddingConfig(payload)
client.settings.clearChatConfig()
client.settings.clearEmbeddingConfig()
client.settings.testChatConfig()
client.settings.testEmbeddingConfig()

client.embeddingJobs.list(params)
client.embeddingJobs.retry(id)

client.knowledgeChat.listSessions()
client.knowledgeChat.askNewSession(payload)
client.knowledgeChat.getSession(id)
client.knowledgeChat.updateSession(id, payload)
client.knowledgeChat.deleteSession(id)
client.knowledgeChat.askInSession(id, payload)
client.knowledgeChat.regenerate(messageId)
```

说明：

- SSE 接口可在 Web 端使用原生 `fetch`。
- API Client 可以提供生成鉴权 header、拼接 URL 的辅助方法。

## 9. 后端模块规划

### 9.1 SettingsModule

新增：

```txt
apps/server/src/settings
```

职责：

- 读取 AI 设置。
- 保存 Chat 配置。
- 保存 Embedding 配置。
- 加密和解密 API Key。
- 清除配置。
- 测试连接。

### 9.2 AiModule 扩展

扩展现有 AI Provider 抽象：

- Chat Provider 从数据库配置创建。
- Embedding Provider 从数据库配置创建。
- 移除 AI Provider `.env` fallback。
- 未配置时抛出统一业务错误。

建议新增：

```ts
type EmbeddingProvider = {
  name: string;
  model: string;
  embed(input: { texts: string[] }): Promise<{
    vectors: number[][];
    dimension: number;
  }>;
};
```

### 9.3 EmbeddingsModule

新增：

```txt
apps/server/src/embeddings
```

职责：

- 创建索引任务。
- 切分正文。
- 调用 Embedding Provider。
- 写入 `DocumentEmbeddingChunk`。
- 查询索引任务。
- 单条重试失败任务。
- 提供文档详情索引状态。

### 9.4 QueueModule 扩展

复用 MVP4 BullMQ 体系，新增队列：

```txt
lumi-embedding
```

任务名建议：

```txt
embedding:index-document
```

触发点：

- URL/HTML Worker 解析成功后。
- 文件导入成功后。
- 选中内容导入成功后。
- 导入重试解析成功后。

### 9.5 KnowledgeChatModule

新增：

```txt
apps/server/src/knowledge-chat
```

职责：

- 会话列表。
- 会话重命名。
- 会话软删除。
- 新建会话首轮提问。
- 多轮提问。
- 重新生成失败或中止消息。
- 知识库检索。
- Prompt 构造。
- SSE 流式输出。
- 保存引用来源快照。
- 生成会话标题。

### 9.6 Prompt 文件

所有大段 Prompt 继续放入独立文件，不写在业务逻辑中。

建议：

```txt
apps/server/src/ai/prompts/knowledge-chat.prompt.ts
apps/server/src/ai/prompts/knowledge-chat-title.prompt.ts
```

## 10. Web 端设计

### 10.1 主导航

新增：

- 知识库问答。
- 设置。

保持整体视觉风格：

- 黑白灰。
- 安静阅读产品。
- 不使用 AI 渐变和花哨装饰。
- 使用现有 shadcn-style UI 组件。

### 10.2 设置页

设置页包含 Tabs：

- AI 设置。
- 索引任务。

AI 设置 Tab：

- Chat 配置表单。
- Embedding 配置表单。
- 测试连接按钮。
- 清除配置按钮。
- 最近测试状态。
- 加密密钥缺失提示。

索引任务 Tab：

- 状态筛选。
- 文档标题搜索。
- 分页任务列表。
- 失败任务单条重试按钮。

### 10.3 知识库问答页

布局：

- 左侧会话栏：
  - 新建会话。
  - 会话列表。
  - 重命名。
  - 删除。
- 右侧问答区：
  - 消息列表。
  - 来源卡片。
  - 输入框。
  - 停止生成按钮。
  - 重新生成按钮。

未配置 AI 时：

- 页面显示“请先配置 AI”。
- 提供跳转设置页按钮。

无索引内容时：

- 页面提示当前还没有可用于知识库问答的索引内容。
- 引导用户导入新文章或检查索引任务。

### 10.4 文档详情页

新增轻量索引状态：

- 显示在文档元信息区域或辅助信息区域。
- 不打断阅读。
- 点击跳转设置页索引任务 Tab。

来源跳转：

- 支持通过 URL query 或 hash 携带 chunk 定位信息。
- 详情页加载后滚动到命中片段附近。
- 临时高亮几秒后淡出。
- 不创建 Annotation。

## 11. Worker 设计

### 11.1 队列

新增队列：

```txt
lumi-embedding
```

默认重试策略建议：

- 尝试 2 次。
- 退避延迟复用 MVP4 任务配置。

可新增环境变量：

```env
EMBEDDING_JOB_ATTEMPTS=2
```

### 11.2 索引任务流程

流程：

1. 文档正文可用。
2. API Server 或 Worker 创建 `DocumentEmbeddingJob(pending)`。
3. 将任务加入 `lumi-embedding` 队列。
4. Worker 读取当前 Embedding 配置。
5. 如果未配置，任务失败。
6. Worker 切分正文。
7. 批量调用 Embedding Provider。
8. 获得向量和 dimension。
9. 生成 config fingerprint。
10. 当前配置下新向量全部成功后，替换该文档旧向量。
11. 任务标记成功。

失败时：

- 保存错误信息。
- 不影响文档导入。
- 不删除当前配置下已有成功索引。

## 12. 知识库问答 Prompt 设计

### 12.1 知识库问答 Prompt

输入：

- 用户当前问题。
- 当前会话上下文。
- 召回的 8 个知识库片段。

规则：

- 使用中文回答。
- 只能基于给定知识库片段。
- 不要编造片段中没有的信息。
- 资料不足时明确说明知识库中没有足够依据。
- 回答中使用 `[1]`、`[2]` 标注引用。
- 引用编号必须对应提供的片段编号。

### 12.2 会话标题 Prompt

输入：

- 首个问题。
- 首个回答。

输出：

- 一个简短中文标题。
- 建议 6-20 个中文字符。
- 不输出引号、编号或解释。

失败时：

- 保持“新的问答”。

## 13. 实现步骤

建议按以下顺序实现：

1. 编写 MVP6 方案文档。
2. 更新 `.env.example`：
   - 增加 `AI_CONFIG_ENCRYPTION_KEY`。
   - 移除或标记旧 AI Provider env 不再作为 MVP6 fallback。
   - 增加可选 `EMBEDDING_JOB_ATTEMPTS`。
3. 更新 Prisma schema：
   - `AiSetting`。
   - `DocumentEmbeddingJob`。
   - `DocumentEmbeddingChunk`。
   - `KnowledgeChatSession`。
   - `KnowledgeChatMessage`。
   - `KnowledgeChatCitation`。
   - 相关枚举和关系。
4. 执行 Prisma migration。
5. 扩展 `packages/shared` DTO。
6. 扩展 `packages/api-client`。
7. 新增 SettingsModule。
8. 实现 API Key 加密和配置读写。
9. 实现 Chat / Embedding 测试连接。
10. 扩展 AI Provider，从数据库配置创建 Chat Provider。
11. 新增 Embedding Provider 抽象。
12. 实现 OpenAI-Compatible Embedding 调用。
13. 新增 `lumi-embedding` 队列和 Worker。
14. 实现正文切片工具。
15. 实现文档索引任务创建和处理。
16. 在 URL/HTML 解析成功后触发索引任务。
17. 在文件导入成功后触发索引任务。
18. 在选中内容导入成功后触发索引任务。
19. 实现索引任务列表和单条重试 API。
20. 文档详情 API 增加当前索引状态。
21. 新增 KnowledgeChatModule。
22. 实现知识库语义召回。
23. 实现引用来源快照保存。
24. 实现知识库问答 SSE。
25. 实现停止生成后的中止状态保存。
26. 实现重新生成。
27. 实现会话标题生成。
28. Web 新增设置页。
29. Web 实现 AI 设置 Tab。
30. Web 实现索引任务 Tab。
31. Web 新增知识库问答页面。
32. Web 实现 SSE 消费、停止生成和重新生成。
33. Web 实现来源卡片和来源跳转。
34. Web 文档详情页展示索引状态和临时高亮。
35. 更新 README 和 AGENTS。
36. 运行构建：
    - `pnpm build:server`
    - `pnpm build:web`
    - `pnpm build:extension`
37. 手动验收 MVP6。

## 14. 验收标准

MVP6 完成后需要满足：

- Web 端存在设置页。
- 设置页包含 `AI 设置` 和 `索引任务` Tab。
- AI 设置页可以配置 Chat Provider。
- AI 设置页可以配置 Embedding Provider。
- Chat 预设包含 DeepSeek、SiliconFlow、OpenAI-Compatible 自定义。
- Embedding 预设包含 SiliconFlow、OpenAI-Compatible 自定义。
- API Key 不回显明文。
- API Key 服务端加密保存。
- API Key 输入框为空保存时保留旧密钥。
- 输入新 API Key 后加密替换旧密钥。
- 可以分别清除 Chat 配置和 Embedding 配置。
- 可以分别测试 Chat 和 Embedding 连接。
- 测试结果记录最近状态和时间。
- 缺少加密密钥时，服务端仍可启动。
- 缺少加密密钥时，不允许保存新的 API Key。
- `.env` AI Provider 配置不再作为 MVP6 fallback。
- 未配置 Chat 时，单篇 AI、当前文章问答、知识库问答提示“请先配置 AI”。
- 未配置 Embedding 时，新文档索引任务失败但文档保存成功。
- 保存新的 Embedding 配置后，不自动重试旧失败任务。
- 单篇 AI 自动分析仍只对 `article` 生效。
- `fragment` 不自动触发单篇 AI 分析。
- 新导入 URL/HTML 文章解析成功后自动创建索引任务。
- 新导入文件文章成功后自动创建索引任务。
- 新保存选中内容片段成功后自动创建索引任务。
- 导入重试解析成功后重新触发索引任务。
- 索引只处理 `article` 和 `fragment`。
- 索引只使用正文片段，不包含标题、AI 分析、高亮和批注。
- 正文切片采用段落优先、固定长度、少量重叠。
- Embedding 按文档 chunk 批量调用。
- 向量记录保存 provider、model、dimension、configFingerprint。
- Embedding 配置变更后旧索引保留但不参与当前检索。
- 重复索引时按当前配置重建该文档索引。
- 重建失败时保留旧成功索引。
- 索引任务 Tab 可以按状态筛选。
- 索引任务 Tab 可以按文档标题搜索。
- 失败索引任务可以单条重试。
- 单条重试使用当前 Embedding 配置。
- 不提供批量重试或批量重建。
- 文档详情页展示轻量索引状态。
- 文档详情页索引状态可跳转到设置页索引任务 Tab。
- 知识库问答页面存在独立入口。
- 知识库问答页面采用左侧会话列表 + 右侧当前会话布局。
- 新建会话先在前端临时创建，不立即写入数据库。
- 首轮提问时创建真实会话。
- 首轮问答完成后尝试 AI 生成会话标题。
- 标题生成失败时保留“新的问答”。
- 会话可以重命名。
- 会话可以删除。
- 删除会话为软删除。
- 会话历史按用户隔离。
- 知识库问答只检索当前用户自己的文档。
- 知识库问答检索活跃文章和归档文章。
- 知识库问答排除回收站文章。
- 归档文章可被引用，来源卡片标识“已归档”。
- 每次提问重新检索知识库，并带上当前会话上下文。
- 检索默认召回 8 个 chunk。
- 每篇文章最多取 2 个 chunk。
- MVP6 不提供独立语义搜索入口。
- MVP6 不混合关键词检索。
- MVP6 使用 pgvector 精确相似度查询。
- 回答使用 SSE 流式输出。
- 回答默认使用中文。
- 引用片段保留原文。
- 回答必须基于知识库片段。
- 资料不足时明确说明知识库中没有足够依据。
- 回答正文使用 `[1] [2]` 编号引用。
- 回答完成后展示来源卡片。
- 来源卡片保存引用片段快照。
- 来源卡片可点击打开文章详情。
- 文章详情能滚动到引用片段附近并临时高亮。
- 临时高亮不保存为 Annotation。
- 原文永久删除后，历史来源卡片保留快照、标记“原文已删除”、禁用跳转。
- 流式生成时可以停止。
- 停止后保存部分回答，消息标记为 `aborted`。
- 失败或中止消息可以重新生成。
- 重新生成使用当前 AI 配置重新检索和重新回答。
- 进入回收站的文档不参与知识库问答。
- 回收站文档恢复后，如果当前配置下已有索引则可重新参与检索。
- 永久删除文档时删除对应向量和索引任务，历史引用保留快照。
- `pnpm build:server` 通过。
- `pnpm build:web` 通过。
- `pnpm build:extension` 通过。

## 15. 风险与处理

### 15.1 `.env` fallback 移除导致升级后 AI 不可用

风险：

- MVP4 用户原本通过 `.env` 使用 AI。
- MVP6 后如果不配置 Web AI 设置，AI 能力会不可用。

处理：

- 页面统一提示“请先配置 AI”。
- README 明确 MVP6 后需要在 Web 设置页配置 Chat / Embedding。
- 不做隐式 `.env` 导入，避免密钥自动落库。

### 15.2 Embedding 配置缺失导致新文档问不到

风险：

- 新文档保存成功，但因为 Embedding 未配置没有进入知识库问答。

处理：

- 创建失败索引任务。
- 设置页索引任务 Tab 展示失败原因。
- 配置完成后允许单条重试。

### 15.3 不补齐历史索引导致知识库覆盖不完整

风险：

- MVP6 之前保存的文章不会自动进入知识库问答。

处理：

- 方案文档和 README 明确 MVP6 只索引新文档。
- 知识库问答页提示当前可用索引范围。
- 后续版本可增加手动补齐或批量重建能力。

### 15.4 不同 Embedding 模型向量空间混用

风险：

- 切换模型后旧向量仍在数据库中，如果混用会导致检索结果不可靠。

处理：

- 每条向量保存 `dimension + configFingerprint`。
- 检索时只查询当前配置指纹。
- 旧索引保留但不参与当前检索。

### 15.5 引用来源和回答不一致

风险：

- 重新生成、索引重建或文章删除后，历史回答引用可能变化。

处理：

- 保存引用片段快照。
- 保存文档和 chunk 关联信息。
- 文章删除后保留快照但禁用跳转。

### 15.6 停止生成状态保存不稳定

风险：

- 前端中断 SSE 后，后端可能无法继续发送事件。
- Provider 调用中断能力有限。

处理：

- 后端监听连接关闭。
- 尽量中止后续流处理。
- 保存已生成部分回答。
- 标记消息为 `aborted`。
- 提供重新生成入口。

### 15.7 pgvector 精确查询后期性能不足

风险：

- 数据量增长后，精确相似度查询可能变慢。

处理：

- MVP6 只索引新文档，初期数据量可控。
- 后续版本再根据真实数据量引入 HNSW / IVFFlat。

### 15.8 AI 标题生成增加额外调用

风险：

- 首轮问答完成后生成标题会多一次 Chat 调用。
- 标题生成失败可能影响历史列表辨识度。

处理：

- 标题生成失败不影响问答。
- 失败时保留“新的问答”。
- 用户可手动重命名。

## 16. 后续扩展

MVP6 完成后，后续版本可以继续扩展：

- 历史文章索引补齐。
- 手动重建某篇文档索引。
- 批量重试失败索引任务。
- 批量重建当前 Embedding 配置索引。
- 独立语义搜索页。
- 文章列表搜索升级为混合搜索。
- 关键词 + 语义混合召回。
- HNSW / IVFFlat 向量索引。
- 知识库问答范围筛选：
  - 标签。
  - 来源。
  - 类型。
  - 收藏。
  - 是否包含归档。
- 高亮和批注参与知识库问答。
- AI 根据高亮批注生成个人阅读笔记。
- 会话归档和恢复。
- 会话分享。
- 多套 AI 配置。
- 每个用户独立 AI 配置。
- 管理员权限模型。
- Provider 配置导入导出。
- 模型参数高级设置。
- PDF 导入并进入知识库问答。
- RSS 订阅内容自动索引。
- 图片本地化与 OCR。
- 视频 / 音频转录后进入知识库问答。
