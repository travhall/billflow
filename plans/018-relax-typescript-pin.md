# Plan 018: Relax the exact TypeScript version pin to a caret range

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- package.json`
> If this file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dependency
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

Every dependency in `package.json` uses a caret range (`^x.y.z`) except
`typescript`, which is pinned to an exact version (`7.0.2`, no `^`). This
was confirmed intentional, not a typo or lockfile drift (the exact
version resolves consistently in `pnpm-lock.yaml`), but it's inconsistent
with the rest of the file and means this project won't automatically pick
up TypeScript patch releases (bug fixes, incremental-build performance
improvements) the way every other dependency does. This is a small,
low-risk consistency fix, not a major-version change.

## Current state

`package.json` (devDependencies section):
```json
"typescript": "7.0.2",
```
Every other entry in both `dependencies` and `devDependencies` uses `^`
(e.g. `"vite": "^8.2.1"`, `"express": "^5.2.1"`).

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Install   | `pnpm install` | exit 0             |
| Typecheck | `pnpm check` | exit 0               |

## Scope

**In scope**:
- `package.json` — the `typescript` version string only.

**Out of scope**:
- Any other dependency version change.
- Upgrading to a different TypeScript major/minor version — this plan
  only relaxes the range, it doesn't bump the installed version.

## Git workflow

- Branch: `advisor/018-relax-typescript-pin`
- Commit; message style matches repo history. Suggested message:
  `Relax TypeScript version pin to a caret range for consistency`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Change the pin

In `package.json`, change:
```json
"typescript": "7.0.2",
```
to:
```json
"typescript": "^7.0.2",
```

**Verify**: `pnpm check` → exit 0 (this alone won't change the installed
version — `pnpm install` in Step 2 is what would pick up a newer patch if
one exists).

### Step 2: Reinstall and confirm typecheck still passes

```bash
pnpm install
pnpm check
```

**Verify**: both exit 0. If `pnpm install` resolves a newer TypeScript
patch version and `pnpm check` then fails, that's a genuine new
type-checking issue introduced by the newer compiler — report it rather
than reverting the pin silently, since surfacing that tradeoff (pin vs.
auto-update) is exactly the point of this plan.

## Test plan

- No automated test framework exists. Verification is `pnpm check` after
  `pnpm install`, confirming the relaxed range doesn't break typechecking.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n '"typescript"' package.json` shows `^7.0.2` (or whatever
  patch version `pnpm install` resolved to, prefixed with `^`)
- [ ] `pnpm install` exits 0
- [ ] `pnpm check` exits 0
- [ ] No files outside the in-scope list are modified (`git status` — note `pnpm-lock.yaml` update is expected and fine)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm check` fails after `pnpm install` picks up a newer TypeScript
  version — report the actual compiler errors rather than pinning back to
  `7.0.2` silently or trying to fix unrelated type errors as a side
  effect of this plan.

## Maintenance notes

- If TypeScript releases meaningful breaking changes in a future patch
  (unusual, but possible pre-1.0-stable native-compiler-era releases can
  behave this way), this caret range would pick it up automatically on
  the next `pnpm install`. If that ever causes problems, re-pin to an
  exact version at that time with a comment explaining why.
