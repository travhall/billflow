# Plan 019: Add a Vitest test harness and a CI workflow

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

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

This repo has zero test files, no `test` script, and no CI. `pnpm check`
(a `tsc` typecheck) is the only automated gate that exists — there is no
one-command way to know the app actually behaves correctly before or
after a change. Every correctness fix in this batch's earlier plans
(001-012) had to fall back on manual `curl`/browser verification because
no test runner existed to lean on. This plan adds the minimal harness —
Vitest (fits naturally with this repo's existing Vite/ESM/TS stack) plus
one real regression test for the app's highest-value logic, and a GitHub
Actions workflow that runs typecheck + tests on every push. This is the
single highest-leverage plan in this batch: every future change to this
repo, by a human or an agent, benefits from it.

## Current state

`package.json:6-11` — current scripts, no `test` entry:
```json
"scripts": {
  "dev": "NODE_ENV=development tsx --env-file=.env server/index.ts",
  "build": "tsx script/build.ts",
  "start": "NODE_ENV=production node dist/index.cjs",
  "check": "tsc",
  "db:push": "drizzle-kit push"
},
```

No `.github/workflows/` directory exists anywhere in this repo (confirmed
via `find`). No `vitest.config.ts` or equivalent exists.

`shared/date-utils.ts` — if `plans/001-unify-due-date-calculation.md` has
already been applied, this file exists and exports `getDueDateForMonth`/
`getNextCycleDueDate`, pure functions with zero I/O dependencies — this is
the ideal first real test target for this harness, since it's exactly the
kind of logic (due-date clamping across month boundaries) that most needs
regression protection and is trivial to unit test. If plan 001 has not
been applied, this plan still adds the harness itself but Step 3's example
test targets `client/src/lib/utils.ts`'s `formatCurrency` instead (see
Step 3 for the fallback).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|----------------------|
| Install   | `pnpm install`   | exit 0               |
| Typecheck | `pnpm check`     | exit 0               |
| Test      | `pnpm test`      | exit 0, new test(s) pass |

## Scope

**In scope**:
- `package.json` — add `vitest` as a devDependency, add a `test` script.
- `vitest.config.ts` (create).
- One example test file (target depends on what's already applied — see Step 3).
- `.github/workflows/ci.yml` (create).

**Out of scope**:
- Writing tests for every existing function — this plan establishes the
  harness and one real example; broader coverage (e.g.
  `plans/020-budgets-test-coverage.md`'s manual-plan addition, or a future
  `server/storage.test.ts` covering the money-mutation paths) is separate,
  follow-on work.
- Any change to existing application code.

## Git workflow

- Branch: `advisor/019-add-test-harness-and-ci`
- Commit per step; message style matches repo history. Suggested message:
  `Add Vitest test harness and CI workflow`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Install Vitest

```bash
pnpm add -D vitest
```

**Verify**: exit 0. `package.json`'s `devDependencies` now includes
`vitest`.

### Step 2: Add config and the `test` script

Create `vitest.config.ts` at the repo root:
```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
});
```

Add to `package.json`'s `scripts`:
```json
"test": "vitest run",
```

Note `tsconfig.json:3` currently excludes `**/*.test.ts` from
compilation — leave that as-is; Vitest transpiles test files itself and
doesn't need them included in the `tsc` project.

**Verify**: `pnpm check` → exit 0 (config files themselves don't affect
the `tsc` project since test files stay excluded).

### Step 3: Add one real example test

If `shared/date-utils.ts` exists (check with
`test -f shared/date-utils.ts`, i.e. `plans/001` has been applied),
create `shared/date-utils.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getDueDateForMonth, getNextCycleDueDate } from "./date-utils";

describe("getNextCycleDueDate", () => {
  it("clamps Jan 31 monthly rollover to Feb 28 in a non-leap year", () => {
    const next = getNextCycleDueDate(new Date(2026, 0, 31), "monthly");
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });

  it("clamps Jan 31 monthly rollover to Feb 29 in a leap year", () => {
    const next = getNextCycleDueDate(new Date(2028, 0, 31), "monthly");
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(29);
  });
});

describe("getDueDateForMonth", () => {
  it("clamps dueDay 31 to the last day of a 30-day month", () => {
    const due = getDueDateForMonth({ frequency: "monthly", dueDay: 31 }, new Date(2026, 3, 1));
    expect(due?.getDate()).toBe(30);
  });
});
```

If `shared/date-utils.ts` does NOT exist (plan 001 not yet applied),
create `client/src/lib/utils.test.ts` instead, targeting the existing
`formatCurrency` function:
```ts
import { describe, it, expect } from "vitest";
import { formatCurrency } from "./utils";

describe("formatCurrency", () => {
  it("formats a whole-dollar amount", () => {
    expect(formatCurrency(100)).toContain("100");
  });
  it("formats a fractional amount with 2 decimal places", () => {
    expect(formatCurrency(19.99)).toContain("19.99");
  });
});
```
(Check `client/src/lib/utils.ts`'s actual `formatCurrency` signature and
output format before writing assertions — match its real return shape
rather than guessing exact string formatting like currency symbols or
locale.)

**Verify**: `pnpm test` → all tests pass, exit 0.

### Step 4: Add a CI workflow

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm test
```

This workflow does not need `DATABASE_URL` or any other secret — it only
runs `tsc` and Vitest against pure-function tests, neither of which
touches a real database. If future tests need a database, that's a
separate, larger change (e.g. a Postgres service container) outside this
plan's scope.

**Verify**: `cat .github/workflows/ci.yml` is valid YAML (no execution
possible locally without pushing to GitHub — this plan cannot verify the
workflow actually runs on GitHub's infrastructure from a local
environment; note this limitation in your final report rather than
claiming CI is confirmed working).

## Test plan

- `pnpm test` running the example test(s) from Step 3 is the test plan
  for this plan itself — a working harness that runs and passes is the
  deliverable.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm install` exits 0
- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 with all example tests passing
- [ ] `test -f vitest.config.ts` and `test -f .github/workflows/ci.yml` both succeed
- [ ] `grep -n '"test"' package.json` shows the new script
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm test` fails for the example test(s) — do not leave a broken test
  suite in place; either fix the test to match the real function
  signature/behavior, or report if the function itself seems broken
  (distinct from a test-authoring mistake).
- Neither `shared/date-utils.ts` nor `client/src/lib/utils.ts` exists or
  has the expected exports — report and pick a different, real,
  side-effect-free function to test rather than inventing one.

## Maintenance notes

- This is intentionally a minimal harness — one config file, one real
  test, one CI workflow. Broader test coverage (e.g. `server/storage.ts`'s
  money-mutation paths) is valuable follow-on work but was deliberately
  left out of this plan's scope to keep it landable and low-risk.
- Any future plan for this repo that touches logic with pure-function
  testable pieces should add a `.test.ts` file alongside it using this
  same Vitest setup, rather than relying solely on manual verification.
