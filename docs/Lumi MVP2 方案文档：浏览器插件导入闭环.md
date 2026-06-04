## 1. 目标

MVP2 目标是在 MVP1 的 Web + Server 图文导入闭环基础上，补全浏览器插件导入闭环。

本阶段重点解决后端无法直接抓取的页面，例如：

```txt
微信公众号文章
登录后可见页面
动态渲染页面
用户当前正在浏览且有权限访问的普通网页
```

MVP2 完成后，用户可以在浏览器插件中登录 Lumi，保存当前页面 URL，或保存当前页面完整 HTML，由后端统一解析、清洗、转换 Markdown 并保存。

---

## 2. 实现范围

MVP2 实现以下能力：

1. 浏览器插件内登录。
2. 插件 Options 页配置 API 地址。
3. 插件 Options 页配置 Web 地址。
4. 插件 Options 页测试连接。
5. 插件 Popup 显示当前页面基础信息。
6. 插件 Popup 保存当前页面 URL。
7. 插件 Popup 保存当前完整页面 HTML。
8. 保存成功后显示文章标题。
9. 保存成功后提供“打开文章”按钮。
10. 点击“打开文章”时新开 Web 文章详情页。
11. 后端新增完整 HTML 导入接口。
12. 后端 HTML 导入复用 `@lumi/parser`。
13. HTML 导入重复规则与 MVP1 URL 导入保持一致。
14. HTML 导入每次创建 `IngestJob`。
15. 插件使用 `browser.storage.local` 保存配置和登录态。
16. 插件使用 `<all_urls>` 权限读取用户主动保存的当前页面。

---

## 3. 当前不实现

MVP2 明确不实现：

1. 选中内容导入。
2. 浏览器插件保存历史。
3. 插件自动同步 Web 登录态。
4. 插件后台自动抓取。
5. 自动遍历网页链接。
6. 批量导入。
7. 插件多环境配置切换。
8. 插件内文章列表。
9. Web 端展示导入方式。
10. Redis / BullMQ 异步任务。
11. AI 总结、标签、问答。
12. 图片本地化。
13. 站点专属适配规则。

---

## 4. 插件功能设计

MVP2 插件包含两个页面：

```txt
Popup
Options
```

### 4.1 Popup 职责

Popup 用于当前页面的快速保存。

功能：

```txt
显示登录状态
显示当前页面标题
显示当前页面 URL
保存当前页面 URL
保存当前完整页面
显示保存 loading 状态
显示保存成功/失败信息
保存成功后显示“打开文章”按钮
```

保存方式：

```txt
保存 URL
  -> 调用 POST /api/ingest/url

保存完整页面
  -> 读取当前 tab 的 title、url、html
  -> 调用 POST /api/ingest/html
```

### 4.2 Options 职责

Options 用于配置插件和登录账号。

功能：

```txt
配置 API 地址
配置 Web 地址
登录
退出登录
测试连接
显示当前登录用户
```

默认配置：

```txt
API 地址：http://localhost:3000/api
Web 地址：http://localhost:5173
```

### 4.3 插件存储

使用 `browser.storage.local` 保存：

```ts
type ExtensionSettings = {
  apiBaseUrl: string
  webBaseUrl: string
  accessToken?: string
  user?: {
    id: string
    username: string
  }
}
```

退出登录时：

```txt
清除 accessToken
清除 user
保留 apiBaseUrl
保留 webBaseUrl
```

---

## 5. 后端 API 设计

MVP2 新增：

```txt
POST /api/ingest/html
```

需要 JWT 鉴权。

请求体：

```json
{
  "url": "https://example.com/article",
  "title": "页面标题",
  "html": "<html>...</html>"
}
```

响应 data：

```json
{
  "document": {},
  "job": {}
}
```

校验规则：

```txt
url 必须存在
url 必须是 http 或 https
html 必须存在
html 最大 5MB
title 可选
```

错误文案：

```txt
页面内容过大，暂不支持保存
```

---

## 6. HTML 导入流程

HTML 导入为同步处理。

流程：

```txt
1. 用户点击插件“保存完整页面”。
2. 插件读取当前 tab 的 URL 和标题。
3. 插件注入脚本读取 document.documentElement.outerHTML。
4. 插件调用 POST /api/ingest/html。
5. 后端创建 IngestJob，状态 pending，type=html。
6. 后端将 IngestJob 更新为 processing。
7. 后端检查当前用户下是否已有相同 URL 的 Document。
8. 如果已有且未删除，直接返回已有 Document。
9. 如果已有但已软删除，重新解析 HTML 并恢复该 Document。
10. 如果不存在，解析 HTML 并创建新 Document。
11. 后端使用 @lumi/parser 提取正文。
12. 后端清洗 HTML。
13. 后端转换 Markdown。
14. 后端保存 Document。
15. IngestJob 更新为 succeeded 并关联 Document。
16. 插件显示保存成功和“打开文章”按钮。
```

失败流程：

```txt
1. IngestJob 更新为 failed。
2. 保存 errorMessage。
3. API 返回错误响应。
4. 插件显示失败信息。
```

---

## 7. 重复导入规则

HTML 导入和 URL 导入保持一致：

```txt
同 URL 已存在且未删除：直接返回已有文章
同 URL 已软删除：重新解析并恢复文章
同 URL 不存在：创建新文章
每次导入都创建 IngestJob
```

任务类型：

```txt
URL 导入：IngestJob.type = url
HTML 导入：IngestJob.type = html
```

---

## 8. 权限与安全边界

插件权限使用：

```txt
<all_urls>
activeTab
storage
tabs
scripting
```

安全边界：

```txt
只在用户主动点击保存时读取当前页面
不做后台自动抓取
不做批量抓取
不自动遍历网页链接
不绕过平台访问限制
只保存用户当前有权限访问并主动导入的内容
```

HTML 安全处理：

```txt
插件端不清理 HTML
后端限制 HTML 最大 5MB
后端使用 @lumi/parser
parser 内部使用 DOMPurify 清洗 HTML
Web Markdown 渲染继续使用 DOMPurify 清洗
```

---

## 9. 数据模型影响

MVP2 不新增 Prisma 模型。

复用现有模型：

```txt
Document
IngestJob
```

使用现有 enum：

```txt
IngestJobType.html
```

MVP2 不给 `Document` 增加 `ingestSource` 字段，也不在 Web 端展示导入方式。

---

## 10. 目录与代码模块规划

### 10.1 Server

```txt
apps/server/src/ingest/
  ingest.controller.ts
  ingest.service.ts
```

新增：

```txt
POST /api/ingest/html
```

### 10.2 Shared

```txt
packages/shared/src/index.ts
```

新增类型：

```ts
IngestHtmlRequest
```

### 10.3 API Client

```txt
packages/api-client/src/index.ts
```

新增：

```ts
client.ingest.html()
```

### 10.4 Extension

```txt
apps/extension/
  entrypoints/
    popup/
    options/
    content.ts
    background.ts
  utils/
    api.ts
    capture.ts
    storage.ts
```

职责：

```txt
storage.ts    读写 browser.storage.local
api.ts        创建 Lumi API client
capture.ts    捕获当前页面 URL 和完整 HTML
popup         保存入口
options       配置和登录
```

代码结构轻度预留：

```txt
当前实现 capturePageHtml()
当前实现 capturePageUrl()
后续可增加 captureSelection()
```

---

## 11. 依赖安装

MVP2 优先复用现有依赖：

```txt
@lumi/api-client
@lumi/shared
wxt
vue
```

如需插件图标按钮，可复用：

```txt
lucide-vue-next
```

但 MVP2 不强制引入新的 UI 框架。

---

## 12. 推荐执行顺序

```txt
1. 编写 MVP2 方案文档。
2. 扩展 @lumi/shared 类型。
3. 扩展 @lumi/api-client。
4. 后端新增 POST /api/ingest/html。
5. 后端复用 URL 导入逻辑，抽取公共保存流程。
6. 配置 WXT manifest 权限。
7. 实现 extension storage 工具。
8. 实现 extension api 工具。
9. 实现 extension capture 工具。
10. 实现 Options 页配置、登录、退出登录、测试连接。
11. 实现 Popup 当前页面信息展示。
12. 实现 Popup 保存 URL。
13. 实现 Popup 保存完整页面 HTML。
14. 实现 Popup 打开 Web 文章详情。
15. 构建 server。
16. 构建 web。
17. 构建 extension。
```

---

## 13. 验收标准

MVP2 完成后需要满足：

```txt
1. 后端可以启动。
2. Web 可以启动。
3. 插件可以构建。
4. 插件 Options 页可以配置 API 地址。
5. 插件 Options 页可以配置 Web 地址。
6. 插件 Options 页可以登录。
7. 插件 Options 页可以退出登录。
8. 插件 Options 页可以测试连接。
9. 插件 Popup 可以读取当前页面标题和 URL。
10. 插件 Popup 可以保存当前页面 URL。
11. 插件 Popup 可以保存当前完整页面 HTML。
12. 后端 POST /api/ingest/html 需要 JWT 鉴权。
13. 后端 HTML 导入会创建 IngestJob。
14. HTML 导入成功时 IngestJob.status=succeeded。
15. HTML 导入失败时 IngestJob.status=failed。
16. HTML 导入时 IngestJob.type=html。
17. HTML 超过 5MB 时返回错误。
18. HTML 导入重复 URL 时返回已有文章。
19. HTML 导入已软删除 URL 时恢复并刷新文章。
20. 插件保存成功后显示文章标题。
21. 插件保存成功后可以新开 Web 文章详情页。
22. 插件只在用户主动点击保存时读取当前页面。
23. Web 端仍可正常查看插件导入的文章。
24. Markdown 渲染仍经过 DOMPurify 清洗。
```
