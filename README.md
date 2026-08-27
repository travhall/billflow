# BillFlow

Personal bill/payment tracking app. Solo-developer, single-user, built to
run locally or on a small always-on deployment — no user accounts, no
multi-tenant auth.

## Stack

- Frontend: React 19 + Vite (`client/src/`)
- Backend: Express 5 (`server/`)
- Database: PostgreSQL (Neon, managed) via Drizzle ORM (`shared/schema.ts`)
- Package manager: pnpm

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in DATABASE_URL at minimum
pnpm dev                # http://localhost:5000
```

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start dev server (tsx + Vite HMR) |
| `pnpm check` | TypeScript typecheck |
| `pnpm build` | Production build to `dist/` |
| `pnpm start` | Run the production build |
| `pnpm db:push` | Push schema changes to the database |
| `pnpm test` | Run the test suite (Vitest) |

## Deployment

Deployed to [Render](https://render.com) (`render.yaml` at repo root,
free tier), protected by HTTP Basic Auth (`BASIC_AUTH_USER`/
`BASIC_AUTH_PASS` env vars — unset locally by default, required on the
deployed instance since it has a public URL and this app has no other
authentication). See `CLAUDE.md`'s Deployment section and
`plans/030-render-deployment-with-basic-auth.md` for how it's wired up.

## More

Full architecture notes, data model, conventions, and required env vars
live in `CLAUDE.md`. Completed and planned improvement work is tracked
in `plans/`.
