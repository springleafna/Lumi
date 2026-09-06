## 部署流程

### 1. 环境准备

#### 1.1 安装 Node 22 和 pnpm

```bash
# 装到 /usr/local，全系统可用（版本号以 22.x 最新为准，需 ≥22.12）
curl -fsSL https://nodejs.org/dist/v22.18.0/node-v22.18.0-linux-x64.tar.xz \
  | tar -xJ -C /usr/local --strip-components=1
node -v && npm -v

# pnpm（corepack 随 node 自带；国内服务器建议同时指到 npmmirror）
npm i -g pnpm@9
pnpm -v
```

#### 1.2 配置 Nginx

在 `/etc/nginx/conf.d` 目录下创建 `lumi.conf`：

```nginx
server {
    listen 82;
    server_name _;

    root /data/project/Lumi/apps/web/dist;
    index index.html;

    # nginx 独立日志，排查问题
    access_log /var/log/nginx/lumi.access.log;
    error_log  /var/log/nginx/lumi.error.log;

    # 扩展整页 HTML 导入限 5MB、服务端 JSON 解析器上限 6mb，留足余量
    client_max_body_size 12m;

    # 文本类响应 gzip（SSE 在 /api/ 内已单独关闭，不受影响）
    gzip on;
    gzip_min_length 1k;
    gzip_comp_level 5;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # Vite 产物文件名带 content hash，可永久缓存
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
        try_files $uri =404;
    }

    # API 反代到 NestJS。
    # 注意 proxy_pass 结尾不带 "/"：保留 /api 前缀原样转发（后端有全局 api 前缀），
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        # AI 问答/知识库问答是 SSE 流式（fetch + ReadableStream）：
        # 不关 buffering 回答会到结束才一次性输出
        proxy_buffering off;
        gzip off;
        # 两次读之间的空闲超时，流式出数据不会触发；AI 生成 10 分钟内足够
        proxy_read_timeout 600s;
    }

    # Vue Router history 模式：子路由刷新回退到 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

#### 1.3 安全组开放端口

在云服务商安全组中开放 **82 端口**。

#### 1.4 安装 yt-dlp（视频导入依赖）

视频导入使用 yt-dlp 获取元数据与字幕，M1 仅需字幕不需要 FFmpeg（M2 语音转写时再安装）。


```bash
# 1) 本地下载（GitHub Releases，无扩展名，浏览器提示保留时选保留）
#    https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux

# 2) 上传到服务器（目标名必须是 yt-dlp）
scp D:\downloads\yt-dlp_linux root@<服务器IP>:/usr/local/bin/yt-dlp

# 3) 服务器上加执行权限并验证
chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version
```

**版本更新**：

```bash

# 本地重新下载最新 yt-dlp_linux 后覆盖上传（scp 覆盖已保留执行权限）
scp D:\downloads\yt-dlp_linux root@<服务器IP>:/usr/local/bin/yt-dlp
```

更新后无需重启服务——worker 每次任务都会重新调用 yt-dlp 二进制。B 站改版导致
视频导入报「视频解析失败」时，先升级 yt-dlp 再对失败文章点重新解析。

---

### 2. 项目初始化部署

#### 2.1 配置环境变量

在 `/data/project/Lumi` 文件夹中添加 `.env` 文件（可从本地项目拷贝后修改）：

- `WEB_ORIGIN=http://<服务器IP>:82`（带端口，与实际访问地址一致）
- `ADMIN_PASSWORD` 改强密码（公网可达）；`AUTH_REGISTER_ENABLED` 按需决定是否关闭注册
- `DATABASE_URL` / `REDIS_URL` 的 host 用 `localhost`（服务都在本机，不用绕公网）
- **`JWT_SECRET` 和 `AI_CONFIG_ENCRYPTION_KEY` 必须与旧环境保持一致**：后者不一致会导致数据库中已加密保存的 AI key 全部解密失败
- `VITE_API_BASE_URL` 改不改都行，前端构建用的是命令行注入（见下一步）

#### 2.2 构建项目

```bash
cd /data/project/Lumi
pnpm install --frozen-lockfile

# 关键：API 地址构建时注入（/api 相对路径，走 nginx 反代）
VITE_API_BASE_URL=/api pnpm build:web

pnpm build:server          # 自带 prisma generate + 共享包构建

# 应用数据库迁移（幂等，已是最新则输出 already in sync 秒过；勿用根目录 db:migrate，那是 migrate dev）
pnpm --filter @lumi/server exec prisma migrate deploy
# 全新空库时另需初始化管理员：pnpm db:init-user
```

#### 2.3 注册 systemd 服务

```bash
cat > /etc/systemd/system/lumi-server.service <<'EOF'
[Unit]
Description=Lumi API server
After=network.target

[Service]
Type=simple
WorkingDirectory=/data/project/Lumi/apps/server
ExecStart=/usr/local/bin/node dist/src/main.js
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/lumi-worker.service <<'EOF'
[Unit]
Description=Lumi ingest/AI worker
After=network.target

[Service]
Type=simple
WorkingDirectory=/data/project/Lumi/apps/server
ExecStart=/usr/local/bin/node dist/src/worker.js
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now lumi-server lumi-worker
systemctl status lumi-server lumi-worker --no-pager
```

---

### 3. 日常更新部署

#### 3.1 本地：打包并上传代码

```bash
cd D:\project\js\lumi
git bundle create D:\project\lumi.bundle --all
scp D:\project\lumi.bundle root@<服务器IP>:/tmp/lumi.bundle
```

#### 3.2 服务器：更新代码并重启服务

```bash
cd /data/project/Lumi
git pull /tmp/lumi.bundle main
pnpm install --frozen-lockfile
VITE_API_BASE_URL=/api pnpm build:web
pnpm build:server
pnpm --filter @lumi/server exec prisma migrate deploy
systemctl restart lumi-server lumi-worker
```

---

### 4. 服务管理命令

```bash
systemctl stop lumi-server lumi-worker      # 停止（开机自启配置仍保留）
systemctl start lumi-server lumi-worker     # 再启动
systemctl restart lumi-server lumi-worker   # 重启
systemctl status lumi-server lumi-worker    # 看运行状态和最近几行日志
```