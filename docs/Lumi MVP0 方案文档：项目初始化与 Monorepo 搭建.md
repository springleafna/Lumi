## 1. 目标

MVP0 目标是初始化 `Lumi` 项目，使用 `pnpm workspace` 搭建 monorepo 工程结构。

本阶段需要创建：

```txt
Web 前端项目
NestJS 后端项目
浏览器插件项目
CLI 预留目录
公共 packages 目录
pnpm workspace 配置
基础 TypeScript 配置
```

本阶段不实现业务功能。

---

## 2. 环境要求

Windows 电脑，建议使用：

```txt
PowerShell
Node.js >= 20
pnpm >= 9
```
---

## 3. 进入项目根目录

```powershell
cd D:\project\js\lumi
```

---

## 4. 创建基础目录

注意：这里只创建 `apps` 和 `packages` 父目录，不要提前创建 `apps/web`、`apps/server`、`apps/extension`，这些目录由脚手架命令生成。

```powershell
New-Item -ItemType Directory -Force -Path apps, packages
```

---

## 5. 创建 Web 前端项目

使用 Vite 创建 Vue3 + TypeScript 项目：

```powershell
pnpm create vite@latest apps/web --template vue-ts
```

创建后修改：

```txt
apps/web/package.json
```

将包名改为：

```json
{
  "name": "@lumi/web"
}
```

---

## 6. 创建 NestJS 后端项目

使用 NestJS CLI 创建后端项目：

```powershell
pnpm dlx @nestjs/cli new apps/server --package-manager pnpm --skip-git --skip-install
```

创建后修改：

```txt
apps/server/package.json
```

将包名改为：

```json
{
  "name": "@lumi/server"
}
```

---

## 7. 创建浏览器插件项目

使用 WXT 创建浏览器插件项目：

```powershell
pnpm create wxt@latest apps/extension
```

交互选项建议选择：

```txt
Framework: Vue
Language: TypeScript
Package Manager: pnpm
```

创建后修改：

```txt
apps/extension/package.json
```

将包名改为：

```json
{
  "name": "@lumi/extension"
}
```

---

## 8. 创建 CLI 预留目录

CLI 当前不实现，只预留目录。

```powershell
New-Item -ItemType Directory -Force -Path apps/cli/src
Set-Content -Path apps/cli/src/index.ts -Value "export {}"
```

创建：

```txt
apps/cli/package.json
```

内容：

```json
{
  "name": "@lumi/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts"
}
```

---

## 9. 创建公共 packages

执行：

```powershell
$packages = "shared", "api-client", "parser", "ai", "storage"

foreach ($p in $packages) {
  New-Item -ItemType Directory -Force -Path "packages/$p/src"
  Set-Content -Path "packages/$p/src/index.ts" -Value "export {}"

  $json = @"
{
  "name": "@lumi/$p",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
"@

  Set-Content -Path "packages/$p/package.json" -Value $json
}
```

公共包说明：

```txt
@lumi/shared      共享类型、常量
@lumi/api-client  API 请求封装
@lumi/parser      内容解析能力
@lumi/ai          AI Provider 抽象
@lumi/storage     对象存储抽象
```

---

## 10. 创建 pnpm workspace 配置

根目录创建：

```txt
pnpm-workspace.yaml
```

内容：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

## 11. 配置根目录 package.json

将根目录 `package.json` 修改为：

```json
{
  "name": "lumi",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "dev:web": "pnpm --filter @lumi/web dev",
    "dev:server": "pnpm --filter @lumi/server start:dev",
    "dev:extension": "pnpm --filter @lumi/extension dev",
    "build:web": "pnpm --filter @lumi/web build",
    "build:server": "pnpm --filter @lumi/server build",
    "build:extension": "pnpm --filter @lumi/extension build"
  }
}
```

---

## 12. 创建 TypeScript 基础配置

根目录创建：

```txt
tsconfig.base.json
```

内容：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "baseUrl": ".",
    "paths": {
      "@lumi/shared": ["packages/shared/src"],
      "@lumi/api-client": ["packages/api-client/src"],
      "@lumi/parser": ["packages/parser/src"],
      "@lumi/ai": ["packages/ai/src"],
      "@lumi/storage": ["packages/storage/src"]
    }
  }
}
```

---

## 13. 创建基础文件

```powershell
New-Item -ItemType File -Force -Path README.md, .env.example, .gitignore
```

`.gitignore` 内容：

```gitignore
node_modules
dist
.output
.env
.env.local
.DS_Store
pnpm-lock.yaml.tmp
```

---

## 14. 安装依赖

在项目根目录执行：

```powershell
pnpm install
```

---

## 15. 添加 workspace 内部依赖

Web 端引用共享类型和 API Client：

```powershell
pnpm --filter @lumi/web add @lumi/shared@workspace:* @lumi/api-client@workspace:*
```

后端引用公共包：

```powershell
pnpm --filter @lumi/server add @lumi/shared@workspace:* @lumi/parser@workspace:* @lumi/ai@workspace:* @lumi/storage@workspace:*
```

浏览器插件引用共享类型和 API Client：

```powershell
pnpm --filter @lumi/extension add @lumi/shared@workspace:* @lumi/api-client@workspace:*
```

CLI 预留引用共享类型和 API Client：

```powershell
pnpm --filter @lumi/cli add @lumi/shared@workspace:* @lumi/api-client@workspace:*
```

---

## 16. 最终目录结构

完成后目录结构应大致如下：

```txt
lumi/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  README.md
  .env.example
  .gitignore

  apps/
    web/
      package.json
      src/

    server/
      package.json
      src/

    extension/
      package.json
      entrypoints/

    cli/
      package.json
      src/
        index.ts

  packages/
    shared/
      package.json
      src/
        index.ts

    api-client/
      package.json
      src/
        index.ts

    parser/
      package.json
      src/
        index.ts

    ai/
      package.json
      src/
        index.ts

    storage/
      package.json
      src/
        index.ts
```

---

## 17. 验证命令

启动 Web：

```powershell
pnpm dev:web
```

启动后端：

```powershell
pnpm dev:server
```

启动浏览器插件开发环境：

```powershell
pnpm dev:extension
```

---

## 18. MVP0 完成标准

满足以下条件即完成 MVP0：

```txt
1. Lumi 根目录创建完成。
2. pnpm workspace 配置完成。
3. apps/web Vue3 项目创建完成。
4. apps/server NestJS 项目创建完成。
5. apps/extension WXT 插件项目创建完成。
6. apps/cli 目录已预留。
7. packages/shared、api-client、parser、ai、storage 创建完成。
8. 根目录 scripts 可以启动 web、server、extension。
9. workspace 内部依赖可以正常安装和引用。
```

本阶段不实现任何业务功能。