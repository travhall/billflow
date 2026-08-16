# Plan 017: Remove the unused `attached_assets/` directory and its Vite alias

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- vite.config.ts`
> If this file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`vite.config.ts` defines a `@assets` path alias pointing at
`attached_assets/`, a directory at the repo root containing 4 PNG
screenshots. A repo-wide grep of `client/src/` for `@assets` finds zero
imports — nothing in the app actually uses this alias or these files.
`tsconfig.json`'s `paths` map doesn't even mirror this alias (it only
defines `@/*` and `@shared/*`), which is itself a smaller sign the alias
was never load-bearing for the actual app. This reads as leftover
clutter from the project's original Replit-based scaffold. Removing it
trims repo size and removes a dead alias that could otherwise mislead a
future reader into thinking there's an asset-import pattern in use here.

## Current state

`vite.config.ts:83-89`:
```ts
resolve: {
  alias: {
    "@": path.resolve(import.meta.dirname, "client", "src"),
    "@shared": path.resolve(import.meta.dirname, "shared"),
    "@assets": path.resolve(import.meta.dirname, "attached_assets"),
  },
},
```

`tsconfig.json:18-21` — confirms `@assets` was never added here either:
```json
"paths": {
  "@/*": ["./client/src/*"],
  "@shared/*": ["./shared/*"]
}
```

`attached_assets/` — a directory at the repo root containing 4 PNG files
(screenshots, per the audit's inspection; confirm current contents before
deleting, don't assume the exact filenames).

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Build     | `pnpm build` | exit 0               |

## Scope

**In scope**:
- `vite.config.ts` — the `@assets` alias line only.
- `attached_assets/` — the directory and its contents (deleted).

**Out of scope**:
- `@`/`@shared` aliases — unaffected, still in active use.
- Any other config file.

## Git workflow

- Branch: `advisor/017-remove-dead-assets-dir`
- Commit; message style matches repo history. Suggested message:
  `Remove unused attached_assets directory and its Vite alias`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-confirm zero usage before deleting anything

```bash
grep -rn "@assets" client/src/ server/ shared/ --include="*.ts" --include="*.tsx"
```

**Verify**: no output. If this returns any match, STOP — something
imports from this alias and it must not be removed.

### Step 2: Remove the alias

In `vite.config.ts`, remove the `"@assets": path.resolve(import.meta.dirname, "attached_assets"),`
line from the `resolve.alias` object.

**Verify**: `pnpm check` → exit 0.

### Step 3: Remove the directory

```bash
rm -rf attached_assets
```

**Verify**: `ls attached_assets` → "No such file or directory". `git status`
shows the directory's files as deleted.

### Step 4: Confirm the build still succeeds

```bash
pnpm build
```

**Verify**: exit 0, no errors referencing `@assets` or `attached_assets`.

## Test plan

- No automated test framework exists. Verification is Step 1's grep
  confirmation plus Step 4's build check.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Step 1's grep returns no matches
- [ ] `pnpm check` exits 0
- [ ] `pnpm build` exits 0
- [ ] `grep -c "@assets\|attached_assets" vite.config.ts` returns 0
- [ ] `test -d attached_assets` exits non-zero (directory gone)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's grep finds any usage — do not delete files that are referenced.
- `attached_assets/` contains anything other than image files when you
  check it (e.g. if it now holds something that looks intentionally
  placed, like a README or a data file) — re-verify it's genuinely dead
  clutter before deleting, since the audit only inspected it briefly.

## Maintenance notes

- If this app later needs to bundle static design assets, re-add a
  purpose-named directory and alias at that time rather than reviving
  this one — the name `attached_assets` and its lack of a corresponding
  `tsconfig.json` path entry both suggest it was never a deliberate,
  documented convention.
