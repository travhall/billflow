# Plan 023: Add ESLint and Prettier

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
- **Category**: dx
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

No `eslint.config.*`, `.eslintrc*`, `.prettierrc`, or `.editorconfig`
exists anywhere in this repo. `pnpm check` (`tsc`) is the only static
analysis gate — it catches type errors but not unused variables,
unreachable code, React hook-dependency mistakes, or stylistic drift.
Low urgency for a solo developer today, but as more changes land
(including from executor agents working off the plans in this batch),
consistent linting catches a class of mistakes `tsc` doesn't, and a
formatter keeps diffs free of style-only noise.

## Current state

`package.json:6-11` — no `lint` or `format` script exists. Confirmed via
`find` that no ESLint or Prettier config files exist anywhere in the repo
root.

## Commands you will need

| Purpose | Command      | Expected on success |
|---------|--------------|----------------------|
| Install | `pnpm add -D <packages>` | exit 0 |
| Lint    | `pnpm lint`  | exit 0 (or a list of pre-existing warnings — see Step 4) |

## Scope

**In scope**:
- `package.json` — add `eslint`, `typescript-eslint`,
  `eslint-plugin-react-hooks`, `prettier` as devDependencies; add `lint`
  and `format` scripts.
- `eslint.config.js` (create, flat config format).
- `.prettierrc.json` (create).

**Out of scope**:
- Actually fixing any pre-existing lint warnings this first run surfaces
  — that's separate follow-up triage work, not this plan's job (see
  Step 4).
- Pre-commit hooks (husky, lint-staged) — a reasonable follow-up, not
  included here to keep this plan's scope to "the tools exist and run
  cleanly as configured," not "enforcement is automatic."

## Git workflow

- Branch: `advisor/023-add-eslint-prettier`
- Commit per step; message style matches repo history. Suggested message:
  `Add ESLint and Prettier configuration`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Install packages

```bash
pnpm add -D eslint typescript-eslint eslint-plugin-react-hooks prettier
```

**Verify**: exit 0.

### Step 2: Add ESLint flat config

Create `eslint.config.js`:
```js
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
```
`no-explicit-any` is turned off deliberately — this codebase uses `any` in
a handful of pragmatic spots (form handlers, seed data) and this plan's
goal is establishing the tool, not enforcing a stricter style than the
codebase currently follows; revisit later if desired.

**Verify**: `pnpm exec eslint --version` → prints a version, confirms the
binary resolves.

### Step 3: Add Prettier config and scripts

Create `.prettierrc.json`:
```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all"
}
```
(matches this codebase's observed existing style — double quotes,
semicolons, trailing commas in multiline — confirm against a few existing
files like `server/routes.ts` before finalizing; adjust if the actual
predominant style differs from these defaults.)

Add to `package.json`'s `scripts`:
```json
"lint": "eslint .",
"format": "prettier --write ."
```

**Verify**: `pnpm check` → exit 0 (config files don't affect typecheck).

### Step 4: Run lint once and report the baseline (do not fix)

```bash
pnpm lint
```

**Verify**: the command runs to completion (exit 0 or non-zero with a
list of warnings/errors — either is an acceptable outcome for this step).
Report the count of warnings/errors found in your final summary, but do
**not** fix them as part of this plan — that's separate triage work with
its own risk profile per file. This plan's job is "the tool works and
runs," not "the codebase is now lint-clean."

## Test plan

- No automated test framework applies. Verification is `pnpm lint`
  actually running (Step 4) and `pnpm check` still passing (Step 3).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm exec eslint --version` succeeds
- [ ] `test -f eslint.config.js` and `test -f .prettierrc.json` both succeed
- [ ] `grep -n '"lint"\|"format"' package.json` shows both scripts present
- [ ] `pnpm lint` runs to completion (any exit code) — its output is reported, not silently discarded
- [ ] No files outside the in-scope list are modified (`git status`) — critically, no files should be auto-fixed/reformatted by this plan; `pnpm format` is added but not run against the whole codebase here
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- ESLint's flat config fails to load (`pnpm exec eslint --version` or
  `pnpm lint` errors out on config parsing, not on lint findings) —
  report the actual config error rather than guessing at a fix, since
  flat-config syntax is version-sensitive.

## Maintenance notes

- This plan deliberately does not run `pnpm format` against the whole
  codebase or fix any lint findings — both are separate, larger-blast-
  radius changes better done as their own reviewed follow-up once the
  baseline warning count is known.
- If pre-commit enforcement (husky + lint-staged) is wanted later, that's
  a natural next step once the lint baseline above is triaged down to a
  manageable/zero count.
