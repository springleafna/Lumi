# Lumi MVP8 方案文档：代码质量与可维护性优化

## 1. 背景

MVP0 已完成 Lumi 的 Monorepo 工程结构搭建；MVP1 打通 Web 端 URL 导入、解析、保存和阅读闭环；MVP2 补全浏览器插件 URL/HTML 导入能力；MVP3 增强文章管理、筛选、归档、回收站和阅读体验；MVP4 建立 Redis + BullMQ 异步任务体系，并加入单篇文章 AI 分析与当前文章问答；MVP5 完成阅读沉淀能力，加入未读/已读、收藏、高亮批注、文件导入、选中内容导入和代码高亮；MVP6 完成知识库级 AI 问答、AI 配置中心、Embedding 索引和索引任务管理；MVP7 完成阅读内容质量优化，包括正文提取、目录纯净化和图片归档到 RustFS。

经过 MVP0 到 MVP7 的持续迭代，Lumi 的功能闭环已经完整，但代码层面积累了若干可维护性问题：前端单页文件过大、页面专属样式全部集中在 `style.css`、后端工具函数在多个模块重复定义、部分复杂业务流程缺少说明性注释。这些问题不影响当前功能，但会随着后续功能增加持续放大维护成本。

MVP8 不新增任何产品功能，专门用于偿还这些工程债务，把代码结构整理到后续可以长期健康演进的状态。

## 2. MVP8 目标

MVP8 聚焦代码质量与可维护性优化：

- 前端页面组件拆分
  - 把四个超过阈值的大页面拆分为页面壳 + 领域组件 + composable + 纯函数库的合理结构
  - 每个拆分后的 `.vue` 文件控制在合理行数，单一职责
  - 跨页面可复用的领域组件沉淀到 `components` 目录
- 页面专属样式迁移
  - 把分散在 `style.css` 里的页面专属样式迁移到对应组件的 `<style scoped>` 块
  - 同时建立全局样式、组件库样式、页面样式三层边界规范
- 后端工具函数整理
  - 把重复定义的工具函数收敛到 `common` 目录统一导出
  - 各业务模块改为从 `common` 引入，消除重复定义
- 复杂业务流程补充注释
  - 给难以一眼看懂的异步编排、事务流程补充"为什么"层面的说明
  - 在关键 service / processor 文件顶部补充职责说明

## 3. 非目标

MVP8 暂不包含以下能力：

- 不改变任何用户可见的产品行为、交互或视觉
- 不引入新的前端框架或状态管理库（不引入 Pinia / Vuex / Redux 等）
- 不引入 CSS Modules 或 CSS-in-JS 方案，只使用 Vue 原生 `<style scoped>`
- 不引入新的后端依赖或中间件
- 不引入 `class-validator` 和 `ValidationPipe`（保留为后续可选优化）
- 不重写 UI 组件库的交互逻辑
- 不改变现有的 API 路由、请求参数和响应结构
- 不改变 Prisma 数据模型和数据库结构
- 不补充单元测试（保留为独立后续工作）
- 不对 `apps/extension` 做结构性重构（插件代码量较小，暂不在本期范围）
- 不对 `packages/*` 做结构性重构
- 不做性能优化、不做打包体积优化
- 不调整 `markdown-reader` 阅读区的排版样式规则本身，只迁移其归属

## 4. 产品语义

### 4.1 本期是工程内部重构

MVP8 的所有改动都属于工程内部重构，目标是改善代码组织结构，不面向用户。验收时以"行为零变更"为最高准则：重构前后，用户在 Web 端、插件端的所有操作路径、视觉表现、数据结果必须完全一致。

### 4.2 零行为变更验收基线

零行为变更包括但不限于：

- 所有 API 路由的路径、方法、入参、响应结构不变
- 所有页面的可访问路由不变
- 所有按钮、表单、对话框、抽屉的交互行为不变
- 所有状态的展示文案、徽章颜色、图标不变
- 所有异步流程（解析、AI 分析、Embedding 索引、知识库问答）的触发时机和结果不变
- 阅读区的正文渲染、代码高亮、目录、高亮批注、图片展示效果不变

### 4.3 组件拆分的三层模型

前端组件按职责分为三层：

- 全局通用组件
  - 放在 `apps/web/src/components/ui`，服务于所有页面
  - 例如 `Button`、`Input`、`Dialog`、`Badge` 等
  - 已经存在，本期不新增也不重写
- 领域组件
  - 放在 `apps/web/src/components` 下按领域分组的目录，或放在对应页面的子目录
  - 只服务于特定页面或特定业务概念，但内聚度高、边界清晰
  - 例如 `ArticleReader`、`AnnotationLayer`、`ArticleCard`、`ProviderConfigForm`
- 页面壳
  - 保留在 `apps/web/src/views`，只负责路由装配、页面级状态编排、调用 composable
  - 不再承载具体的 UI 片段实现

### 4.4 样式的三层边界

样式同样按三层划分，与组件层不一定一一对应：

- 全局样式
  - 必须全局生效的样式：CSS 变量定义、reset 规则、全局布局（`.app-shell` / `.sidebar` / `.main` / `.header` / `.content`）、跨页共享的 `.markdown-reader` 阅读区规则
  - 保留在 `style.css`
- 组件库样式
  - `components/ui` 下组件自身的样式，随组件迁移到对应 `.vue` 的 `<style scoped>`
  - 例如 `.ui-button` / `.ui-input` / `.ui-dialog-*`
- 页面 / 领域样式
  - 只服务于具体页面或领域组件的样式，迁移到对应组件的 `<style scoped>`
  - 例如 `.article-detail-*` / `.ai-drawer-*` / `.annotation-*` / `.article-card-*`

### 4.5 拆分的判断标准

不是所有代码都要拆分。拆分遵循以下判断：

- 单个 `.vue` 文件行数超过 500 行开始警惕，超过 800 行应当拆分
- 某段逻辑有独立含义、可单独测试、或在其它页面可能复用，优先抽出
- 只用一次、且只有十几行的片段，不强行抽组件，避免制造噪音
- 纯函数优先抽到 `lib` 或 `composable`，而不是塞进新的 `.vue` 组件

## 5. 现状问题盘点

### 5.1 前端大文件

当前 `apps/web/src/views` 下的页面文件行数：

```txt
DocumentDetailPage.vue   1501 行
DocumentsPage.vue         944 行
KnowledgeChatPage.vue     701 行
SettingsPage.vue          693 行
LoginPage.vue              81 行
```

四个核心页面均超过 500 行阈值，`DocumentDetailPage` 接近阈值的三倍。问题集中在：

- 单个页面同时承载多个独立功能块（正文渲染、高亮批注、AI 抽屉、目录、标签管理）
- 大量纯 DOM 算法（高亮区间包裹、选区偏移计算、目录观察）混在页面脚本里
- 模板部分包含侧栏、正文区、多个抽屉、多个对话框，难以局部修改

### 5.2 样式集中化

`apps/web/src/style.css` 当前共 2486 行，所有页面的样式都集中在这一个文件里。问题包括：

- 修改某个页面的样式需要在 2486 行的公共文件里定位类名
- 所有 `.vue` 文件没有使用 `<style scoped>`，类名全靠人工命名约定避免冲突
- 即使某页面未访问，其样式也全量加载，无法按页面拆分

`style.css` 的内部结构按行号可以分为三段：

```txt
1 - 100     全局 reset 与 design tokens（:root 变量）
101 - 591   UI 组件库样式（.ui-button / .ui-input / .ui-select / .ui-card / .ui-badge / .ui-tabs / .ui-search / .ui-empty / .ui-dialog / .ui-toaster）
593 - 787   全局布局样式（.app-shell / .sidebar / .main / .header / .content / .sidebar-*）
788 - 2486  页面与领域样式（.article-list-* / .article-card-* / .article-detail-* / .ai-drawer-* / .annotation-* / 知识库问答 / 设置页 / 登录页 / .markdown-reader）
```

### 5.3 后端工具函数重复

后端存在工具函数在多个模块各自重新定义的问题。最典型的是错误信息提取函数：

```txt
apps/server/src/common/api-exception.filter.ts   getErrorMessage
apps/server/src/documents/documents.service.ts   getErrorMessage
apps/server/src/embeddings/embeddings.service.ts getErrorMessage
apps/server/src/ingest/ingest.service.ts         getErrorMessage
apps/server/src/media/media-archive.service.ts   getErrorMessage
apps/server/src/ai/ai.service.ts                 getErrorMessage
apps/server/src/settings/settings.service.ts     getErrorMessage
apps/server/src/knowledge-chat/knowledge-chat.service.ts getErrorMessage
apps/server/src/worker/ingest.processor.ts       getErrorMessage
```

同一个 `getErrorMessage(error: unknown): string` 在 9 个文件里各写了一遍，逻辑基本一致（`error instanceof Error ? error.message : '未知错误'`）。`worker/ingest.processor.ts` 还单独定义了 `parseDate` 工具函数。

### 5.4 复杂流程缺注释

后端业务代码结构规范，但几乎没有说明性注释。问题集中在几类难一眼看懂的逻辑：

- `worker/ingest.processor.ts` 的 `process` 方法：包含占位文档状态推进、HTML 抓取、正文解析、媒体归档、事务写库、旧对象清理、AI 分析与 Embedding 双入队、失败兜底等十余个步骤，没有流程总览注释
- `knowledge-chat.service.ts` 的问答流程：检索、Prompt 组装、SSE 流式、引用回填、会话标题生成交织在一起
- `embeddings.service.ts` 的索引与检索流程：分片、去重、向量存储、相似度检索的衔接
- 多个 service 里"先校验归属再操作"的权限保护模式缺少统一说明

## 6. 前端组件拆分方案

### 6.1 拆分原则与阈值

- 单个 `.vue` 文件目标控制在 400 行以内，组件化后页面壳通常在 200 ~ 300 行
- 抽取顺序优先级：纯函数 > composable > 领域组件 > 跨页通用组件
- 抽出的 composable 与纯函数优先放 `composables` 和 `lib`，保证可测试、可复用
- 跨页通用的领域组件放 `components` 下按领域分组，单页专属组件放该页同名子目录

### 6.2 composable 抽取规范

- 纯 DOM 算法、纯数据计算函数，抽到 `apps/web/src/lib` 下的 `.ts` 文件，不依赖 Vue 响应式
- 涉及响应式状态（`ref` / `computed` / `watch`）、生命周期、与组件实例耦合的逻辑，抽到 `apps/web/src/composables` 下的 `useXxx.ts`
- composable 命名以 `use` 开头，返回响应式状态和操作方法
- composable 内部不直接调用 `useToast` / `useRouter` 等组合式 API 之外的副作用，需要的依赖由调用方传入或在 composable 内显式声明

### 6.3 DocumentDetailPage 拆分

`DocumentDetailPage.vue` 当前 1501 行，是本期拆分重点。拆分后页面壳只保留路由装配、文档加载轮询、各子组件状态编排。

新增 `apps/web/src/components/document-detail` 目录，存放详情页专属领域组件：

- `ArticleReader.vue`
  - 承载正文区渲染：Markdown 初始化、Shiki 高亮初始化、DOMPurify 清洗、`renderedMarkdown` 计算、图片加载失败兜底
  - 接收文档与批注、引用区间作为 props，向上 emit 点击批注标记、选区创建等事件
- `AnnotationLayer.vue`
  - 承载高亮与批注交互：选区工具条、批注编辑对话框、批注列表
  - 选区偏移计算、重叠检测交给 `lib/highlight-dom.ts` 纯函数
- `AiDrawer.vue`
  - 承载右侧 AI 辅助阅读抽屉：分析状态、分析卡片、文章问答流式
  - 接收文档与对话列表，向上 emit 提问、重试事件
- `ArticleToc.vue`
  - 承载目录侧栏：从渲染后的标题生成目录、IntersectionObserver 高亮当前章节、点击滚动
- `TagEditor.vue`
  - 承载标签管理：标签列表展示、新增、删除
  - 跨页可复用（详情页侧栏与列表页都可能用到）

新增纯函数库 `apps/web/src/lib/highlight-dom.ts`，迁移以下与 Vue 无关的纯 DOM 算法：

```ts
export function wrapTextRange(root, startOffset, endOffset, options): void
export function getSelectionOffsets(root, range): { startOffset, endOffset } | null
export function countOccurrencesBefore(text, selectedText, offset): number
export function applyReaderHighlights(html, items, citation): string
export function hasAnnotationOverlap(items, startOffset, endOffset): boolean
```

新增 composable `apps/web/src/composables/useRuntimeToc.ts`，封装目录生成与 IntersectionObserver 观察，返回 `tocItems`、`activeTocId`、`refresh`、`scrollToHeading`、`dispose`。

新增 composable `apps/web/src/composables/useMarkdownRenderer.ts`，封装 MarkdownIt 与 Shiki 初始化、代码围栏渲染、`renderedMarkdown` 计算，供详情页与知识库问答页复用。

拆分后 `DocumentDetailPage.vue` 的职责：

- 路由参数读取、文档加载与轮询
- 归档 / 收藏 / 删除 / 重试解析 / 重试 AI 等页面级动作
- 装配 `ArticleReader` / `AnnotationLayer` / `AiDrawer` / `ArticleToc` / `TagEditor`
- 通过 props 向下传递状态，通过事件向上接收操作

### 6.4 DocumentsPage 拆分

`DocumentsPage.vue` 当前 944 行，承载列表、搜索、筛选、导入、卡片操作、轮询。

新增 `apps/web/src/components/documents` 目录：

- `ArticleCard.vue`
  - 单个文章卡片：标题、摘要、标签、徽章、操作按钮
  - 跨页可复用
- `DocumentFilters.vue`
  - 搜索栏 + 类型 / 标签 / 来源 / 阅读状态 / 收藏筛选 + 排序
  - 接收筛选状态，向上 emit 变更
- `ImportDialog.vue`
  - URL 导入与文件导入对话框
  - 接收打开状态，向上 emit 导入完成

新增 composable `apps/web/src/composables/useDocumentsQuery.ts`，封装列表查询、筛选状态、分页、轮询、facets 加载，返回响应式状态与操作方法。

页面壳保留侧栏导航、页面标题、状态 Tab 装配，以及删除 / 归档等需要确认对话框的动作编排。

### 6.5 KnowledgeChatPage 拆分

`KnowledgeChatPage.vue` 当前 701 行，承载会话列表、问答区、SSE 流式、引用展示、中止控制。

新增 `apps/web/src/components/knowledge-chat` 目录：

- `KnowledgeSessionList.vue`
  - 左侧会话列表：会话项展示、新建、切换、删除、重命名
- `KnowledgeChatPanel.vue`
  - 右侧问答区：消息气泡、Markdown 渲染、引用来源、输入框、中止按钮、自动滚动到底

新增 composable `apps/web/src/composables/useKnowledgeChat.ts`，封装会话加载、提问、SSE 流式接收、`AbortController` 中止、错误处理，返回响应式状态与操作方法。

问答区的 Markdown 渲染复用 `useMarkdownRenderer`。

### 6.6 SettingsPage 拆分

`SettingsPage.vue` 当前 693 行，承载 AI 配置和索引任务两个完全不同的领域。

新增 `apps/web/src/components/settings` 目录：

- `AiSettingsPanel.vue`
  - AI 配置 Tab：Chat Provider 表单、Embedding Provider 表单、保存、测试、清除
- `EmbeddingJobsPanel.vue`
  - 索引任务 Tab：任务列表、状态筛选、分页、分片查看、重试
- `ProviderConfigForm.vue`
  - 单个 Provider 配置表单：preset 选择、base url、model、api key
  - Chat 与 Embedding 两个表单复用同一组件

新增 composable `apps/web/src/composables/useAiSettings.ts`，封装 AI 设置加载、保存、测试、清除，以及表单与 DTO 的双向映射。

新增 composable `apps/web/src/composables/useEmbeddingJobs.ts`，封装索引任务列表、分页、筛选、分片查看、重试。

页面壳只保留 Tab 切换与路由 query 同步。

### 6.7 目录结构树

拆分后 `apps/web/src` 的新增文件：

```txt
apps/web/src/
├── components/
│   ├── document-detail/
│   │   ├── ArticleReader.vue
│   │   ├── AnnotationLayer.vue
│   │   ├── AiDrawer.vue
│   │   ├── ArticleToc.vue
│   │   └── TagEditor.vue
│   ├── documents/
│   │   ├── ArticleCard.vue
│   │   ├── DocumentFilters.vue
│   │   └── ImportDialog.vue
│   ├── knowledge-chat/
│   │   ├── KnowledgeSessionList.vue
│   │   └── KnowledgeChatPanel.vue
│   ├── settings/
│   │   ├── AiSettingsPanel.vue
│   │   ├── EmbeddingJobsPanel.vue
│   │   └── ProviderConfigForm.vue
│   └── ui/                              （已存在，本期把样式迁入对应 .vue）
├── composables/
│   ├── useAiSettings.ts
│   ├── useAnnotationDom.ts              （可选，若 AnnotationLayer 逻辑较多）
│   ├── useDocumentsQuery.ts
│   ├── useEmbeddingJobs.ts
│   ├── useKnowledgeChat.ts
│   ├── useMarkdownRenderer.ts
│   └── useRuntimeToc.ts
├── lib/
│   ├── client.ts                        （已存在）
│   └── highlight-dom.ts
└── views/
    ├── DocumentDetailPage.vue           （页面壳）
    ├── DocumentsPage.vue                （页面壳）
    ├── KnowledgeChatPage.vue            （页面壳）
    └── SettingsPage.vue                 （页面壳）
```

`composables/useAnnotationDom.ts` 是否独立视 `AnnotationLayer.vue` 的复杂度而定：若选区逻辑较多则独立，否则并入 `lib/highlight-dom.ts` 与组件内部。

## 7. 样式拆分方案

### 7.1 style.css 三层分类

基于 `style.css` 当前的行号分布，划分为三层：

- 全局层（保留在 `style.css`）
  - 1 ~ 100 行：reset 规则与 `:root` design tokens
  - 593 ~ 787 行：全局布局 `.app-shell` / `.sidebar` / `.main` / `.header` / `.content` / `.sidebar-*`
  - `.markdown-reader` 阅读区规则（跨详情页与知识库问答复用）
- 组件库层（迁入 `components/ui/*.vue`）
  - 101 ~ 591 行：`.ui-button` / `.ui-input` / `.ui-select` / `.ui-card` / `.ui-badge` / `.ui-tabs` / `.ui-search` / `.ui-empty` / `.ui-dialog-*` / `.ui-toaster` / `.ui-toast-*` 及对应的过渡动画
- 页面 / 领域层（迁入对应页面或领域组件）
  - `.article-list-*` / `.article-card-*` → `ArticleCard.vue` / `DocumentsPage.vue`
  - `.article-detail-*` / `.article-header` / `.article-reading-layout` → `ArticleReader.vue` / `DocumentDetailPage.vue`
  - `.article-toc-*` → `ArticleToc.vue`
  - `.ai-drawer-*` / `.ai-section` / `.ai-chat-*` → `AiDrawer.vue`
  - `.annotation-*` / `.selection-toolbar` → `AnnotationLayer.vue`
  - 知识库问答页样式 → `KnowledgeSessionList.vue` / `KnowledgeChatPanel.vue`
  - 设置页样式 → `AiSettingsPanel.vue` / `EmbeddingJobsPanel.vue` / `ProviderConfigForm.vue`
  - 登录页样式 → `LoginPage.vue`

### 7.2 迁移清单

迁移按"先迁组件库、再迁领域组件、最后迁页面壳"的顺序进行，每一步都能独立验证：

- 第一步：`components/ui` 各组件样式迁入对应 `.vue` 的 `<style scoped>`
  - `Button.vue` ← `.ui-button` 及变体
  - `Input.vue` ← `.ui-input`
  - `Select.vue` ← `.ui-select-*`
  - `Card.vue` ← `.ui-card`
  - `Badge.vue` ← `.ui-badge` 及变体
  - `Tabs.vue` ← `.ui-tabs` / `.ui-tab`
  - `SearchInput.vue` ← `.ui-search`
  - `EmptyState.vue` ← `.ui-empty*`
  - `Dialog.vue` ← `.ui-dialog-*` 及 `.dialog-fade-*` 过渡
  - `Toaster.vue` ← `.ui-toaster` / `.ui-toast-*` / `.toast-*` 过渡
- 第二步：领域组件拆分时，对应样式随之迁入
  - 与第 6 章的组件拆分同步进行，组件落地即样式落地
- 第三步：页面壳残留样式迁入对应页面 `.vue`
  - 侧栏导航 `.sidebar-section` / `.sidebar-nav` / `.sidebar-link` 属于全局布局，保留在 `style.css`
  - 页面标题 `.page-title` / `.article-list-header` 等迁入对应页面

迁移完成后 `style.css` 预期保留：reset、design tokens、全局布局、`.markdown-reader`，预计从 2486 行降到约 600 ~ 800 行。

### 7.3 三层边界规范

为避免后续样式再次混乱，明确三层边界判断规则：

- 必须全局（保留 `style.css`）
  - `:root` 下的 CSS 变量定义
  - `*` / `html` / `body` / `#app` 等 reset 与根元素规则
  - 跨多个页面共享的布局容器（`.app-shell` / `.sidebar` / `.main` / `.header` / `.content`）
  - 跨多个页面共享的内容区规则（`.markdown-reader`）
- 必须 scoped（写进组件 `<style scoped>`）
  - 组件库组件自身样式
  - 领域组件自身样式
  - 单页面专属、不会被其它页面引用的样式
- 判断规则
  - 该样式是否只服务于一个组件？是 → scoped
  - 该样式是否被两个及以上页面使用？是 → 全局
  - 该样式是否依赖 CSS 变量？依赖 → 通过 `var(--xxx)` 引用，变量本身留全局
  - 该样式是否是动画 / 过渡？服务于单一组件 → scoped，服务于全局布局 → 全局

### 7.4 scoped 样式注意事项

使用 `<style scoped>` 时需要注意：

- scoped 样式只作用于当前组件根元素及其子元素，不会影响子组件内部
- 需要穿透子组件修改样式时使用 `:deep(.xxx)`，但应尽量避免，优先通过 props 或子组件内部样式解决
- 全局类（如 `.markdown-reader` 渲染出的 `.markdown-reader h2`）若由当前组件的 `v-html` 注入，scoped 不生效，需用 `:deep()` 或保留在全局
  - 正文区的 `.markdown-reader` 规则建议保留在全局，因为它作用于 `v-html` 注入的内容
- 动画类名（`xxx-enter-active` 等）若定义在 scoped 内，Vue 会自动处理属性选择器，正常使用即可
- 组件库样式迁入 scoped 后，原先在全局的 `.ui-button--default` 等类名不变，只是作用域收窄到组件内

## 8. 后端工具函数整理

### 8.1 重复工具盘点

后端目前重复定义的工具函数：

- `getErrorMessage(error: unknown): string`
  - 在 9 个文件重复定义，逻辑基本为 `error instanceof Error ? error.message : '未知错误'`
  - 部分文件版本略有差异（如 `api-exception.filter.ts` 还会处理 `response` 对象）
- `parseDate(value?: string): Date | null`
  - 在 `worker/ingest.processor.ts` 单独定义
  - 其它涉及日期解析的地方目前直接内联

### 8.2 新增 common 工具设计

在 `apps/server/src/common` 下新增工具文件：

```ts
// apps/server/src/common/error.utils.ts

/**
 * 从未知错误中提取可读的错误信息。
 * 后端各模块统一使用此函数，避免重复定义。
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '未知错误';
}
```

```ts
// apps/server/src/common/date.utils.ts

/**
 * 将字符串安全解析为 Date，无效时返回 null。
 */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
```

注意 `api-exception.filter.ts` 当前的 `getErrorMessage` 内部还处理了 NestJS 的 `response` 对象（数组 message 拼接、字符串 response 等），与通用版本逻辑不同。该文件保留自己的局部实现，或抽取为 `getHttpExceptionMessage(exception, response)` 专属函数，不强制合并到通用 `getErrorMessage`。

### 8.3 迁移步骤

- 新增 `common/error.utils.ts` 与 `common/date.utils.ts`
- 逐个文件删除本地 `getErrorMessage` 定义，改为 `import { getErrorMessage } from '../common/error.utils'`
  - 涉及文件：`documents.service.ts` / `embeddings.service.ts` / `ingest.service.ts` / `media-archive.service.ts` / `ai.service.ts` / `settings.service.ts` / `knowledge-chat.service.ts` / `ingest.processor.ts`
  - `api-exception.filter.ts` 按需保留局部实现或抽取专属函数
- `ingest.processor.ts` 的本地 `parseDate` 改为从 `common/date.utils` 引入
- 每改一个文件即运行 `pnpm build:server` 验证导入路径与类型正确

### 8.4 不做的事

工具整理遵循克制原则：

- 不为只有一处使用的逻辑提前抽象工具函数
- 不把业务相关、不可复用的逻辑塞进 `common`
- 不引入 `lodash` / `date-fns` 等工具库替换两三行原生代码
- 不改变现有错误处理的结构，只收敛重复定义

## 9. 复杂流程注释规范

### 9.1 注释原则

- 注释解释"为什么"，不解释"是什么"，代码本身已经说明 what
- 文件顶部用 JSDoc 说明该模块 / 类的职责，1 ~ 3 行
- 复杂方法在方法上方用简短注释说明流程要点，用步骤式或要点式
- 不补无用注释（如 `// 获取用户`、`// 返回结果`）
- 不为简单的 CRUD、getter / setter 补注释

### 9.2 待注释文件清单

只对核心复杂流程补注释，覆盖以下文件：

- `apps/server/src/worker/ingest.processor.ts`
  - 文件顶部补充职责说明：消费 `lumi-ingest` 队列，完成 URL / HTML 文章的抓取、解析、媒体归档、入库和下游入队
  - `process` 方法上方补充流程总览注释，列出主要步骤
- `apps/server/src/worker/ai-analysis.processor.ts`
  - 补充 AI 分析任务的处理流程说明
- `apps/server/src/worker/embedding.processor.ts`
  - 补充 Embedding 索引任务的处理流程说明
- `apps/server/src/knowledge-chat/knowledge-chat.service.ts`
  - 文件顶部补充职责说明
  - 问答主流程方法补充检索、Prompt、SSE、引用回填的要点
- `apps/server/src/embeddings/embeddings.service.ts`
  - 补充分片、去重、向量写入、相似度检索的衔接说明
- `apps/server/src/ingest/ingest.service.ts`
  - 补充占位文档创建、重复检测、入队逻辑说明
- `apps/server/src/settings/settings.service.ts`
  - 补充 API key 加密存储的设计意图说明

简单 controller、mapper、prisma wrapper 不补注释。

### 9.3 注释模板示例

文件顶部职责说明示例：

```ts
/**
 * 消费 lumi-ingest 队列，把占位文档推进为解析完成状态。
 *
 * 主要流程：
 * 1. 抓取或校验 HTML，调用 @lumi/parser 提取正文
 * 2. 对正文图片做 RustFS 归档（best-effort）
 * 3. 在事务内更新文档与媒体资产、推进 IngestJob 状态
 * 4. 清理上一轮归档产生的孤儿对象
 * 5. 入队 AI 分析与 Embedding 索引
 *
 * 失败时按 best-effort 写回失败状态，不阻断队列重试。
 */
```

方法流程说明示例：

```ts
async function process(job) {
  // 状态推进为 processing，避免被重复消费
  await this.markIngestProcessing(...)
  // ...
}
```

## 10. 实现步骤

建议按以下顺序实现，每一步都能独立构建和验证：

1. 编写 MVP8 方案文档（本文档）。
2. 新增后端 `apps/server/src/common/error.utils.ts` 与 `common/date.utils.ts`。
3. 逐个迁移后端 `getErrorMessage` 定义为 import，每改一个文件运行 `pnpm build:server`。
4. 迁移 `ingest.processor.ts` 的 `parseDate` 为 import。
5. 为 `worker` 三个 processor 和核心 service 补充文件顶部与方法流程注释。
6. 运行 `pnpm build:server` 确认后端整理无回归。
7. 新增 `apps/web/src/lib/highlight-dom.ts`，迁移纯 DOM 算法。
8. 新增 `composables/useMarkdownRenderer.ts` 与 `composables/useRuntimeToc.ts`。
9. 新增 `components/document-detail/TagEditor.vue`，从详情页抽离标签管理。
10. 新增 `components/document-detail/ArticleToc.vue`，接入 `useRuntimeToc`。
11. 新增 `components/document-detail/ArticleReader.vue`，抽离正文渲染与图片兜底。
12. 新增 `components/document-detail/AnnotationLayer.vue`，抽离高亮与批注交互。
13. 新增 `components/document-detail/AiDrawer.vue`，抽离 AI 抽屉。
14. 改造 `DocumentDetailPage.vue` 为页面壳，装配上述组件，运行 `pnpm build:web` 验证。
15. 新增 `composables/useDocumentsQuery.ts`。
16. 新增 `components/documents/ArticleCard.vue`。
17. 新增 `components/documents/DocumentFilters.vue`。
18. 新增 `components/documents/ImportDialog.vue`。
19. 改造 `DocumentsPage.vue` 为页面壳，运行 `pnpm build:web` 验证。
20. 新增 `composables/useKnowledgeChat.ts`。
21. 新增 `components/knowledge-chat/KnowledgeSessionList.vue`。
22. 新增 `components/knowledge-chat/KnowledgeChatPanel.vue`，复用 `useMarkdownRenderer`。
23. 改造 `KnowledgeChatPage.vue` 为页面壳，运行 `pnpm build:web` 验证。
24. 新增 `composables/useAiSettings.ts` 与 `composables/useEmbeddingJobs.ts`。
25. 新增 `components/settings/ProviderConfigForm.vue`。
26. 新增 `components/settings/AiSettingsPanel.vue` 与 `components/settings/EmbeddingJobsPanel.vue`。
27. 改造 `SettingsPage.vue` 为页面壳，运行 `pnpm build:web` 验证。
28. 把 `style.css` 的 UI 组件库样式逐个迁入 `components/ui/*.vue` 的 `<style scoped>`，每迁一批运行 `pnpm build:web` 验证视觉无变化。
29. 把领域组件样式随组件拆分迁入对应 `<style scoped>`。
30. 把页面壳残留样式迁入对应页面 `.vue`，`style.css` 精简到全局层。
31. 运行 `pnpm build:web`、`pnpm build:server`、`pnpm build:extension` 确认全量构建通过。
32. 更新 `AGENTS.md`，补充三层组件与三层样式的规范说明。
33. 手动验收 MVP8，确认重构前后行为零变更。

## 11. 验收标准

### 11.1 前端组件拆分验收

- `DocumentDetailPage.vue` 行数显著下降，正文渲染、高亮批注、AI 抽屉、目录、标签管理分别由独立组件承担。
- `DocumentsPage.vue` 行数显著下降，卡片、筛选、导入分别由独立组件承担。
- `KnowledgeChatPage.vue` 行数显著下降，会话列表与问答区分别由独立组件承担。
- `SettingsPage.vue` 行数显著下降，AI 配置与索引任务分别由独立组件承担。
- 纯 DOM 算法迁移到 `lib/highlight-dom.ts`，不在任何 `.vue` 文件内重复。
- 跨页可复用的领域组件（`TagEditor` / `ArticleCard` / `ProviderConfigForm` / `useMarkdownRenderer`）只存在一份定义。
- 拆分后每个 `.vue` 文件控制在合理行数，单一职责。

### 11.2 样式拆分验收

- `components/ui` 下每个组件的样式都位于自身的 `<style scoped>`。
- 页面与领域样式位于对应组件的 `<style scoped>`。
- `style.css` 精简为全局 reset、design tokens、全局布局与 `.markdown-reader`。
- `style.css` 行数从 2486 行降到约 600 ~ 800 行。
- 全局 CSS 变量仍可在所有组件中通过 `var(--xxx)` 正常引用。
- 所有页面视觉表现与重构前完全一致。

### 11.3 后端工具整理验收

- `getErrorMessage` 在 `common/error.utils.ts` 只存在一份定义。
- 8 个业务文件的本地 `getErrorMessage` 定义已删除，改为 import。
- `parseDate` 在 `common/date.utils.ts` 只存在一份定义。
- `api-exception.filter.ts` 的错误处理逻辑不回归。
- `pnpm build:server` 通过。

### 11.4 注释验收

- `worker/ingest.processor.ts` 文件顶部与方法流程有说明性注释。
- `knowledge-chat.service.ts`、`embeddings.service.ts`、`ingest.service.ts`、`settings.service.ts` 文件顶部有职责说明。
- 没有出现"是什么"类的无用注释。
- 简单 controller、mapper 没有强行注释。

### 11.5 零行为变更验收

- 所有 API 路由的路径、方法、入参、响应结构与重构前一致。
- 所有页面路由可正常访问。
- 文档详情页的正文渲染、代码高亮、目录、高亮批注、AI 抽屉行为一致。
- 文档列表页的搜索、筛选、分页、导入、卡片操作一致。
- 知识库问答的会话管理、流式回答、引用展示一致。
- 设置页的 AI 配置保存、测试、清除与索引任务管理一致。
- 异步解析、AI 分析、Embedding 索引流程触发时机与结果一致。

### 11.6 构建验收

- `pnpm build:web` 通过。
- `pnpm build:server` 通过。
- `pnpm build:extension` 通过。

## 12. 风险与处理

### 12.1 拆分后行为回归

风险：

- 大量组件拆分和样式迁移过程中，容易无意中改变交互细节或视觉表现，例如事件绑定丢失、scoped 样式作用域收窄导致样式失效。

处理：

- 每完成一个组件拆分立即运行 `pnpm build:web` 并手动验证该页面。
- 样式迁移采用"先迁组件库、再迁领域、最后迁页面壳"的渐进顺序，每步可独立验证。
- 以"零行为变更"为硬性验收基线，任何视觉或交互差异都视为缺陷。

### 12.2 scoped 样式作用域问题

风险：

- 迁移到 `<style scoped>` 后，原先依赖全局作用域的样式（如作用于 `v-html` 注入内容的 `.markdown-reader` 规则、作用于子组件的类名）可能失效。

处理：

- 作用于 `v-html` 注入内容的规则（`.markdown-reader`）保留在全局，不迁入 scoped。
- 需要穿透子组件时优先通过 props 传递状态，确有必要时使用 `:deep()`。
- 样式迁移后逐一核对页面视觉。

### 12.3 纯函数抽取的响应式边界

风险：

- 把带有 Vue 响应式的逻辑误抽成纯函数，或把本应独立的状态误并入 composable，导致状态共享或响应式失效。

处理：

- 严格区分：纯 DOM 算法与纯数据计算放 `lib`（不依赖 Vue），响应式状态与生命周期放 `composables`。
- composable 内部状态默认每次调用独立创建，避免跨组件意外共享。

### 12.4 后端工具合并的细微差异

风险：

- 各文件原本的 `getErrorMessage` 实现略有差异（如 `api-exception.filter.ts` 还处理 `response` 对象），统一合并可能丢失原有分支。

处理：

- 通用 `getErrorMessage` 只覆盖最常见的 `Error.message` 场景。
- `api-exception.filter.ts` 的特殊处理保留为局部实现或专属函数，不强制合并。
- 每改一个文件运行 `pnpm build:server` 确认类型与逻辑正确。

### 12.5 注释质量失控

风险：

- 补注释时容易滑向"是什么"类的无用注释，增加噪音而非价值。

处理：

- 注释只解释"为什么"和复杂流程要点。
- 简单方法不补注释。
- 补充后通读一遍，删除任何与代码重复的注释。

### 12.6 拆分粒度过细

风险：

- 为了拆分而拆，把只用一次的十几行片段也抽成组件，反而增加理解成本。

处理：

- 遵循"有独立含义、可单独测试、可复用"三选一的抽取判断。
- 单文件 400 行以内的目标，不追求越小越好。
- 跨页复用是抽取的强信号，单页内聚逻辑抽组件需谨慎。

### 12.7 工作量与范围蔓延

风险：

- 四页全拆加样式迁移工作量较大，过程中容易顺手做额外重构，导致范围蔓延和回归风险增加。

处理：

- 严格限定本期只做结构整理和注释，不顺手改交互逻辑。
- 不引入新依赖、新规范工具（如 `class-validator`、CSS Modules）。
- 按"实现步骤"顺序逐步推进，每步可独立构建验证。

## 13. 后续扩展

MVP8 完成后，后续版本可以继续扩展：

- 引入 `class-validator` 和全局 `ValidationPipe`，把 controller 的基础校验从 service 内联判断改为 DTO 装饰器声明
- 为核心 service 与 processor 补充单元测试与集成测试，覆盖解析、归档、问答、索引主流程
- 引入 Pinia 做跨页面状态共享，替代当前页面内 composable，便于列表与详情联动
- 进一步拆分 `lib`，把阅读区渲染、选区算法沉淀为独立可测试模块
- 引入路由级代码分割（动态 import），按页面拆分打包体积
- 把 UI 组件库抽取为独立 workspace package，便于复用与版本管理
- 为 `apps/extension` 做与 Web 端一致的组件拆分与样式整理
- 引入 ESLint 规则限制单文件行数，防止大文件再次出现
- 引入 Stylelint 规则约束三层样式边界
- 把 `markdown-reader` 规则抽取为独立样式文件，与全局布局解耦
- 建立 PR 模板，要求重构类改动附"零行为变更"自检清单
