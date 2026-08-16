# BillFlow

Personal bill/payment tracking app. Solo-developer, single-user, no
authentication by design — runs locally on the owner's machine.

## Stack

- Frontend: React 19 + Vite, `client/src/`
- Backend: Express 5, `server/`
- Database: PostgreSQL (Neon, managed) via Drizzle ORM, schema in `shared/schema.ts`
- Shared types/contract: `shared/routes.ts` (Zod-validated API contract), `shared/schema.ts`
- Package manager: **pnpm** (not npm/yarn — see `pnpm-lock.yaml`, `pnpm-workspace.yaml`)

## Commands

- `pnpm dev` — start dev server (tsx + Vite HMR) on port 5000 (or `$PORT`)
- `pnpm check` — TypeScript typecheck (`tsc`, no emit)
- `pnpm build` — production build (Vite for client, esbuild for server) to `dist/`
- `pnpm start` — run the production build
- `pnpm db:push` — push schema changes to the database (via `drizzle-kit push` — no versioned migrations, see Maintenance note below)
- `pnpm test` — run the test suite (Vitest, if `plans/019-add-test-harness-and-ci.md` has been applied)

## Path aliases

- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

## Required environment variables (`.env`, git-ignored)

- `DATABASE_URL` — Postgres connection string (Neon)
- `PORT` — server port, defaults to 5000
- `NODE_ENV` — `development` or `production`

## Architecture

- `server/routes.ts` — HTTP route handlers.
- `server/storage.ts` — data access layer (`DatabaseStorage` implementing `IStorage`).
- `server/db.ts` — Drizzle/pg connection setup.
- `shared/schema.ts` — Drizzle table definitions + Zod schemas (`bills`, `payments`, `categoryBudgets`).
- `shared/routes.ts` — typed API contract (`api.bills.*`, `api.payments.*`) consumed by `client/src/hooks/use-bills.ts`/`use-payments.ts`. Not all endpoints are covered by this contract yet (budgets, `/reset`, `/revert`) — see `plans/014-unify-api-contract.md`.
- `client/src/hooks/` — TanStack Query hooks, one per resource.
- `client/src/pages/` — route-level components (dashboard, history, upcoming, analytics).
- `client/src/components/` — shared UI; `components/ui/` is vendored shadcn/ui, not hand-maintained.

## Data model

- `bills`: recurring payment definitions (name, category, amount, frequency, due day/month, auto-pay, reminder settings).
- `payments`: individual payment records per billing cycle, linked to a bill.
- `categoryBudgets`: optional monthly spending limit per category.

## Backups

Nightly `pg_dump` of the Neon database to Cloudflare R2 via
`script/backup-db.sh`, run by a macOS LaunchAgent (not part of this repo).

## Conventions

- Money amounts are stored as Postgres `numeric` (returned as strings by
  Drizzle) to avoid float precision issues — don't cast to `Number` and
  sum with `+` for aggregation; see `client/src/lib/money.ts` if
  `plans/006-cents-safe-money-summation.md` has been applied.
- Commit messages: imperative, capitalized sentences (e.g. "Add spending
  trend analysis and budget limits"), no enforced conventional-commit
  prefix.
