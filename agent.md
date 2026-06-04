# Lumi Agent Notes

## Repo Shape

- `apps/web`: Vue 3 web client
- `apps/server`: NestJS API server
- `apps/extension`: WXT browser extension
- `apps/cli`: CLI placeholder
- `packages/shared`: shared DTOs and types
- `packages/api-client`: axios client wrapper
- `packages/parser`: HTML extraction and Markdown conversion

## Current MVP Scope

- MVP0: workspace scaffold only
- MVP1: login, JWT auth, URL ingest, document list/detail/search/delete, sync ingest jobs
- MVP2: browser extension login, configurable API/Web base URLs, save current URL, save full page HTML, open saved document

## Key Scripts

```powershell
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:init-user
pnpm dev:server
pnpm dev:web
pnpm dev:extension
pnpm build:server
pnpm build:web
pnpm build:extension
```

## Environment

- Root `.env` drives the server and Prisma config
- Web uses `VITE_API_BASE_URL`
- Default server origin: `http://localhost:3000/api`
- Default web origin: `http://localhost:5173`
- Extension settings are stored in `browser.storage.local`
- Extension defaults:
  - API base URL: `http://localhost:3000/api`
  - Web base URL: `http://localhost:5173`

## Notes

- `@lumi/shared`, `@lumi/parser`, and `@lumi/api-client` build to `dist/`
- Server uses Prisma 7 with `prisma.config.ts`
- `pnpm --filter @lumi/server prisma generate` works through the server package script
- If the local database is not available, `db:migrate` and `db:init-user` will fail by design
- `dev:extension` and `build:extension` run `build:packages` first because the extension imports workspace packages from their `dist/` output
- Server disables Nest's default JSON parser and installs an Express JSON parser with a `6mb` limit for extension HTML ingest
- Business HTML ingest limit is `5MB`; larger payloads should return `页面内容过大，暂不支持保存`

## MVP2 Extension

- WXT config grants `activeTab`, `scripting`, `storage`, `tabs`, and `<all_urls>`
- Popup:
  - reads current tab title and URL
  - saves current URL via `client.ingest.url`
  - captures full page HTML via `browser.scripting.executeScript`
  - saves full page HTML via `client.ingest.html`
  - opens saved document in a new tab
- Options:
  - edits API base URL and Web base URL
  - logs in through `client.auth.login`
  - tests auth through `client.auth.me`
  - logout clears token/user but preserves URLs
- Capture utilities intentionally do not clean HTML in the extension; parsing and sanitizing stay on the server through `@lumi/parser`

## API Additions

- `POST /api/ingest/html`
- Request:

```json
{
  "url": "https://example.com/article",
  "title": "Page title",
  "html": "<html>...</html>"
}
```

- Requires JWT
- Creates `IngestJob` with `type = html`
- Reuses the same duplicate URL rules as URL ingest
