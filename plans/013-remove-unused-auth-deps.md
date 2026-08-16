# Plan 013: Remove the unused passport/session dependency stack

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- package.json script/build.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`package.json` lists `passport`, `passport-local`, `connect-pg-simple`,
`memorystore`, and `express-session` (plus their `@types/*` packages) as
dependencies. A repo-wide grep for each package name across `server/`,
`shared/`, and `client/src/` (excluding `node_modules`) turns up zero
imports — no session middleware, no auth strategy, nothing. This app has
no login system by design (it's a single-user personal tool) and none of
this scaffolding is wired up. It's pure dead weight: it inflates
`node_modules`, adds unreachable surface area to every `npm audit`/
Dependabot scan, and misleads a future reader (human or agent) into
thinking session-based auth exists or is half-built when it doesn't.

## Current state

`package.json` dependencies (exact version strings may drift slightly —
confirm current values before editing, don't hardcode these):
```json
"connect-pg-simple": "^10.0.0",
"express-session": "^1.19.0",
"memorystore": "^1.6.8",
"passport": "^0.7.0",
"passport-local": "^1.0.0",
```
and devDependencies:
```json
"@types/connect-pg-simple": "^7.0.3",
"@types/express-session": "^1.19.0",
"@types/passport": "^1.0.17",
"@types/passport-local": "^1.0.38",
```

`script/build.ts:7-33` — the esbuild `allowlist` array (packages bundled
into the server build rather than left external) includes these same 5
runtime packages at lines 10, 17, 19, 24-25:
```ts
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];
```
This plan only removes the 5 entries that correspond to the packages being
uninstalled (`connect-pg-simple`, `express-session`, `memorystore`,
`passport`, `passport-local`). The other 11 entries in this array
(`@google/generative-ai`, `axios`, `cors`, `express-rate-limit`,
`jsonwebtoken`, `multer`, `nodemailer`, `openai`, `stripe`, `uuid`, `xlsx`)
reference packages that were never installed at all — that's a separate,
independent cleanup covered by `plans/016-trim-build-allowlist.md`.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|----------------------|
| Remove    | `pnpm remove <packages>` | exit 0, `package.json`/`pnpm-lock.yaml` updated |
| Typecheck | `pnpm check`     | exit 0               |
| Build     | `pnpm build`     | exit 0, `dist/` produced |

## Scope

**In scope**:
- `package.json` — remove the 5 runtime deps and 4 `@types/*` devDeps listed above.
- `pnpm-lock.yaml` — regenerated automatically by `pnpm remove`.
- `script/build.ts` — remove the 5 matching allowlist entries only.

**Out of scope**:
- The other 11 phantom allowlist entries — `plans/016-trim-build-allowlist.md`.
- Any actual auth implementation — out of scope entirely; this plan only removes unused scaffolding, it doesn't replace it with anything.

## Git workflow

- Branch: `advisor/013-remove-unused-auth-deps`
- Commit; message style matches repo history. Suggested message:
  `Remove unused passport/session dependency stack`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-confirm zero usage before removing anything

```bash
grep -rn "passport\|connect-pg-simple\|memorystore\|express-session" server/ shared/ client/src/ --include="*.ts" --include="*.tsx"
```

**Verify**: no output (zero matches). If this returns any match, STOP —
the codebase has changed since this plan was written and these packages
may now be in use.

### Step 2: Remove the packages

```bash
pnpm remove passport passport-local connect-pg-simple memorystore express-session @types/connect-pg-simple @types/express-session @types/passport @types/passport-local
```

**Verify**: exit 0. `git diff package.json` shows all 9 lines removed
(5 runtime + 4 types) and no unrelated lines changed. `pnpm-lock.yaml`
is regenerated (will show as modified in `git status`).

### Step 3: Remove the matching entries from `script/build.ts`'s allowlist

Remove these 5 lines from the `allowlist` array in `script/build.ts`
(lines 10, 17, 19, 24-25 in the "Current state" excerpt above —
re-locate by content, not line number, since the file may have shifted):
`"connect-pg-simple"`, `"express-session"`, `"memorystore"`, `"passport"`,
`"passport-local"`. Leave every other entry untouched.

**Verify**: `pnpm check` → exit 0.

### Step 4: Confirm the build still succeeds

```bash
pnpm build
```

**Verify**: exit 0, `dist/index.cjs` and `dist/public/` are produced with
no new warnings about the removed packages (esbuild would warn/error if
something still tried to import one of them and it wasn't found).

## Test plan

- No automated test framework exists. Verification is Steps 1-4: grep
  confirming zero usage before removal, then `pnpm check` and `pnpm build`
  confirming nothing broke after removal.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "passport\|connect-pg-simple\|memorystore\|express-session" package.json` returns 0
- [ ] `grep -c "passport\|connect-pg-simple\|memorystore\|express-session" script/build.ts` returns 0
- [ ] `pnpm check` exits 0
- [ ] `pnpm build` exits 0
- [ ] `pnpm-lock.yaml` no longer references any of the 9 removed packages (`grep -c "passport\|connect-pg-simple\|memorystore\|express-session" pnpm-lock.yaml` returns 0, or only matches transitive deps of other unrelated packages if any exist — inspect any remaining match before assuming it's a problem)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's grep finds any usage — do not remove packages that are
  actually referenced somewhere the audit missed.
- `pnpm build` fails after removal — this would mean something depends on
  one of these packages in a way that isn't a simple TypeScript import
  (e.g. a runtime `require()` string, or a peer dependency of something
  else still installed) — investigate and report rather than reverting
  silently or force-continuing.

## Maintenance notes

- If session-based authentication is ever actually built for this app,
  re-add these packages (or evaluate a more modern alternative) at that
  time rather than treating their removal here as a decision against ever
  adding auth — it's purely a "remove what's unused today" cleanup.
