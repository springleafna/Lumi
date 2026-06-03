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

## Key Scripts

```powershell
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:init-user
pnpm dev:server
pnpm dev:web
pnpm build:server
pnpm build:web
pnpm build:extension
```

## Environment

- Root `.env` drives the server and Prisma config
- Web uses `VITE_API_BASE_URL`
- Default server origin: `http://localhost:3000/api`
- Default web origin: `http://localhost:5173`

## Notes

- `@lumi/shared`, `@lumi/parser`, and `@lumi/api-client` build to `dist/`
- Server uses Prisma 7 with `prisma.config.ts`
- `pnpm --filter @lumi/server prisma generate` works through the server package script
- If the local database is not available, `db:migrate` and `db:init-user` will fail by design
