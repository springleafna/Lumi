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
- 设置：服务器地址、账号退出

AI / Embedding 配置管理在桌面端 Web 进行。
