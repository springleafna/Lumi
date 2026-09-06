# Lumi MVP9 方案文档：B站视频字幕导入与总结

## 1. 背景

MVP0-MVP8 已完成 Lumi 的图文导入、阅读管理、AI 阅读助手、知识库问答等闭环，`DocumentType` 中的 `video` 类型一直处于预留状态。本次 MVP9 将视频内容纳入知识库：用户提交 B 站视频链接后，系统异步解析视频元数据与字幕，将字幕归一为 Transcript，交给 LLM 生成带时间锚点的结构化总结，并在阅读端提供「读总结 + 跳回视频验证」的闭环。

总体原则：**字幕优先、视频不落盘**。M1 只处理有字幕的视频（无语音转写），视频文件本身永远不作为知识内容保存，避免带宽与存储开销。

## 2. MVP9（M1 期）目标

- 支持通过现有统一导入入口提交 B 站视频链接（含 `b23.tv` 短链），服务端自动分流到视频管线，前端与扩展零改动。
- 使用 yt-dlp 获取视频元数据（标题、UP 主、时长、封面）与字幕，归一为统一 Transcript。
- 通过 Cookie 文件支持 B 站 AI 字幕获取；Cookie 过期时快速失败并给出明确提示。
- 超过时长上限的视频在解析阶段直接拒绝。
- 将 Transcript 分块交给 LLM map-reduce，产出结构化 Markdown 总结（章节 + 要点 + `[mm:ss]` 时间锚点）与 AI 阅读卡。
- Web 阅读端：视频卡片（封面 + 时长）、封面式播放器（点击加载 B 站 iframe）、时间锚点点击跳转、右侧目录变为章节时间轴、AI 抽屉新增字幕面板。
- 单视频 AI 问答上下文 = 总结 + 全量 Transcript。

## 3. 非目标（M1 明确不做）

- YouTube 及其他平台（M2 后按需扩展，平台识别层已预留）。
- 语音转写（ASR）兜底，M2 实现；M1 无字幕视频按解析失败处理。
- 移动端任何改动：视频文档在移动端按普通 Markdown 文档阅读。
- 字幕的划词批注（批注锚定机制基于正文字符偏移，字幕需另做锚定）。
- 视频下载、转码、本地存储。
- 字幕/视频入向量库的全文分块索引（M1 沿用现有管线只索引总结 Markdown，M3 再做 Transcript 分块索引）。
- 多 P 选集交互：URL 带 `?p=N` 就取第 N 分 P，不带默认 P1。

## 4. 已确认的产品决策

以下决策在方案讨论与需求拷打中逐项确认：

| # | 决策项 | 结论 |
| --- | --- | --- |
| 1 | 导入入口 | 统一入口 + 服务端按域名白名单自动分流，前端与扩展零改动 |
| 2 | 无字幕视频 | 按「解析失败」处理：文档保留、可重试，不做半成品文档 |
| 3 | AI 问答上下文 | 总结 + 全量 Transcript 进 prompt（视频专用截断上限），不做检索 |
| 4 | 重复导入判重 | 按「BV 号 + 分 P」判重，复用文章三态去重（幂等返回 / 复活重试 / 新建） |
| 5 | 移动端 | M1 零改动 |
| 6 | 平台范围 | 仅 B 站；不带 YouTube |
| 7 | Cookie 方案 | `.env` 配置 cookie 文件路径，yt-dlp `--cookies` 加载；过期主动探测、快速失败 |
| 8 | 时长上限 | 60 分钟，解析阶段拦截，环境变量可配 |

实现层细节由开发拍板，文档中已写明理由：

- **Transcript 存储**：独立 `VideoTranscript` 表 + JSONB segments 列。单文档原子读取、无 join，60 分钟视频约数百至上千条 segments，JSONB 完全够用；M3 向量分块在内存中按句窗切分，不依赖行级存储。
- **封面图热链**：直接使用 B 站 CDN 封面 URL，不做对象存储归档。B 站封面无防盗链，即使失效也只是封面缺失，不影响内容。
- **时间锚点格式**：`[mm:ss]`。60 分钟上限内无歧义。
- **锚点防编造**：map 阶段为每个分块标注起止时间并约束 LLM 只能引用范围内时间；reduce 后对全部锚点做后校验（匹配不到时吸附到最近 segment，仍无效则删除锚点）。
- **AI 阅读卡与正文同源**：map-reduce 的最终产出同时包含正文 Markdown 与 `aiAnalysis` 卡字段（一句话总结、关键点等），避免两次完整摘要。
- **导入弹窗文案**：标题与提示从「导入文章」改为「导入」，URL 提示注明支持文章与 B 站视频链接。

## 5. 产品语义

### 5.1 导入

- Web 端「导入」弹窗（原导入文章弹窗）与浏览器扩展 popup 的 URL 提交行为不变。
- 服务端对 URL 做平台识别：`www.bilibili.com`、`m.bilibili.com`、`b23.tv` 命中视频分支；其余 URL 走文章管线。
- 视频导入成功创建占位文档（`type=video`，标题暂为「B站视频 BV1xxx」），toast 与跳转行为与文章导入一致。

### 5.2 列表

- 视频卡片与文章卡片同网格展示，类型徽章显示「视频」；有封面时显示封面缩略图与时长角标（如 `23:41`）。
- 未读/已读、收藏、标签、归档、回收站、搜索行为与文章完全一致。

### 5.3 详情页

- 页面骨架（标题、徽章、操作按钮、正文、右侧目录、AI 抽屉）不变。
- 正文顶部新增「视频头卡」：封面图 + 播放按钮 + 时长 + 来源（哔哩哔哩）+ 打开原视频链接。点击封面原地替换为 B 站 iframe 播放器（`player.bilibili.com`，`autoplay=0`），从指定秒数开始播放。
- 正文为结构化总结 Markdown；正文中的 `[mm:ss]` 锚点渲染为可点击元素，点击后让头卡播放器 seek 到对应位置。
- 右侧目录展示 LLM 生成的章节（带时间戳），点击行为 = 滚动正文 + 播放器 seek。无章节时目录为空，布局自动回退单列（复用现有 `has-toc` 逻辑）。
- AI 抽屉新增「字幕」面板：按时间列出 Transcript 句子，支持简单文本过滤，点击某句 seek 播放器。划词批注仍只作用于总结正文。
- 打开解析成功且未读的视频文档同样自动标记为已读（沿用现有逻辑）。

### 5.4 解析失败态

沿用文章解析失败的展示与交互：卡片与详情页显示失败原因，详情页可「重新解析」。失败文案见 §9.5。

## 6. 数据模型

### 6.1 Document 表新增列

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `videoPlatform` | `String?` | 视频平台标识，M1 固定 `bilibili`；非视频文档为空。为后续多平台预留 |
| `videoDurationSeconds` | `Int?` | 视频时长（秒），解析阶段写入，列表角标与上限校验使用 |

复用现有列：`url`（存规范化后的 B 站链接，作为判重键）、`coverImage`（封面热链）、`author`（UP 主）、`source`（固定「哔哩哔哩」）、`markdown`（总结正文）、`wordCount`（总结字数）。

### 6.2 新表 VideoTranscript

```prisma
model VideoTranscript {
  id         String   @id @default(cuid())
  documentId String   @unique
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  provider   String   // 字幕来源：bilibili-cc / bilibili-ai（M2 增加 asr-*）
  language   String   // 字幕语言代码，如 ai-zh、zh-CN
  segments   Json     // [{ start: number(秒), end: number, text: string }]
  fetchedAt  DateTime
  createdAt  DateTime @updatedAt? // 按项目惯例定
}
```

- 与 Document 1:1，级联删除（永久删除文档时随文档清理，无需额外清理任务）。
- `segments` 结构：`[{ "start": 12.4, "end": 15.2, "text": "..." }]`，时间统一为秒（浮点）。

### 6.3 DTO（packages/shared 先行）

- `DocumentDetail` 增加 `videoPlatform`、`videoDurationSeconds` 可空字段；`DocumentSummary` 同步增加（列表角标需要）。
- 新增 `TranscriptSegmentDto`、`VideoTranscriptDto`；`api-client` 新增 `documents.getTranscript(id)`。
- 同步 web / api-client；mobile 不改。

## 7. 导入与判重（API 层）

### 7.1 URL 识别与规范化

- 新增平台识别函数：host 白名单（`www.bilibili.com`、`m.bilibili.com`、`b23.tv`）+ 路径匹配 `/video/BVxxxx` 或 `/video/avxxx`。
- `b23.tv` 短链在导入请求内同步展开重定向（超时约 5s），失败返回错误「B站短链无法解析，请检查链接是否有效」。
- 提取 BV 号与 `p` 参数，规范化 URL 写回文档：`https://www.bilibili.com/video/BV1xxx`（`p=1` 或无参数时不带参数，`p=N`（N>1）保留 `?p=N`）。
- 不匹配 B 站的 URL 原样走文章管线，行为不变。

### 7.2 三态判重

复用 `createQueuedIngest` 的现有语义，判重键为 `userId + 规范化 URL + type=video`：

1. 已存在且成功且未删除 → 不重复导入，直接返回已有文档（幂等）。
2. 已存在但失败 / 在回收站 → 复活该文档（清 `deletedAt`、重置 `ingestStatus=pending`），重新排队。
3. 不存在 → 创建占位文档并入队。

入队 job type：`ingest:video`（新增，与 `ingest:url` / `ingest:html` 并列）。

## 8. 解析管线（Worker）

`ingest:video` job 的执行步骤：

```
1. 读取 job + document
2. Cookie 登录态探测（配置了 BILI_COOKIE_FILE 时）
     └─ GET api.bilibili.com/x/web-interface/nav（带 cookie）
        isLogin=false → 失败：「B站 Cookie 已过期，请替换 cookie 文件后重试」
3. yt-dlp 获取元数据（execFile，参数数组，超时约 60s）
     yt-dlp -J --no-playlist [--cookies <file>] <canonical-url>
4. 时长拦截：duration > VIDEO_MAX_DURATION_MINUTES * 60
     → 失败：「视频时长超过 60 分钟上限」
5. 字幕挑选：CC 字幕（zh 系）优先，其次自动字幕（ai-zh 等）
     └─ 两者皆无 → 失败：「未找到可用字幕」
6. 下载字幕（--write-subs --write-auto-subs --skip-download，子进程超时，临时目录）
7. 归一化：srt/vtt → segments[]（碎片段按标点/停顿聚合成句、剔除噪音行）
8. 更新文档：title / author(UP主) / source=哔哩哔哩 / coverImage / videoDurationSeconds
9. 写入 VideoTranscript
10. 投递 AI 分析（视频版）→ 完成后接 embedding（总结 Markdown 自动进知识库索引）
11. 清理临时字幕文件
```

实现要点：

- yt-dlp 一律通过 `execFile` 参数数组调用（禁止 shell 拼接），二进制路径支持 `YT_DLP_PATH` 覆盖，默认取 PATH。
- 字幕下载与元数据获取分两次调用，均设置子进程超时与失败重试一次；B 站接口对单次导入的低频访问无风控压力。
- 临时文件放在 `os.tmpdir()` 下的独立目录，finally 中清理。
- Cookie 探测未配置 Cookie 时跳过（无 cookie 模式，仅可能命中 CC 字幕，命中率低属预期）。

## 9. 摘要管线

### 9.1 分块（Map）

- 按时间窗切块：约 8-10 分钟或 4000 字（先到者为准），块边界尽量落在句尾；每块附带起止时间。
- Map prompt 输入：chunk 文本 + 起止时间；输出：该段小结与关键点，**只允许引用块内时间**。

### 9.2 汇总（Reduce）

- 输入：全部分块小结 + 视频元数据（标题、UP 主、时长）。
- 输出（单次结构化产出，JSON）：
  - `markdown`：正文总结。结构约定：开头一段总述，随后 `## [mm:ss] 章节标题` 若干节，节内要点列表，关键结论附 `[mm:ss]` 锚点。
  - `oneSentenceSummary` / `keyPoints` / `concepts` / `actions`：填充现有 `aiAnalysis` 卡（结构零改动）。
- 锚点后校验：所有 `[mm:ss]` 与 segments 匹配（容差 ±2s），不匹配吸附最近 segment，仍无则移除锚点标记。
- 落库：`markdown` 写入 Document；AI 卡按现有 `aiAnalysis` 流程写入；随后投递 embedding（索引内容 = 总结 Markdown，自然复用现有管线）。

### 9.3 Prompt 组织

遵循项目约定：新增 `apps/server/src/ai/prompts/buildVideoSummaryMessages.ts`（map 与 reduce 两个函数），业务代码只负责组装调用；长文本截断统一走 `common/text.utils.ts` 的 `truncate`。

### 9.4 单视频问答

- 现有单文档问答构建 prompt 处感知 `type=video`：上下文 = 总结 Markdown + Transcript 全文（按时间顺序拼接 `[mm:ss] 文本`），统一截断上限 `VIDEO_QA_MAX_CHARS`（默认 60000 字符，覆盖 60 分钟上限）。
- 不做检索，语义与文章问答一致；前端零改动。

### 9.5 失败文案清单

| 场景 | ingestErrorMessage |
| --- | --- |
| Cookie 过期 | B站 Cookie 已过期，请替换 cookie 文件后重新导入 |
| 未找到字幕 | 未找到可用字幕（视频无字幕，或 Cookie 已过期） |
| 超时长 | 视频时长超过 60 分钟上限，暂不支持导入 |
| 短链失效 | B站短链无法解析，请检查链接是否有效 |
| yt-dlp 解析失败 | 视频解析失败，可尝试升级 yt-dlp 后重试 |

## 10. Web 端改动

- **列表卡片**（`ArticleCard`）：`type=video` 时渲染封面缩略图与时长角标，其余样式沿用，遵循黑白灰视觉规范。
- **导入弹窗**（`ImportDialog`）：标题「导入文章」→「导入」，URL 占位提示补「或 B 站视频链接」。
- **详情页**（`DocumentDetailPage` + 新组件 `VideoHeaderCard`）：
  - 视频头卡：封面 + 播放按钮 + 时长 + 来源；点击原地挂载 B 站 iframe（`player.bilibili.com/player.html?bvid=xx&start=<秒>&autoplay=0`）。部分视频禁止外链播放时提供「打开原视频」兜底链接。
  - `[mm:ss]` 锚点渲染：Markdown 渲染后置处理，将正文中的 `[mm:ss]` 包为可点击元素（`data-start` 秒数），点击调用头卡 seek。样式克制（浅灰底、无边框，与标签一致）。
  - 右侧目录：`useRuntimeToc` 读取章节 heading 上的 `data-start`，点击 = 滚动 + seek；无章节时回退单列。
- **AI 抽屉**：新增「字幕」tab（`AiDrawer` 现有 ai / annotations 之外第三个 tab）：拉取 `documents/:id/transcript`，按时间列表 + 前端文本过滤，点击条目 seek；样式复用批注列表的交互习惯。
- **播放器 seek 通道**：详情页用一个轻量组合式（如 `useVideoPlayer`）维护当前播放秒数与 seek 事件，头卡 iframe 与锚点/目录/字幕 tab 共用。
- **移动端**：零改动（`apps/mobile` 不动）。

## 11. 配置与环境变量

`.env.example` 新增（同步根 `.env` 注释说明）：

```bash
# B 站 Cookie 文件（Netscape cookies.txt 格式）路径，用于获取 AI 字幕。
# 文件包含登录凭证，严禁提交到仓库（已在 .gitignore 忽略 secrets/）。
# 过期后请重新导出并替换文件内容，路径不变。
BILI_COOKIE_FILE=

# yt-dlp 可执行文件路径，默认从 PATH 查找
YT_DLP_PATH=

# 视频导入时长上限（分钟），默认 60
VIDEO_MAX_DURATION_MINUTES=60
```

- `BILI_COOKIE_FILE` 推荐填绝对路径（本地与 systemd worker 的 CWD 不同，避免歧义）。
- `.gitignore` 增加 `secrets/`（或约定的 cookie 存放目录）。

## 12. 安全与运维

- Cookie 文件即登录凭证：不入库、不打日志；探测与字幕拉取的错误信息中不回显 cookie 内容。
- URL 仅允许 B 站域名白名单进入视频管线，其余走文章管线（文章管线已有协议校验）。
- yt-dlp 以参数数组子进程执行，无 shell 注入面；对外部 URL 的抓取方向是「本机 → B 站」，无 SSRF 暴露面（不做用户提供的任意主机请求）。
- 临时字幕文件即用即删；解析失败路径同样清理。
- yt-dlp 需要定期升级（`yt-dlp -U` 或 pip 升级）：解析失败文案中提示升级，deploy.md 增补安装与升级小节（M1 收尾时补充）。
- 本机（Windows）与云服务器（Linux）均需安装 yt-dlp；M1 无需 FFmpeg，M2 引入。

## 13. 实现步骤（M1）

每步完成后跑聚焦构建 + 真机验收，再进入下一步：

1. **数据模型与 DTO**：`packages/shared` 增字段与新 DTO → `api-client` → Prisma schema + 迁移。验收：迁移通过，现有功能无回归。
2. **导入分流与判重**：平台识别 / b23.tv 展开 / 规范化 / 三态判重 / `ingest:video` 入队；附单元测试（URL 识别、canonical、判重三态）。验收：粘贴 BV 链接与短链能创建占位文档，重复导入幂等。
3. **解析管线**：登录态探测 → yt-dlp 元数据/字幕 → 时长拦截 → 归一化 → 落库。验收：指定测试视频能产出 transcript，各失败分支文案正确。
4. **摘要管线**：map-reduce prompt + 锚点校验 + AI 卡落库 + 问答上下文扩展。验收：测试视频产出带章节与锚点的总结，问答能覆盖总结外细节。
5. **Web 端**：卡片、详情头卡与播放器、锚点跳转、章节目录、字幕 tab、文案调整。验收：完整阅读闭环 + 时间锚点跳转可用。

## 14. 验收标准（M1）

- [ ] BV 链接与 b23.tv 短链均可导入，产出入库内容一致（同一视频）。
- [ ] 同视频重复导入（短链 ↔ BV 链接互换）不产生重复文档。
- [ ] `?p=N` 分 P 按指定分 P 导入，不同 P 互不判重。
- [ ] 有 CC 字幕（无 AI 字幕）的视频可正常导入。
- [ ] 无字幕视频：解析失败，文案「未找到可用字幕」，卡片可重新解析。
- [ ] 超过 60 分钟的视频：解析失败，文案含时长上限。
- [ ] 使用过期 cookie：解析失败，文案明确提示替换 cookie 文件。
- [ ] 总结正文含章节与 `[mm:ss]` 锚点；点击锚点、章节目录、字幕条目均能正确 seek 播放器。
- [ ] AI 卡（一句话总结/关键点等）正常生成；知识库问答可检索到该视频的总结。
- [ ] 单视频问答能回答总结未展开的细节问题。
- [ ] 列表卡片显示封面与时长；移动端可正常阅读视频总结（零改动验证）。
- [ ] `pnpm build:web` / `build:server` 通过；现有文章管线回归正常。

## 15. 风险与处理

| 风险 | 处理 |
| --- | --- |
| Cookie 命中率或频控问题 | 导入为低频手动操作，风险低；过期有主动探测与明确文案；必要时 M2 用 ASR 兜底 |
| yt-dlp extractor 失效（B 站改版） | 失败文案提示升级 yt-dlp；升级后重试即可恢复 |
| LLM 编造时间锚点 | map 阶段限定 chunk 时间范围 + reduce 后逐锚点校验吸附，无法匹配则移除 |
| B 站部分视频禁止 iframe 外链播放 | 播放器加载失败时展示「打开原视频」兜底；不影响阅读闭环 |
| Transcript 体积 | 60 分钟上限封顶（约 1-2 万字），JSONB 与问答截断上限均可覆盖 |
| 短链展开同步调用增加导入延迟 | 一次重定向请求，超时 5s；失败有明确文案 |

## 16. 后续里程碑

### M2：无字幕视频的语音转写兜底

- FFmpeg 提取压缩音频（16k 单声道 opus/mp3），分段提交。
- STT 服务接入（选型届时对比：OpenAI Whisper API / Groq / SiliconFlow 等），设置页新增 STT 配置档（沿用 AI/Embedding 配置中心模式）。
- 「无字幕」失败路径自动接 ASR；Transcript `provider` 记录来源。
- 移动端可考虑最小「打开原视频」入口。

### M3：知识库与体验打磨

- Transcript 按句窗分块进 embedding，知识库问答引用到分钟级时间戳（引用跳转带 `?t=`）。
- 播放时字幕同步高亮；观看进度记忆（「上次看到 12:30」）。
- YouTube 平台扩展（平台识别层与 Transcript 层已预留，主要成本在风控与 cookies 策略）。

### 长期备选（未排期）

- 字幕划词批注（需另做锚定机制）。
- 多 P 选集导入交互。
- 视频章节自动封面跳转图（preview frames）。
