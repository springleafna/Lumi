# Lumi Agent Notes

## Project Overview

Lumi is a personal knowledge management app for collecting, parsing, saving, organizing, and reading web articles and rich text pages.

The repository is a pnpm monorepo. Prefer running scripts from the repository root unless a package-specific script is needed.

## Repo Shape

- `apps/web`: Vue 3 web client
- `apps/server`: NestJS API server
- `apps/extension`: WXT browser extension
- `apps/cli`: CLI placeholder
- `packages/shared`: shared DTOs and types
- `packages/api-client`: axios client wrapper
- `packages/parser`: HTML extraction and Markdown conversion
- `packages/ai`: AI provider placeholder
- `packages/storage`: object storage placeholder

## Completed MVP Scope

- MVP0:
  - monorepo scaffold
  - workspace package layout
  - shared TypeScript config and scripts
- MVP1:
  - login and JWT auth
  - admin user initialization
  - URL ingest
  - HTML parsing, Markdown conversion, and document persistence
  - document list, search, detail reading, and soft delete
  - `@lumi/api-client` and `@lumi/parser`
- MVP2:
  - browser extension login
  - configurable API/Web base URLs
  - save current URL from popup
  - save full page HTML from popup
  - open saved document in Web detail page
- MVP3:
  - document status filters: active, archived, trash
  - type/source/tag filters and keyword search
  - created/updated sorting
  - archive, unarchive, restore, soft delete, permanent delete
  - manual tag add/remove on detail page
  - facets endpoint for tags and sources
  - Web reading and management UI refresh
- MVP4:
  - Redis + BullMQ async ingest and AI analysis queues
  - standalone server worker entrypoint
  - async URL/HTML ingest with placeholder documents
  - automatic AI analysis after parsing succeeds
  - OpenAI-compatible provider abstraction
  - DeepSeek and SiliconFlow env-based configuration
  - structured AI reading card and auto tags
  - current-document AI Q&A with streaming response
  - per-document AI conversation history
- MVP5:
  - two-state reading status: unread and read
  - documents default to unread and detail view auto-marks unread documents as read
  - favorite/unfavorite documents independently from archive and reading status
  - document list filters for unread, read, and favorite documents
  - document annotations: text highlight, optional note, list, edit, delete, and scroll-to-highlight
  - Web local `.md` / `.txt` file import; local file documents use source `本地`
  - extension selected-content import into `fragment` documents
  - Shiki-based fenced code block highlighting in the Markdown reader

## Web UI Direction

- The Web app should feel like a quiet reading product, closer to shadcn/ui, Notion, Readwise Reader, Linear, and Vercel Dashboard than a decorative dashboard.
- Current visual language is black, white, and gray only.
- Avoid blue/amber/purple accent palettes unless the user explicitly asks for them.
- Prefer:
  - `#18181B` and `#1A1813` for foreground and strong controls
  - `#F4F4F5`, white, and zinc/neutral grays for surfaces
  - subtle borders, small radius, and light shadows
- Do not use heavy gradients, oversized rounded pills, or decorative dashboard visuals.
- Tags should be subtle: gray background, no visible border, small radius.
- Existing local shadcn-style components live in `apps/web/src/components/ui`:
  - `Button`
  - `Input`
  - `Select`
  - `Card`
  - `Badge`
  - `Tabs`
  - `Dialog`
  - `EmptyState`
  - `SearchInput`
  - `Toaster`
- Use these components before adding page-local controls.
- Toast feedback is provided by `apps/web/src/composables/useToast.ts` and mounted in `App.vue`.
- Markdown reading styles are in `apps/web/src/style.css` under `.markdown-reader`.

## Key Scripts

```powershell
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:init-user
pnpm dev:server
pnpm dev:worker
pnpm dev:web
pnpm dev:all
pnpm dev:extension
pnpm build:server
pnpm build:web
pnpm build:extension
```

Build scripts:

- `pnpm build:packages`
- `pnpm build:server`
- `pnpm build:web`
- `pnpm build:extension`

Development scripts:

- `pnpm dev:server`
- `pnpm dev:worker`
- `pnpm dev:all`
- `pnpm dev:web`
- `pnpm dev:extension`

Database scripts:

- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:init-user`

## Environment

- Root `.env` drives the server and Prisma config.
- Web uses `VITE_API_BASE_URL`.
- Default server origin: `http://localhost:3000`
- Default API base URL: `http://127.0.0.1:3000/api`
- Default web origin: `http://localhost:5173`
- Default Redis URL: `redis://localhost:6379`
- Extension dev server runs on `http://127.0.0.1:5174`.
- Extension settings are stored in `browser.storage.local`.
- Extension defaults:
  - API base URL: `http://127.0.0.1:3000/api`
  - Web base URL: `http://localhost:5173`

Example database URL:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lumi?schema=public"
```

If the PostgreSQL password contains special characters such as `#`, URL-encode them in `DATABASE_URL`.

## Server Notes

- Server uses NestJS with Prisma 7 and `prisma.config.ts`.
- `pnpm --filter @lumi/server prisma generate` works through the server package script.
- If the local database is not available, `db:migrate` and `db:init-user` fail by design.
- Server disables Nest's default JSON parser and installs an Express JSON parser with a `6mb` limit for extension HTML ingest.
- Business HTML ingest limit is `5MB`; larger payloads should return `页面内容过大，暂不支持保存`.
- MVP4 ingest is asynchronous. API routes create placeholder documents and BullMQ jobs; Worker performs fetch/parse/update.
- Worker entrypoint is `apps/server/src/worker.ts`.
- Worker consumes `lumi-ingest` and `lumi-ai-analysis`.
- Redis must be running before async ingest and AI analysis can work.
- Documents are user-scoped.
- `Document.ingestStatus` tracks placeholder/parse state.
- Document timestamps:
  - `deletedAt`: soft delete/trash state
  - `archivedAt`: archive state
- `Document.readingStatus` has only `unread` and `read`.
- New documents default to `unread`; Web detail view calls the reading-status API to mark succeeded, non-trash unread documents as `read`.
- `Document.favoritedAt` tracks favorite state and is independent from archive and reading status.
- Web list supports reading status and favorite filters in the search toolbar; do not add duplicate favorite badges to card footers.
- Local file import should set `Document.source = 本地`.
- Tags are manual plain-text tags.
- AI generated tags are written into the same manual tag system and remain user editable.

## MVP4 AI API

Current AI-related API surface includes:

```txt
POST   /api/documents/:id/retry-ingest
GET    /api/documents/:id/ai-analysis
POST   /api/documents/:id/ai-analysis/retry
GET    /api/documents/:id/ai-conversations
POST   /api/documents/:id/ai-conversations
```

AI env keys:

```env
AI_PROVIDER="deepseek"
DEEPSEEK_API_KEY=""
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-chat"
SILICONFLOW_API_KEY=""
SILICONFLOW_BASE_URL="https://api.siliconflow.cn/v1"
SILICONFLOW_MODEL=""
```

## Document API

Current document API surface includes:

```txt
GET    /api/documents
GET    /api/documents/facets
GET    /api/documents/:id
DELETE /api/documents/:id
PATCH  /api/documents/:id/archive
PATCH  /api/documents/:id/unarchive
PATCH  /api/documents/:id/restore
DELETE /api/documents/:id/permanent
PATCH  /api/documents/:id/reading-status
PATCH  /api/documents/:id/favorite
POST   /api/documents/:id/tags
DELETE /api/documents/:id/tags/:tagId
GET    /api/documents/:id/annotations
POST   /api/documents/:id/annotations
PATCH  /api/documents/:id/annotations/:annotationId
DELETE /api/documents/:id/annotations/:annotationId
```

Document list supports:

- `keyword`: title, excerpt, and content text search
- `status`: `active`, `archived`, `trash`
- `type`: `article`, `video`, `audio`, `pdf`, `fragment`
- `tag`: tag id
- `source`: source string
- `readingStatus`: `unread`, `read`
- `favorite`: `true`
- `sort`: `created_desc`, `created_asc`, `updated_desc`, `updated_asc`
- `page`
- `pageSize`

## Ingest API

```txt
POST /api/ingest/url
POST /api/ingest/html
POST /api/ingest/file
POST /api/ingest/selection
```

HTML ingest request:

```json
{
  "url": "https://example.com/article",
  "title": "Page title",
  "html": "<html>...</html>"
}
```

- Requires JWT.
- Creates an `IngestJob`.
- `POST /api/ingest/html` uses `type = html`.
- Duplicate URL rules are shared with URL ingest.
- `POST /api/ingest/file` accepts multipart field `file`, supports `.md` and `.txt`, max `2MB`, and creates a complete article immediately.
- File imports are not deduplicated by URL and should show source `本地`.
- `POST /api/ingest/selection` saves current selected page content as `type = fragment`, max `200KB`, and creates a new fragment each time.
- File import attempts to enqueue AI analysis; selection import does not automatically enqueue AI analysis.

## MVP2 Extension Notes

- WXT config grants `activeTab`, `scripting`, `storage`, `tabs`, and `<all_urls>`.
- Popup:
  - reads current tab title and URL
  - saves current URL via `client.ingest.url`
  - captures full page HTML via `browser.scripting.executeScript`
  - saves full page HTML via `client.ingest.html`
  - captures current selection HTML/text
  - saves selected content via `client.ingest.selection`
  - opens saved document in a new tab
- Options:
  - edits API base URL and Web base URL
  - logs in through `client.auth.login`
  - tests auth through `client.auth.me`
  - logout clears token/user but preserves URLs
- Capture utilities intentionally do not clean HTML in the extension; parsing and sanitizing stay on the server through `@lumi/parser`.

## Implementation Notes

- `@lumi/shared`, `@lumi/parser`, and `@lumi/api-client` build to `dist/`.
- Web, server, and extension scripts should run `build:packages` first when they depend on workspace package output.
- Prefer adding shared DTO changes in `packages/shared` before changing API client/server/web code.
- Prefer using `@lumi/api-client` in Web and extension instead of raw axios calls.
- Keep Web UI controls in `apps/web/src/components/ui` when they are reusable.
- Keep unrelated refactors out of MVP implementation changes.
- Run focused builds after changes:
  - Web UI changes: `pnpm build:web`
  - Server/API changes: `pnpm build:server`
  - Extension changes: `pnpm build:extension`
