# Plan 022: Add a `.env.example`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- .gitignore server/db.ts drizzle.config.ts server/index.ts`
> If any of these files changed since this plan was written, re-derive the
> required env vars from the live code before proceeding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

A real `.env` exists at the repo root and is correctly git-ignored
(`.gitignore:3`), but no `.env.example`/`.env.sample` is tracked. The
three required variables — `DATABASE_URL`, `PORT`, `NODE_ENV` — are only
discoverable today by grepping `server/*.ts` and `drizzle.config.ts` for
`process.env.`. A committed example file (with no real values) gives
anyone setting up a fresh clone a template to copy, and documents what's
required without needing to read source code first.

## Current state

Confirmed via grep of `process.env.` across `server/` and
`drizzle.config.ts`:
- `server/db.ts:7,13` — `DATABASE_URL` (throws if missing)
- `server/index.ts:87` — `PORT` (defaults to `"5000"` if unset)
- `drizzle.config.ts:3` — `DATABASE_URL` (also throws if missing)
- `NODE_ENV` — read in `server/index.ts` to branch dev/production behavior

`.gitignore:3` — confirms `.env` itself is excluded from version control
(this plan does not read or reproduce the actual `.env` contents).

## Commands you will need

None — this is a documentation-only change.

## Scope

**In scope**:
- `.env.example` (create).

**Out of scope**:
- The real `.env` file — not read, not modified.
- Any code change.

## Git workflow

- Branch: `advisor/022-add-env-example`
- Commit; message style matches repo history. Suggested message:
  `Add .env.example`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `.env.example`

```bash
# Neon Postgres connection string (postgresql://user:password@host/db?sslmode=require)
DATABASE_URL=

# Server port (defaults to 5000 if unset)
PORT=5000

# development | production
NODE_ENV=development
```

**Verify**: `test -f .env.example` succeeds.

### Step 2: Confirm it's tracked (not accidentally git-ignored)

```bash
git check-ignore .env.example || echo "not ignored, OK to commit"
```

**Verify**: prints "not ignored, OK to commit" — `.gitignore:3`'s `.env`
pattern should not match `.env.example` (a common gitignore pattern is
`.env` or `.env*` — if the latter, this file would be wrongly excluded;
check `.gitignore`'s actual pattern before assuming).

## Test plan

- No automated test framework applies. Verification is Step 2's
  `git check-ignore` confirmation.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `test -f .env.example` succeeds
- [ ] `grep -c "DATABASE_URL\|PORT\|NODE_ENV" .env.example` returns 3
- [ ] `git check-ignore .env.example` exits non-zero (confirming it's NOT ignored)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `.gitignore`'s pattern turns out to exclude `.env.example` too (e.g. a
  broad `.env*` pattern) — report this rather than silently force-adding
  the file with `git add -f`, since the gitignore pattern may need a
  narrower fix first.

## Maintenance notes

- If a new required environment variable is added to the app in the
  future, add it to `.env.example` in the same change.
