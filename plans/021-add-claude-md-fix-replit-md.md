# Plan 021: Add a CLAUDE.md and fix the stale claims in replit.md

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- replit.md package.json`
> If either file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

No `CLAUDE.md` or `AGENTS.md` exists in this repo, and no `README.md`
exists at the root either — `replit.md` is the only project-overview
document, but it was written for the app's original Replit-hosted context
and hasn't been updated since the project migrated to local development
with Neon Postgres and Cloudflare R2 backups. Specifically:
`replit.md:14` claims "React 18 with TypeScript" while `package.json`
pins `"react": "^19.2.8"`; it never mentions `pnpm` (the actual package
manager per `pnpm-lock.yaml`); it lists only `connect-pg-simple` as
"available but not currently implemented" when `express-session`,
`passport`, `passport-local`, and `memorystore` are equally unused; and
its "Development vs Production" section describes only Vite dev server
and static file serving, with no mention of the Neon database or the
nightly R2 backup that now exists (`script/backup-db.sh`). A fresh
CLAUDE.md gives any future session (agent or human) accurate project
structure, commands, and conventions without re-deriving them from
scratch every time; fixing replit.md's stale claims stops it from
actively misleading a reader.

## Current state

`replit.md:14` (React version claim):
```
- **Framework**: React 18 with TypeScript
```
Actual: `package.json` pins `"react": "^19.2.8"`.

`replit.md:57-60` ("Development vs Production" section):
```
### Development vs Production
- **Development**: Vite dev server with HMR, integrated with Express backend
- **Production**: Static files served from `dist/public`, server bundled to `dist/index.cjs`
```
No mention of Neon, `DATABASE_URL`, or the R2 backup script.

`replit.md:65` (dependency list, incomplete per the audit):
```
- **connect-pg-simple**: Session storage for PostgreSQL (available but not currently implemented)
```
`package.json` also lists `express-session`, `passport`, `passport-local`,
`memorystore` as equally unused (confirmed via grep; see
`plans/013-remove-unused-auth-deps.md`, which may have already removed
these by the time this plan runs — see Step 2's conditional handling).

`tsconfig.json:16-19` — the path aliases worth documenting in `CLAUDE.md`:
```json
"paths": {
  "@/*": ["./client/src/*"],
  "@shared/*": ["./shared/*"]
}
```

Required env vars (confirmed via grep of `process.env.` across `server/`
and `drizzle.config.ts`): `DATABASE_URL`, `PORT`, `NODE_ENV`.

## Commands you will need

None — this is a documentation-only change.

## Scope

**In scope**:
- `CLAUDE.md` (create).
- `replit.md` — the 3 stale sections identified above only.

**Out of scope**:
- Renaming or restructuring `replit.md` into a `README.md` — kept as-is,
  just corrected, to minimize scope; a full README is a separate,
  reasonable follow-up but not this plan's job.
- `package.json`'s `"name": "rest-express"` boilerplate name — cosmetic,
  not touched here.

## Git workflow

- Branch: `advisor/021-add-claude-md-fix-replit-md`
- Commit; message style matches repo history. Suggested message:
  `Add CLAUDE.md and fix stale claims in replit.md`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create CLAUDE.md

Create `CLAUDE.md` at the repo root:

```markdown
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
```

**Verify**: the file is well-formed markdown; no automated check available
beyond visual inspection.

### Step 2: Fix the React version claim in replit.md

In `replit.md`, change line 14 from:
```
- **Framework**: React 18 with TypeScript
```
to:
```
- **Framework**: React 19 with TypeScript
```

**Verify**: `grep -n "React 19" replit.md` shows the corrected line.

### Step 3: Fix the "Development vs Production" section

In `replit.md`, replace the "Development vs Production" section
(originally lines 57-60) with:
```markdown
### Development vs Production
- **Development**: `pnpm dev` runs Vite dev server with HMR, integrated with the Express backend, against a Neon-hosted PostgreSQL database (`DATABASE_URL` in `.env`)
- **Production**: Static files served from `dist/public`, server bundled to `dist/index.cjs` via `pnpm build` + `pnpm start`
- **Backups**: Nightly `pg_dump` of the database to Cloudflare R2 via `script/backup-db.sh`
```

**Verify**: `grep -n "Neon\|R2" replit.md` shows both new references present.

### Step 4: Fix the incomplete dependency list

In `replit.md`, locate the line documenting `connect-pg-simple`
(originally line 65) and expand it. First check whether
`plans/013-remove-unused-auth-deps.md` has already been applied
(`grep -c "passport" package.json` — if 0, the packages are gone):

- **If plan 013 has been applied** (packages already removed): replace
  the `connect-pg-simple` bullet with a note that the previously-unused
  session/auth dependency stack (`connect-pg-simple`, `express-session`,
  `passport`, `passport-local`, `memorystore`) was removed as unused.
- **If plan 013 has NOT been applied**: expand the bullet to list all 5
  unused packages, not just `connect-pg-simple`:
  ```markdown
  - **connect-pg-simple, express-session, passport, passport-local, memorystore**: Session/auth dependency stack — installed but not currently implemented (this app has no login system by design; single-user, local use)
  ```

**Verify**: `grep -n "express-session\|removed as unused" replit.md` shows
the corrected/expanded line (whichever branch applies).

## Test plan

- No automated test framework applies to documentation changes.
  Verification is the grep checks in each step above, confirming the
  stale claims were actually corrected.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `test -f CLAUDE.md` succeeds
- [ ] `grep -n "pnpm dev\|pnpm check\|DATABASE_URL" CLAUDE.md` shows all three present
- [ ] `grep -c "React 18" replit.md` returns 0
- [ ] `grep -n "React 19" replit.md` shows the corrected claim
- [ ] `grep -n "Neon\|R2" replit.md` shows both present in the Development vs Production section
- [ ] `grep -c "available but not currently implemented" replit.md` still shows the dependency note, now covering all 5 packages (or the "removed" note if plan 013 was applied first)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code/doc content at "Current state" doesn't match what you find.

## Maintenance notes

- Keep `CLAUDE.md` updated as this repo's structure changes — it's the
  fastest way to give a future agent session accurate context without
  re-deriving it from the codebase each time.
- `pnpm db:push`'s "no versioned migrations" note in `CLAUDE.md` reflects
  a deliberate, audited tradeoff (see the original audit's DEPS-04
  finding) — not a gap to silently "fix" by adding migrations as part of
  unrelated future work.
