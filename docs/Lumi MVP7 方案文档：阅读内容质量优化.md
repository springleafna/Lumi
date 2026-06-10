# Lumi MVP7 方案文档：阅读内容质量优化

## 1. 背景

MVP0 已完成 Lumi 的 Monorepo 工程结构搭建；MVP1 打通 Web 端 URL 导入、解析、保存和阅读闭环；MVP2 补全浏览器插件 URL/HTML 导入能力；MVP3 增强文章管理、筛选、归档、回收站和阅读体验；MVP4 建立 Redis + BullMQ 异步任务体系，并加入单篇文章 AI 分析与当前文章问答；MVP5 完成阅读沉淀能力，加入未读/已读、收藏、高亮批注、文件导入、选中内容导入和代码高亮；MVP6 完成知识库级 AI 问答、AI 配置中心、Embedding 索引和索引任务管理。

MVP7 回到 Lumi 作为阅读产品的基础体验：保存下来的文章不仅要“有内容”，还要尽量“提取得准、读得干净、图片长期可用”。

当前阅读内容质量主要存在以下可优化点：

- 正文提取有概率混入导航、页脚、推荐、评论、广告、分享按钮等噪音。
- 标题、作者、发布时间、摘要、封面图等元信息提取准确性仍可提升。
- 正文中的相对链接、懒加载图片、`srcset` / `picture` 多尺寸图片需要更可靠地规范化。
- 文章目录从 Markdown heading 原文生成时，可能混入 `**加粗**`、`[链接](url)`、反引号等 Markdown 标记。
- 原站图片可能因为防盗链、相对路径、资源过期、混合内容或访问权限问题无法展示。

MVP7 的主题是“阅读内容质量优化”，重点围绕正文提取、目录纯净化和图片归档到 RustFS 三条主线展开。

## 2. MVP7 目标

MVP7 聚焦阅读内容质量优化：

- 优化现有 `@lumi/parser`：
  - 减少正文噪音混入。
  - 尽量保留标题层级、段落、列表、引用、表格、代码块、链接、图片说明等正文结构。
  - 优化标题、作者、发布时间、摘要、封面图、来源站点等元信息提取。
  - 规范化正文中的普通链接和图片资源地址。
  - 对明显异常的正文提取结果提供保守兜底。
- 优化文章目录：
  - 前端运行时从渲染后的 `h2 / h3` 节点读取纯文本目录。
  - 去除 Markdown 标记、链接语法、代码符号等目录噪音。
  - 使用运行时顺序锚点并支持平滑滚动。
  - 支持轻量当前阅读位置高亮。
- 支持新导入 URL / HTML 文章图片归档：
  - 使用 RustFS / S3-compatible 对象存储。
  - 通过 `packages/storage` 封装 AWS SDK v3 上传能力。
  - 导入 Worker 在解析阶段同步下载、校验、上传正文图片和封面图。
  - Markdown 图片 URL 和 `coverImage` 尽量替换为 RustFS 公共 URL。
  - 图片归档失败或对象存储未配置时，不阻断文章导入。
  - 新增 `DocumentMediaAsset` 表记录图片归档结果。
- 优化阅读页图片展示：
  - 图片自适应阅读区宽度并保留比例。
  - 支持 `figure / figcaption` 的安全渲染和样式。
  - 图片加载失败时显示轻量占位和当前图片链接。
- 增加 focused 自动化测试：
  - Parser 提取与清洗。
  - 链接和图片候选规范化。
  - 目录纯净化。
  - 图片归档逻辑。
  - 媒体资产记录。

MVP7 完成后，Lumi 将从“能保存和 AI 问答”进一步推进到“保存内容更可靠、阅读正文更干净、图片长期可访问”的个人阅读知识库。

## 3. 非目标

MVP7 暂不包含以下能力：

- 历史文章批量重新提取。
- 历史文章自动重新归档图片。
- 单篇手动重新提取或重新归档入口。
- 媒体资产前端管理页。
- 媒体资产 API。
- 图片压缩、格式转换或 WebP 转码。
- 完整图片查看器，例如大图预览、缩放、下载。
- CSS 背景图片归档。
- Base64 / data URL 图片归档。
- 跨文章全局图片去重。
- 对象存储 Bucket 自动创建。
- 对象存储连接测试 UI。
- 私有 Bucket、签名 URL 或后端图片代理。
- AI 辅助正文清洗。
- 按站点域名配置特殊提取规则。
- RSS / PDF / 视频 / 音频导入质量优化。
- 原始 HTML 快照保留。
- 导入质量提示前端展示。

## 4. 产品语义

### 4.1 阅读内容质量层

MVP7 的优化目标是“阅读内容质量层”，不是新增新的知识组织入口。

阅读内容质量包括：

- 文本正文是否准确。
- 正文结构是否可读。
- 目录是否干净。
- 图片是否能长期展示。
- 普通链接是否可点击。
- 元信息是否尽量准确。

MVP7 不改变 MVP3-MVP6 的归档、回收站、阅读状态、收藏、批注、AI 分析、知识库索引和问答语义。

### 4.2 对新旧文章的影响范围

MVP7 只对新导入 URL / HTML 文章执行新的正文提取和图片归档流程：

- Web URL 导入。
- 浏览器扩展保存当前 URL。
- 浏览器扩展保存完整 HTML。

以下内容暂不进入图片归档流程：

- 选中内容导入 `selection`。
- 本地 `.md` / `.txt` 文件导入。
- MVP7 之前已经存在的历史文章。

文章目录纯净化是前端运行时能力，因此会自然作用于历史文章，但不修改历史文章数据库内容。

### 4.3 图片归档是增强能力

图片归档不应该阻断文章保存。

- 对象存储配置完整时，尽量归档图片。
- 对象存储配置不完整时，跳过归档并保留原始图片链接。
- 单张图片下载、校验或上传失败时，保留该图片原始 URL。
- 超出格式、大小、数量、安全限制的图片，保留原始 URL。

### 4.4 下游 AI 和索引触发顺序

MVP7 后，URL / HTML 文章导入成功链路应保证最终文章内容先落库，再触发下游 AI 分析和知识库索引：

1. Worker 抓取 URL 或接收 HTML。
2. Parser 提取正文、元信息、链接和图片候选。
3. Server 下载并归档图片到 RustFS。
4. 替换 Markdown 图片 URL 和 `coverImage`。
5. 保存最终文章内容和媒体资产记录。
6. 再触发 MVP4 AI 分析和 MVP6 Embedding 索引。

这样可以避免 AI 分析或知识库索引读取到尚未完成归档替换的中间态内容。

## 5. 产品范围

### 5.1 正文提取质量优化

MVP7 采用保守增强现有 `@lumi/parser` 的策略：

- 不引入站点规则机制。
- 不引入 AI 清洗主流程。
- 不替换现有 parser 为全新系统。

正文提取优化覆盖：

- 正文噪音清理：
  - 导航。
  - 页脚。
  - 推荐内容。
  - 评论区。
  - 广告。
  - 分享按钮。
  - 登录提示等非正文块。
- 正文结构保真：
  - 标题层级。
  - 段落。
  - 列表。
  - 引用。
  - 表格。
  - 代码块。
  - 普通链接。
  - 图片和图片说明。
- 元信息提取：
  - 标题。
  - 作者。
  - 发布时间。
  - 摘要。
  - 封面图。
  - 来源站点。
- 链接和资源地址规范化：
  - 普通相对链接转绝对 URL。
  - 图片相对路径转绝对 URL。
  - 懒加载图片地址识别。
  - `srcset` / `picture` 多尺寸图片候选识别。

### 5.2 文章目录纯净化

MVP7 的目录纯净化只在前端运行时处理，不新增数据库字段。

规则：

- 从渲染后的 Markdown DOM 中读取 `h2 / h3`。
- 使用 heading 的 `textContent` 作为目录文本。
- 目录文本不包含 Markdown 标记。
- 少于 2 个 `h2 / h3` 时隐藏目录。
- 给 heading 按顺序生成运行时锚点：

```txt
heading-0
heading-1
heading-2
```

- 点击目录项平滑滚动到对应 heading。
- 阅读滚动时轻量高亮当前所在 heading 对应目录项。

### 5.3 图片归档到 RustFS

MVP7 使用 RustFS 作为 S3-compatible 对象存储。

图片归档范围：

- URL / HTML 新导入文章的正文图片。
- URL / HTML 新导入文章的封面图。

不处理：

- 历史文章。
- selection 文档。
- 本地 `.md` / `.txt` 文件中的远程图片。
- 本地图片文件。
- CSS 背景图片。
- data URL 图片。

RustFS Bucket 策略：

- Bucket 由用户提前在 RustFS 中创建。
- Bucket 需要配置公共读。
- 后端只负责上传对象，不负责创建 Bucket 或配置公共读策略。
- Markdown 中直接写入 RustFS 公共图片 URL。

### 5.4 阅读页图片展示优化

阅读页图片展示做轻量优化：

- 图片默认自适应阅读区宽度。
- 保留图片原始比例。
- 使用 Lumi 阅读页统一的边框、圆角、间距。
- 支持 `figure / figcaption`。
- 图片说明智能显示：
  - 优先显示原文 `figcaption`。
  - 没有 `figcaption` 时，如果 `alt` 或 `title` 是有意义文本，可作为说明显示。
  - 空文本、文件名、`image`、`logo` 等无意义文本不显示。
- 图片加载失败时显示轻量占位：
  - 显示“图片加载失败”。
  - 显示当前图片地址链接。
  - 如果已经归档，则链接为 RustFS URL。
  - 如果归档失败，则链接为原站 URL。

## 6. 正文提取技术方案

### 6.1 Parser 职责

`@lumi/parser` 在 MVP7 中负责：

- 提取正文。
- 清理正文噪音。
- 保留安全阅读结构。
- 提取元信息。
- 规范化普通链接和图片资源地址。
- 发现正文图片和封面图候选。
- 输出可用于归档的图片候选列表。

`@lumi/parser` 不负责：

- 下载图片。
- 上传 RustFS。
- 写数据库媒体资产记录。
- 访问 server `.env`。

### 6.2 元信息提取优先级

元信息采用多来源确定性合并提取，不使用 AI。

建议优先级：

1. JSON-LD。
2. OpenGraph。
3. Twitter Card。
4. 标准 `meta` 标签。
5. `article` 标签和语义 HTML。
6. 正文结构。
7. `document.title`。

可提取字段：

- `title`
- `author`
- `publishedAt`
- `excerpt`
- `coverImage`
- `source`

### 6.3 链接规范化

普通链接规则：

- 正文中的相对链接规范化为绝对 URL。
- 允许协议：
  - `http`
  - `https`
  - `mailto`
  - `tel`
- 禁止或移除：
  - `javascript:`
  - `data:`
  - `file:`
  - `blob:`
  - 其他危险或不可用协议。
- 外部链接统一补：
  - `target="_blank"`
  - `rel="noopener noreferrer"`

图片 URL 规范化规则：

- 基于文章原始 URL 解析相对路径。
- 保留 query。
- 移除 hash。
- 识别 `src`、`data-src`、常见懒加载属性、`srcset`、`picture/source`。
- `srcset / picture` 候选优先选择最高质量图片。

### 6.4 正文异常兜底

如果主提取结果明显异常，使用保守兜底。

触发条件：

- 主提取结果纯文本少于 `200` 字。
- 清洗后 `body` 纯文本至少 `500` 字。
- 清洗后 `body` 纯文本长度达到主提取结果的 `3 倍` 以上。

触发后：

- 使用清洗后的 `body` 内容重新转换 Markdown。
- 如果兜底仍无法得到有效正文，则标记解析失败。

该策略避免因为主提取器漏判导致可读文章保存失败，同时用较严格阈值降低短文章误判概率。

### 6.5 安全 HTML 保留

MVP7 允许 Markdown 中保留少量安全 HTML，用于保持阅读结构，尤其是：

- `figure`
- `figcaption`
- `img`
- `table`
- `thead`
- `tbody`
- `tr`
- `th`
- `td`
- `a`
- `blockquote`
- `pre`
- `code`

禁止：

- `script`
- 事件属性，例如 `onclick`
- 危险协议。
- `style` 属性。
- 原站 `class` 和任意 `data-*` 属性。

后端 / parser 侧使用 `sanitize-html` 做白名单清洗。

前端渲染 Markdown 时继续使用 DOMPurify 做兜底清洗。

### 6.6 `img` 和 `a` 标签属性

`img` 只保留：

- `src`
- `alt`
- `title`
- `loading`

不保留：

- `style`
- `class`
- `onclick`
- `data-*`
- `srcset`
- `width`
- `height`

`a` 只保留：

- `href`
- `title`
- `target`
- `rel`

### 6.7 `contentText` 生成规则

`contentText` 应从最终文章内容中提取“可阅读文本”，用于搜索、AI 分析和知识库索引。

应保留：

- 标题文本。
- 段落文本。
- 列表文本。
- 引用文本。
- 表格文字。
- 代码文字。
- 链接文字。
- `figcaption`。
- 如果没有 `figcaption`，但 `alt/title` 是有意义文本，可以作为图片说明进入 `contentText`。

不应包含：

- 图片 URL。
- HTML 标签残留。
- Markdown 图片语法残留。
- 脚本、样式和不可见内容。

## 7. 图片候选输出设计

Parser 输出的图片候选信息应足够支撑归档、替换和媒体资产记录。

建议类型：

```ts
type ParsedImageCandidate = {
  kind: 'content_image' | 'cover_image';
  sourceUrl: string;
  normalizedUrl: string;
  alt?: string | null;
  title?: string | null;
  caption?: string | null;
  sourceType:
    | 'markdown_image'
    | 'html_img'
    | 'picture_srcset'
    | 'cover_meta';
  occurrenceIndex: number;
  fromSrcset: boolean;
};
```

说明：

- `sourceUrl` 保存原始页面中的地址。
- `normalizedUrl` 保存规范化后的绝对地址。
- `kind` 区分正文图片和封面图。
- `sourceType` 用于排查图片来源。
- `occurrenceIndex` 表示正文中出现顺序。
- `fromSrcset` 标识是否来自 `srcset / picture` 候选。

## 8. 图片归档技术方案

### 8.1 归档时机

图片归档发生在 Worker 解析阶段，且在最终文章内容保存前完成。

流程：

1. Worker 解析 URL / HTML。
2. Parser 输出 Markdown、元信息、`contentText`、图片候选。
3. Server 读取对象存储配置。
4. 如果配置不完整：
   - 不下载图片。
   - 媒体资产记录为 `skipped`。
   - reason 为 `storage_not_configured`。
   - Markdown 和 `coverImage` 保留原始 URL。
5. 如果配置完整：
   - 下载图片。
   - 校验安全边界、格式、大小。
   - 上传 RustFS。
   - 生成公共 URL。
   - 替换 Markdown 图片地址和 `coverImage`。
6. 在同一个数据库事务中更新文章内容和媒体资产记录。
7. 触发 AI 分析和 Embedding 索引。

### 8.2 对象命名

RustFS object key 采用：

```txt
users/{userId}/documents/{documentId}/images/{sha256}.{ext}
```

规则：

- `sha256` 为图片内容 hash。
- 扩展名根据响应 `Content-Type` 和文件魔数确定。
- URL 后缀只作为兜底。
- 不保留原始文件名。

### 8.3 公共 URL 拼接

`OBJECT_STORAGE_PUBLIC_BASE_URL` 表示 Bucket 的公共访问根地址。

例如：

```env
OBJECT_STORAGE_BUCKET=lumi
OBJECT_STORAGE_PUBLIC_BASE_URL=https://assets.example.com/lumi
```

最终图片 URL：

```txt
https://assets.example.com/lumi/users/{userId}/documents/{documentId}/images/{sha256}.jpg
```

后端只需要将 `OBJECT_STORAGE_PUBLIC_BASE_URL` 和 object key 拼接。

### 8.4 图片类型和限制

支持归档：

- `jpg`
- `jpeg`
- `png`
- `webp`
- `gif`
- `avif`

跳过：

- `svg`
- 未知类型。
- data URL。
- CSS 背景图片。

限制：

- 单张图片最大 `10MB`。
- 正文图片单篇最多处理 `60` 张。
- 封面图独立处理，不计入正文 `60` 张限制。
- 不设置单篇总下载大小上限。
- 不压缩。
- 不转换格式。
- 原样上传。

图片大小限制使用下载前后双重限制：

- 如果 `Content-Length` 已超过 `10MB`，直接跳过并记录 `too_large`。
- 如果没有 `Content-Length` 或不可信，下载过程中累计字节数。
- 一旦超过 `10MB`，立即中止下载并记录 `too_large`。

### 8.5 下载策略

图片下载采用保守稳定策略：

- 单张下载超时 `10s`。
- 最多重定向 `3` 次。
- 单篇并发下载 `3` 张。
- 失败不重试。
- 使用内存 Buffer 处理下载结果。

下载请求头：

- 使用原文章 URL 作为 `Referer`。
- 使用常见浏览器 `User-Agent`。

### 8.6 下载安全边界

只允许公开 `http / https` 图片资源。

禁止：

- `localhost`
- `127.0.0.1`
- `::1`
- 内网 IP。
- 链路本地地址。
- 私有地址。
- `file://`
- `blob:`
- 非网络协议。

每次重定向后都需要重新校验：

- 初始 URL。
- 每一次重定向 URL。
- 最终下载 URL。

如果重定向跳到不允许的地址，记录 `redirect_blocked`。

### 8.7 格式校验

图片格式校验以响应 `Content-Type` 为主，结合文件魔数校验，URL 后缀只作为兜底。

目的：

- 避免把 HTML 错误页上传为图片。
- 避免把脚本或其他非图片内容上传到 RustFS。
- 兼容部分无后缀图片 CDN。

如果 MIME 和文件内容不匹配，记录 `mime_mismatch`。

### 8.8 `srcset / picture` 候选选择

遇到 `srcset / picture` 多尺寸图片时，优先选择最高质量候选图：

- 有宽度描述时，选择最大宽度。
- 有倍率描述时，选择最高倍率。
- 仍受单张 `10MB` 限制。
- 下载或校验失败时保留原始链接，不阻断导入。

### 8.9 data URL 处理

MVP7 暂不归档 Base64 / data URL 图片。

规则：

- 发现 `data:image/...;base64,...` 时记录媒体资产。
- 状态为 `skipped`。
- reason 为 `data_url_not_supported`。
- 正文中保留原始 data URL。
- 不阻断文章导入。

### 8.10 同篇文章内去重

MVP7 只做同一篇文章内去重，不做跨文章全局去重。

去重规则：

1. 先按 `normalizedUrl` 去重：
   - 同一个 URL 只下载一次。
   - 同一个 URL 多次出现时，媒体资产 `occurrenceCount` 增加。
2. 再按内容 hash 去重：
   - 不同 URL 下载后如果内容 hash 相同，只上传一次。
   - 多个 URL 复用同一个 `objectKey / publicUrl`。

媒体资产记录规则：

- 不同 URL 即使内容相同，也各记录一条媒体资产。
- 这些记录可以复用同一个 `objectKey / publicUrl`。

### 8.11 封面图处理

封面图也尽量归档到 RustFS。

规则：

- 封面图独立处理，不计入正文 60 张限制。
- 如果封面图和正文图片 URL 相同，避免重复下载。
- 如果封面图和正文图片内容 hash 相同，复用同一个对象。
- 媒体资产表分别记录：
  - `kind = cover_image`
  - `kind = content_image`
- 两条记录可以复用相同 `objectKey / publicUrl`。

### 8.12 Markdown 替换规则

图片归档成功后，只替换图片 URL，保留原有语义：

- 保留 alt 文本。
- 保留 title。
- 保留 `figure / figcaption`。
- 不追加“已归档”等标记。

示例：

```md
![原来的说明](https://old.example.com/a.png "原来的标题")
```

替换为：

```md
![原来的说明](https://assets.example.com/lumi/users/u1/documents/d1/images/hash.png "原来的标题")
```

### 8.13 上传缓存策略

上传 RustFS 时设置长缓存：

```http
Cache-Control: public, max-age=31536000, immutable
```

原因：

- object key 使用内容 hash。
- 图片对象可视为不可变资源。
- 适合公共读 Bucket。

## 9. 对象存储配置

### 9.1 环境变量

MVP7 使用通用 S3-compatible 对象存储配置，不使用 RustFS 专属命名。

必填：

```env
OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_PUBLIC_BASE_URL=
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=
```

可选：

```env
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_FORCE_PATH_STYLE=true
```

说明：

- `OBJECT_STORAGE_ENDPOINT`：RustFS / S3-compatible 服务 endpoint。
- `OBJECT_STORAGE_BUCKET`：提前创建并配置公共读的 Bucket。
- `OBJECT_STORAGE_PUBLIC_BASE_URL`：Bucket 公共访问根地址。
- `OBJECT_STORAGE_ACCESS_KEY_ID`：上传访问密钥 ID。
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`：上传访问密钥。
- `OBJECT_STORAGE_REGION`：默认 `us-east-1`。
- `OBJECT_STORAGE_FORCE_PATH_STYLE`：默认 `true`，适配 RustFS / MinIO 等自部署对象存储。

### 9.2 示例配置

```env
OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000
OBJECT_STORAGE_BUCKET=lumi
OBJECT_STORAGE_PUBLIC_BASE_URL=https://assets.example.com/lumi
OBJECT_STORAGE_ACCESS_KEY_ID=your-access-key
OBJECT_STORAGE_SECRET_ACCESS_KEY=your-secret-key
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_FORCE_PATH_STYLE=true
```

### 9.3 配置完整性

只有以下配置全部存在时，才启用图片归档：

- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_PUBLIC_BASE_URL`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`

如果配置不完整：

- 文章仍然正常导入。
- 图片保留原始 URL。
- 媒体资产记录为 `skipped`。
- reason 为 `storage_not_configured`。

### 9.4 Bucket 初始化

MVP7 要求用户提前在 RustFS 中创建 Bucket，并配置公共读策略。

后端不负责：

- 创建 Bucket。
- 修改 Bucket 策略。
- 检查公共读是否真的可用。

如果 Bucket 不存在或权限不足：

- 上传会失败。
- 单张图片记录为 `failed`。
- reason 为 `upload_failed`。
- 保留原图 URL。
- 不阻断文章导入。

## 10. `packages/storage` 设计

MVP7 将对象存储能力放到 `packages/storage`。

该包从占位包升级为通用 S3-compatible 存储客户端。

使用依赖：

- `@aws-sdk/client-s3`

职责：

- 读取或接收对象存储配置。
- 创建 S3 client。
- 上传对象。
- 删除对象。
- 生成公共 URL。
- 设置 `Content-Type`。
- 设置 `Cache-Control`。
- 支持 `endpoint`。
- 支持 `forcePathStyle`。

不负责：

- 下载远程图片。
- 判断图片是否安全。
- 解析 Markdown。
- 写数据库。

建议导出能力：

```ts
type ObjectStorageConfig = {
  endpoint: string;
  bucket: string;
  publicBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  forcePathStyle: boolean;
};

type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
};

type PutObjectResult = {
  key: string;
  publicUrl: string;
};
```

## 11. 数据模型

### 11.1 新增 Prisma 模型

MVP7 新增 `DocumentMediaAsset`。

建议模型：

```prisma
model DocumentMediaAsset {
  id String @id @default(cuid())

  kind   DocumentMediaKind
  status DocumentMediaStatus
  reason DocumentMediaReason?

  sourceUrl     String
  normalizedUrl String
  objectKey     String?
  publicUrl     String?

  mimeType        String?
  sizeBytes       Int?
  contentHash     String?
  occurrenceCount Int     @default(1)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId     String
  user       User     @relation(fields: [userId], references: [id])

  @@unique([documentId, kind, normalizedUrl])
  @@index([userId, status, createdAt])
  @@index([documentId])
  @@index([contentHash])
  @@index([objectKey])
}
```

### 11.2 新增枚举

```prisma
enum DocumentMediaKind {
  content_image
  cover_image
}

enum DocumentMediaStatus {
  succeeded
  failed
  skipped
}

enum DocumentMediaReason {
  storage_not_configured
  unsupported_type
  data_url_not_supported
  over_limit
  invalid_url
  blocked_private_ip
  redirect_blocked
  download_timeout
  download_failed
  too_large
  mime_mismatch
  upload_failed
  unknown
}
```

### 11.3 字段语义

- `kind`：
  - `content_image`：正文图片。
  - `cover_image`：封面图。
- `status`：
  - `succeeded`：已归档并写入 RustFS URL。
  - `failed`：尝试处理但失败。
  - `skipped`：按规则跳过。
- `reason`：
  - 跳过或失败原因。
- `sourceUrl`：
  - 页面中发现的原始 URL。
- `normalizedUrl`：
  - 规范化后的 URL。
- `objectKey`：
  - RustFS object key。
- `publicUrl`：
  - RustFS 公共访问 URL。
- `mimeType`：
  - 实际识别的图片 MIME。
- `sizeBytes`：
  - 图片大小。
- `contentHash`：
  - 图片内容 sha256。
- `occurrenceCount`：
  - 同一文档内同一 `kind + normalizedUrl` 出现次数。

### 11.4 唯一性

同一篇文档内按 `kind + normalizedUrl` 唯一。

含义：

- 同一篇文章里同一个正文图片 URL 只记录一条。
- 同一个 URL 多次出现，用 `occurrenceCount` 表示。
- 不同 URL 即使内容相同，也各记录一条。
- 不同 URL 可复用同一个 `objectKey / publicUrl`。

## 12. 后端改动

### 12.1 Parser 集成

Server 在 URL / HTML Worker 解析流程中使用增强后的 parser 输出：

- Markdown。
- `contentText`。
- 元信息。
- 图片候选列表。

### 12.2 媒体归档服务

建议在 `apps/server` 中新增媒体归档服务，例如 `MediaArchiveService`。

职责：

- 读取对象存储配置。
- 判断配置完整性。
- 接收图片候选列表。
- 按规范化 URL 去重。
- 按数量限制跳过超出正文图片。
- 下载图片。
- 做安全校验。
- 做类型和大小校验。
- 调用 `packages/storage` 上传。
- 生成媒体资产记录草稿。
- 生成 Markdown URL 替换映射。
- 生成 `coverImage` 替换结果。

### 12.3 数据库事务

图片下载和上传发生在数据库事务外。

得到最终归档结果后，在同一个数据库事务中：

- 更新 `Document.markdown`。
- 更新 `Document.contentText`。
- 更新 `Document.coverImage`。
- 写入或更新 `DocumentMediaAsset`。
- 标记文档 `ingestStatus = succeeded`。

如果数据库事务失败，可能留下少量 RustFS 孤儿对象。MVP7 暂不实现孤儿对象清理任务。

### 12.4 永久删除清理

文章归档、取消归档、软删除、恢复都不删除 RustFS 图片。

只有永久删除文章时：

- 查找该文章关联的成功归档媒体资产。
- 尽力删除对应 RustFS object。
- 删除失败只记录日志。
- 不阻断文章永久删除。

Prisma relation 使用 `onDelete: Cascade` 删除媒体资产记录。

### 12.5 API

MVP7 不新增媒体资产 API。

媒体资产表只作为内部记录使用：

- 前端不查询媒体资产。
- 不提供媒体资产列表。
- 不提供媒体资产筛选。
- 不提供单篇媒体资产详情。

## 13. 前端改动

### 13.1 目录纯净化

文章详情页 Markdown 渲染完成后：

- 查找正文区域内的 `h2 / h3`。
- 读取 `textContent`。
- 过滤空标题。
- 按顺序写入运行时 id。
- 构建目录数据。
- 少于 2 个目录项时隐藏目录。
- 目录点击时平滑滚动。
- 监听滚动位置并高亮当前目录项。

### 13.2 图片展示样式

阅读页 `.markdown-reader` 增加图片样式：

- `img` 最大宽度 `100%`。
- 高度自适应。
- 块级居中展示。
- 使用轻量边框 / 圆角。
- 与正文保持合适间距。

`figure`：

- 统一外边距。
- 图片居中。
- `figcaption` 使用弱化文字样式。
- 不使用原站样式。

### 13.3 图片加载失败占位

阅读页监听图片加载失败：

- 隐藏失败图片或替换为占位块。
- 占位块显示“图片加载失败”。
- 提供当前图片 `src` 链接。
- 不额外请求媒体资产 API。

## 14. 测试计划

MVP7 增加 focused 自动化测试。

测试样例使用合成 HTML / Markdown fixtures，不使用完整真实网页快照。

### 14.1 Parser 测试

覆盖：

- 噪音清理。
- 正文结构保留。
- 标题层级。
- 段落。
- 列表。
- 引用。
- 表格。
- 代码块。
- `figure / figcaption`。
- 标题、作者、发布时间、摘要、封面图提取。
- 普通链接规范化。
- 图片链接规范化。
- `srcset / picture` 最高质量候选选择。
- 正文异常兜底阈值。

### 14.2 HTML 安全清洗测试

覆盖：

- 移除 `script`。
- 移除事件属性。
- 移除 `style`。
- 移除不允许协议。
- 保留安全 `figure / img / figcaption / table / a`。
- `img` 只保留允许属性。
- `a` 只保留允许属性并补安全 `target / rel`。

### 14.3 目录测试

覆盖：

- Markdown 标记不会进入目录文本。
- 只收集 `h2 / h3`。
- 少于 2 个目录项时隐藏。
- 重复标题使用运行时顺序锚点。
- 点击目录能定位到对应 heading。

### 14.4 媒体归档测试

使用 mock 下载器和 mock 对象存储，不真实上传 RustFS。

覆盖：

- 对象存储未配置时记录 `storage_not_configured`。
- 成功上传后替换 Markdown URL。
- 封面图归档。
- 正文图片数量超过 60 后记录 `over_limit`。
- data URL 记录 `data_url_not_supported`。
- 不支持类型记录 `unsupported_type`。
- 超过 10MB 记录 `too_large`。
- MIME 不匹配记录 `mime_mismatch`。
- 下载失败记录 `download_failed`。
- 上传失败记录 `upload_failed`。
- 同一 URL 去重。
- 不同 URL 相同内容 hash 复用对象。
- Markdown alt/title 保留。

### 14.5 构建验证

实现完成后至少运行：

```powershell
pnpm build:server
pnpm build:web
pnpm build:extension
```

根据实际改动可补充 package-level 测试脚本。

## 15. 实现步骤

建议按以下顺序实现：

1. 编写 MVP7 方案文档。
2. 更新 `.env.example`：
   - 增加对象存储配置。
   - 明确必填 / 可选 / 默认值。
   - 明确 `OBJECT_STORAGE_PUBLIC_BASE_URL` 是 Bucket 公共访问根地址。
3. 更新 README 和 AGENTS 的计划项，最终实现完成后同步 MVP7 能力说明。
4. 为 `packages/storage` 增加 AWS SDK v3 依赖。
5. 实现 S3-compatible 上传 / 删除 / public URL 拼接。
6. 为 `@lumi/parser` 增加 `sanitize-html`。
7. 优化 parser 正文噪音清理。
8. 优化 parser 元信息提取。
9. 实现普通链接规范化。
10. 实现图片 URL 规范化。
11. 实现 `srcset / picture` 候选选择。
12. 实现 `figure / figcaption` 安全保留。
13. 实现正文异常兜底。
14. 实现可阅读 `contentText` 提取。
15. 扩展 parser 输出图片候选列表。
16. 更新 `packages/shared` 类型。
17. 更新 Prisma schema：
    - `DocumentMediaAsset`。
    - `DocumentMediaKind`。
    - `DocumentMediaStatus`。
    - `DocumentMediaReason`。
    - `Document` / `User` relation。
18. 执行 Prisma migration。
19. 实现 server 对象存储配置读取。
20. 实现远程图片下载器：
    - 超时。
    - 重定向限制。
    - 私有地址阻断。
    - `Referer` 和 `User-Agent`。
    - 大小限制。
21. 实现图片格式和魔数校验。
22. 实现媒体归档服务。
23. 实现 Markdown 图片 URL 替换。
24. 实现 HTML `<img>` `src` 替换兜底。
25. 实现封面图归档。
26. 实现同篇文章内 URL 去重和内容 hash 去重。
27. 在 URL / HTML Worker 解析流程中接入媒体归档。
28. 调整 AI 分析和 Embedding 索引触发时机，确保最终内容落库后触发。
29. 永久删除文章时尽力删除 RustFS 对象。
30. Web 文章详情页重做目录生成：
    - `h2 / h3`。
    - `textContent`。
    - 顺序锚点。
    - 少于 2 个隐藏。
    - 当前阅读位置高亮。
31. Web 阅读页增加图片、figure、figcaption 样式。
32. Web 阅读页增加图片加载失败占位。
33. 增加 parser focused tests。
34. 增加媒体归档 focused tests。
35. 增加目录纯净化测试。
36. 运行构建：
    - `pnpm build:server`
    - `pnpm build:web`
    - `pnpm build:extension`
37. 手动验收 MVP7。

## 16. 验收标准

MVP7 完成后需要满足以下模块验收和端到端验收。

### 16.1 Parser 验收

- 新导入 URL / HTML 文章仍可正常解析保存。
- 正文噪音比 MVP6 更少。
- 导航、页脚、推荐、评论、广告、分享按钮尽量不进入正文。
- 标题层级、段落、列表、引用、表格、代码块尽量保留。
- `figure / figcaption` 可被安全保留。
- 普通相对链接可规范化为绝对 URL。
- 普通链接只允许安全协议。
- 外部链接补 `target="_blank"` 和 `rel="noopener noreferrer"`。
- 图片相对地址可规范化为绝对 URL。
- 懒加载图片地址可被识别。
- `srcset / picture` 选择最高质量候选。
- 元信息提取覆盖 JSON-LD、OpenGraph、Twitter Card、标准 meta、article 结构和 document title。
- 主正文少于 200 字且 body 明显更长时触发兜底。
- 兜底失败时仍能标记解析失败。
- `contentText` 不包含图片 URL 和 HTML 标签残留。

### 16.2 目录验收

- 目录只显示 `h2 / h3`。
- 目录文本来自 heading `textContent`。
- 目录中不出现 Markdown 标记。
- 目录中不出现链接 Markdown 语法。
- 目录中不出现代码反引号。
- 少于 2 个目录项时隐藏目录。
- 重复标题不影响点击定位。
- 点击目录项可平滑滚动到对应 heading。
- 滚动阅读时当前目录项轻量高亮。

### 16.3 图片归档验收

- 对象存储配置完整时，新导入 URL / HTML 文章正文图片会尝试归档。
- 对象存储配置完整时，新导入 URL / HTML 文章封面图会尝试归档。
- 成功归档的图片 URL 替换为 RustFS 公共 URL。
- `coverImage` 成功归档后替换为 RustFS 公共 URL。
- 图片归档失败不阻断文章导入。
- 对象存储未配置不阻断文章导入。
- 对象存储未配置时记录 `storage_not_configured`。
- 不支持格式记录 `unsupported_type`。
- data URL 记录 `data_url_not_supported`。
- 正文图片超过 60 张后记录 `over_limit`。
- 私有地址或本机地址被阻断。
- 重定向到私有地址被阻断。
- 下载超时记录 `download_timeout`。
- 下载失败记录 `download_failed`。
- 单张超过 10MB 记录 `too_large`。
- MIME 不匹配记录 `mime_mismatch`。
- 上传失败记录 `upload_failed`。
- 同一规范化 URL 只下载一次。
- 不同 URL 相同内容 hash 只上传一次。
- 不同 URL 相同内容 hash 分别记录媒体资产，并复用 `objectKey / publicUrl`。
- 上传对象使用 `Cache-Control: public, max-age=31536000, immutable`。
- object key 使用 `users/{userId}/documents/{documentId}/images/{sha256}.{ext}`。

### 16.4 媒体资产验收

- Prisma 中存在 `DocumentMediaAsset`。
- Prisma 中存在 `DocumentMediaKind`。
- Prisma 中存在 `DocumentMediaStatus`。
- Prisma 中存在 `DocumentMediaReason`。
- 同一文档内 `kind + normalizedUrl` 唯一。
- 成功、失败、跳过的图片都可记录。
- 媒体资产按用户和文档隔离。
- MVP7 不新增媒体资产 API。
- 永久删除文章时尽力删除成功归档的 RustFS 对象。
- RustFS 删除失败不阻断文章永久删除。

### 16.5 阅读页图片验收

- 图片自适应阅读区宽度。
- 图片保留比例。
- `figure / figcaption` 有统一阅读样式。
- 有意义图片说明可以展示。
- 无意义 alt/title 不强行展示。
- 图片加载失败时显示轻量占位。
- 破图占位提供当前图片地址链接。
- 不提供完整图片查看器。

### 16.6 端到端验收

- 导入一篇包含标题、正文、表格、代码块、图片、figcaption、相对链接的 URL 文章后：
  - 文章解析成功。
  - 正文干净可读。
  - 普通链接可点击。
  - 目录纯净。
  - 图片能展示。
  - 成功归档图片使用 RustFS URL。
  - 媒体资产表记录处理结果。
  - AI 分析在最终内容保存后触发。
  - 知识库索引在最终内容保存后触发。
- 对象存储未配置时：
  - 同一文章仍能保存成功。
  - 图片保留原始 URL。
  - 媒体资产记录为 `skipped`。
- `pnpm build:server` 通过。
- `pnpm build:web` 通过。
- `pnpm build:extension` 通过。

## 17. 风险与处理

### 17.1 Parser 优化导致正文误删

风险：

- 噪音清理规则过强时，可能误删正文。

处理：

- 使用 focused fixtures 覆盖常见正文结构。
- 优先使用保守规则。
- 异常兜底只在严格阈值下触发。
- 不引入站点特例，避免规则过早复杂化。

### 17.2 图片下载造成 SSRF 风险

风险：

- 远程图片 URL 可能指向本机、内网或通过重定向跳转到私有地址。

处理：

- 只允许公开 `http / https`。
- 校验初始 URL、每次重定向 URL 和最终 URL。
- 阻止 localhost、回环地址、内网地址和非网络协议。
- 限制重定向次数。

### 17.3 图片归档拖慢导入 Worker

风险：

- 多图文章可能使 Worker 处理时间变长。

处理：

- 单篇正文图片最多处理 60 张。
- 单张下载超时 10 秒。
- 单篇并发下载 3 张。
- 失败不重试。
- 图片失败不阻断导入。

### 17.4 RustFS 配置错误导致图片归档不可用

风险：

- Bucket 未创建、权限不足、公共读配置不正确、public base 配错。

处理：

- 对象存储是增强能力。
- 配置不完整时自动跳过。
- 上传失败时保留原图 URL。
- 文档和 `.env.example` 明确配置含义。
- 后续版本可增加对象存储测试入口。

### 17.5 数据库事务失败留下孤儿对象

风险：

- 图片已上传 RustFS，但数据库事务失败，可能留下孤儿对象。

处理：

- MVP7 暂不实现孤儿对象清理任务。
- 由于单篇图片数量有限，风险可接受。
- 后续可增加对象存储清理工具。

### 17.6 公共读 Bucket 带来隐私风险

风险：

- RustFS 图片 URL 理论上可被外部访问。

处理：

- MVP7 明确采用公共读 Bucket，以换取实现简单和稳定展示。
- 后续如需隐私控制，可升级为签名 URL 或后端图片代理。

### 17.7 HTML 安全清洗遗漏

风险：

- 允许 `figure / img / figcaption / table / a` 等 HTML 后，存在安全清洗遗漏风险。

处理：

- 后端保存前使用 `sanitize-html` 白名单清洗。
- 前端渲染前使用 DOMPurify 兜底。
- 不允许 `style`、事件属性、危险协议、原站 class 和 `data-*`。

## 18. 后续扩展

MVP7 完成后，后续版本可以继续扩展：

- 单篇手动重新提取。
- 单篇手动重新归档图片。
- 批量历史文章重处理。
- 媒体资产前端列表和筛选。
- 文章导入质量提示。
- 对象存储连接测试入口。
- 私有 Bucket + 签名 URL。
- 后端图片代理和权限控制。
- 图片压缩和 WebP 转换。
- 大图预览、缩放、下载。
- data URL 小图归档。
- SVG 安全清洗和归档。
- 真实网页快照回归测试。
- 孤儿对象清理任务。
- 跨文章全局图片去重。
