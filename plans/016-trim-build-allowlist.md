# Plan 016: Trim phantom (never-installed) packages from the build allowlist

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- script/build.ts package.json`
> If either file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Note**: `plans/013-remove-unused-auth-deps.md` also edits this same
> `allowlist` array, removing a different 5 entries (packages that ARE
> installed but unused in code). This plan removes 11 different entries
> (packages that were never installed at all). No line overlap between the
> two plans, but apply them in either order and re-read the array once
> after both to confirm it's coherent.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`script/build.ts`'s esbuild `allowlist` — packages to bundle into the
server build rather than leave as external `require()`s — lists 11
packages that were never installed in this project at all:
`@google/generative-ai`, `axios`, `cors`, `express-rate-limit`,
`jsonwebtoken`, `multer`, `nodemailer`, `openai`, `stripe`, `uuid`,
`xlsx`. None appear in `package.json`'s `dependencies` or
`devDependencies`. They're harmless at runtime (the allowlist only
matters for packages that are actually imported and installed), but
they're confusing leftover-template cruft: they read like this app has,
or is about to have, payment processing (`stripe`), file uploads
(`multer`), email (`nodemailer`), JWT auth (`jsonwebtoken`), and AI
integrations (`openai`/`@google/generative-ai`) — none of which exist.
Anyone (or any agent) inferring project scope from this file gets a
materially wrong picture.

## Current state

`script/build.ts:7-33` — the full `allowlist` array (after
`plans/013-remove-unused-auth-deps.md` removes its 5 entries, if applied
first; the 11 entries below are unaffected either way since they're a
disjoint set):
```ts
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",       // removed by plan 013, if applied
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",         // removed by plan 013, if applied
  "jsonwebtoken",
  "memorystore",              // removed by plan 013, if applied
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",                 // removed by plan 013, if applied
  "passport-local",           // removed by plan 013, if applied
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];
```

The 11 entries this plan removes — `@google/generative-ai`, `axios`,
`cors`, `express-rate-limit`, `jsonwebtoken`, `multer`, `nodemailer`,
`openai`, `stripe`, `uuid`, `xlsx` — are confirmed absent from
`package.json` by direct inspection of the file's `dependencies` and
`devDependencies` sections.

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Build     | `pnpm build` | exit 0, `dist/` produced |

## Scope

**In scope**:
- `script/build.ts` — the 11 phantom entries in the `allowlist` array only.

**Out of scope**:
- The 5 entries covered by `plans/013-remove-unused-auth-deps.md`
  (`connect-pg-simple`, `express-session`, `memorystore`, `passport`,
  `passport-local`) — those correspond to real, currently-installed
  (but unused) packages; removing them is that plan's job, contingent on
  also uninstalling the packages, not this plan's.
- The real, currently-used entries (`date-fns`, `drizzle-orm`,
  `drizzle-zod`, `express`, `nanoid`, `pg`, `ws`, `zod`,
  `zod-validation-error`) — not touched.

## Git workflow

- Branch: `advisor/016-trim-build-allowlist`
- Commit; message style matches repo history. Suggested message:
  `Remove never-installed packages from the build allowlist`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm each of the 11 is genuinely absent from package.json

```bash
for pkg in "@google/generative-ai" axios cors express-rate-limit jsonwebtoken multer nodemailer openai stripe uuid xlsx; do
  grep -q "\"$pkg\"" package.json && echo "FOUND (do not remove): $pkg" || echo "confirmed absent: $pkg"
done
```

**Verify**: all 11 lines print "confirmed absent". If any prints "FOUND",
STOP — that package is actually installed and should not be removed from
the allowlist without further investigation.

### Step 2: Remove the 11 confirmed-absent entries

In `script/build.ts`, remove these lines from the `allowlist` array:
`"@google/generative-ai"`, `"axios"`, `"cors"`, `"express-rate-limit"`,
`"jsonwebtoken"`, `"multer"`, `"nodemailer"`, `"openai"`, `"stripe"`,
`"uuid"`, `"xlsx"`. Leave every other entry untouched (including the 5
`plans/013` may or may not have already removed — don't re-add or
second-guess those).

**Verify**: `pnpm check` → exit 0.

### Step 3: Confirm the build still succeeds

```bash
pnpm build
```

**Verify**: exit 0, `dist/index.cjs` and `dist/public/` produced with no
new errors or warnings.

## Test plan

- No automated test framework exists. Verification is Step 1's grep
  confirmation plus Step 3's build check.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Step 1's loop confirms all 11 packages absent from `package.json`
- [ ] `pnpm check` exits 0
- [ ] `pnpm build` exits 0
- [ ] `grep -c "generative-ai\|axios\|\"cors\"\|express-rate-limit\|jsonwebtoken\|multer\|nodemailer\|openai\|stripe\|\"uuid\"\|xlsx" script/build.ts` returns 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 finds any of the 11 packages actually present in `package.json`
  — do not remove an allowlist entry for a package that's genuinely
  installed and in use.
- `pnpm build` fails after removal — investigate before assuming this
  plan's change caused it (it shouldn't, since these packages were never
  installed and thus never actually bundled).

## Maintenance notes

- If any of these integrations (payments, file uploads, email, JWT auth,
  AI) is genuinely added to this app in the future, add the real package
  to `package.json` first, then add it back to this allowlist as part of
  that feature's own work — not preemptively.
