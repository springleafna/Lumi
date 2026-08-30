# @lumi/mobile

Lumi 移动端（安卓优先）。Vue 3 + Vite + Vant 4，通过 Capacitor 打包为 Android 应用；同一份构建也可以作为移动网页 / PWA 使用。

## 开发

```powershell
pnpm dev:mobile        # http://localhost:5175（桌面 Chrome 手机模拟调试）
```

首次打开会进入 `/setup` 页填写 Lumi 服务器地址（存 localStorage，之后可在设置页修改），然后登录。

## 构建

```powershell
pnpm build:mobile      # 产物在 apps/mobile/dist
```

## 出 Android APK

需要本机安装 Android Studio（含 JDK 17+）。首次生成安卓工程：

```powershell
cd apps/mobile
pnpm build             # 或 npx cap sync 前确保 dist 最新
npx cap add android    # 仓库里已包含 android/ 时跳过
```

日常同步 Web 构建到安卓工程并打开 Android Studio：

```powershell
pnpm --filter @lumi/mobile sync:android
pnpm --filter @lumi/mobile open:android
```

在 Android Studio 中 `Build > Build APK(s)` 生成 debug APK，可直接传到手机安装（允许未知来源）。

## 前置条件

- 手机 / WebView 必须能访问 Lumi 服务器：公网部署（HTTPS）或与服务器同一局域网。
- 服务端 CORS 已放行 Capacitor 默认源（`https://localhost` 等，见 `apps/server/src/main.ts`）。

## MVP 范围

- 文章库信息流：搜索、全部/未读/已读/收藏筛选、下拉刷新、无限滚动、左滑收藏/归档、URL 导入
- 全屏阅读器：Markdown 渲染、字号调节、目录、批注只读展示、即时 AI 问答（底部弹层）
- 知识库问答（第三 tab）：会话列表（新建/删除/切换）、流式回答、引用来源跳原文
- 分享接收：系统分享 text/plain 进 App，弹确认框导入（链接走 URL 导入、纯文本走摘录导入）
- 设置：服务器地址、账号退出

AI / Embedding 配置管理在桌面端 Web 进行。

## 分享接收（真机验证清单）

原生改动：`android/app/src/main/AndroidManifest.xml`（`ACTION_SEND` intent-filter）与
`MainActivity.java`（把分享文本改写为 `https://localhost/_share?text=...` 深链，走
`@capacitor/app` 的 `appUrlOpen` / `getLaunchUrl` 通道）。改完原生代码后需重新出 APK。

以下场景只能在真机/模拟器上验证（浏览器无法触发系统分享）：

1. 冷启动分享：在微信/浏览器分享一篇文章链接 → 选择 Lumi → App 启动后应弹「导入分享内容」确认框，显示「识别为链接」→ 点导入 → toast 成功
2. 热启动分享：App 已在后台时再分享一次 → 应直接弹确认框（不打断当前页面，导入后原地 toast）
3. 纯文本分享：分享一段无链接的文字（如笔记类 App 的选段）→ 确认框显示「识别为文本」→ 导入后文章库出现「摘录：」开头的新文档
4. 未登录分享：清除 App 数据后（未配置服务器）分享 → 不应弹框，正常进 setup 页
5. 取消分享：确认框点取消 → 不产生任何文档
6. 极限情况：分享超长文本（>200KB）→ 导入应 toast 服务端错误「选中内容过大」，不崩溃
