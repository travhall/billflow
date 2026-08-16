# Plan 006: Sum money amounts in integer cents instead of floating-point `Number()`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- client/src/pages/analytics.tsx client/src/pages/dashboard.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`shared/schema.ts` deliberately uses Drizzle's `numeric` column type (which
Drizzle returns to JS as a **string**, not a float) for `bills.defaultAmount`
and `payments.amount` — a schema comment even says `// Use string for
decimals` (`shared/schema.ts:20`). This is the correct choice for currency.
But the client then throws that precision away: every aggregation of
payment/bill amounts on the Analytics and Dashboard pages coerces through
`Number(...)` and sums with plain `+`, which is IEEE-754 floating point
arithmetic — the same class of bug behind the classic `0.1 + 0.2 !== 0.3`.
Summed across many bills/payments, this can produce a cent (or larger)
discrepancy in displayed totals: budget-vs-actual comparisons, the
dashboard's "Total Monthly Budget" progress bar, and Analytics' monthly/
category charts. This plan adds one small, reusable summation helper that
sums in integer cents and replaces every ad hoc `reduce(...+ Number(...))`
site with it.

## Current state

`shared/schema.ts:20,33` — the schema's own comment on why `numeric` was chosen:
```ts
defaultAmount: numeric("default_amount").notNull(), // Use string for decimals
// ...
amount: numeric("amount").notNull(),
```

`client/src/pages/analytics.tsx` — 6 separate float-summation sites (exact
line numbers may shift slightly with file edits from other plans; search
for `Number(p.amount)` and `Number(item` patterns to relocate them):
- Lines ~112, 120, 127, 132, 139, 159 — each a `reduce((sum, p) => sum + Number(p.amount), 0)` or equivalent over a filtered payments list, computing per-category totals, monthly totals, and budget-vs-spend comparisons.

`client/src/pages/dashboard.tsx:205-211` — 3 more sites in `processedData`:
```ts
const totalDue = monthlyBillStatuses.reduce((acc, item) => acc + Number(item.bill.defaultAmount), 0);
const totalPaid = monthlyBillStatuses
  .filter(item => item.status === "paid")
  .reduce((acc, item) => acc + Number(item.amount), 0);
const totalPending = monthlyBillStatuses
  .filter(item => item.status !== "paid")
  .reduce((acc, item) => acc + Number(item.bill.defaultAmount), 0);
```

`client/src/lib/utils.ts` already contains `formatCurrency` — the single
existing display-formatting boundary this plan's new helper is meant to
feed into (not duplicate).

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |

No automated test runner exists. Verification uses a standalone script via
`tsx`, following the same pattern as `plans/001-unify-due-date-calculation.md`.

## Scope

**In scope**:
- `client/src/lib/money.ts` (create)
- `client/src/pages/analytics.tsx` — all `Number(...)`-based summation sites
- `client/src/pages/dashboard.tsx` — the 3 `reduce` sites at lines ~205-211

**Out of scope**:
- `client/src/pages/upcoming.tsx`'s totals (`totalDue`/`totalPaid` in
  `MonthColumn`, `forecastData` in `Upcoming`) — same class of issue, but
  left out of this plan's blast radius; note as a follow-up in Maintenance
  notes rather than silently expanding scope.
- Any change to how amounts are stored, transmitted, or validated
  server-side — this plan is purely about client-side display aggregation.
- `formatCurrency` itself — not modified, only fed correctly-summed values.

## Git workflow

- Branch: `advisor/006-cents-safe-money-summation`
- Commit per step; message style matches repo history. Suggested message:
  `Sum currency amounts in integer cents to avoid float rounding drift`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the cents-safe summation helper

Create `client/src/lib/money.ts`:

```ts
/**
 * Sums an array of currency amount strings (as returned by Drizzle's
 * `numeric` columns) without floating-point drift, by converting each to
 * integer cents before summing and dividing back at the end.
 */
export function sumAmounts(amounts: (string | number)[]): number {
  const totalCents = amounts.reduce((cents, a) => {
    const n = typeof a === "string" ? Number(a) : a;
    return cents + Math.round(n * 100);
  }, 0);
  return totalCents / 100;
}
```

**Verify**: `pnpm check` → exit 0.

### Step 2: Prove it with a standalone script

Create `verify-money.ts` at the repo root (do NOT commit — delete after
this step passes):

```ts
import { sumAmounts } from "./client/src/lib/money";

const cases: [string, () => boolean][] = [
  ["classic float trap: 0.1 + 0.2 sums to exactly 0.3", () => sumAmounts(["0.1", "0.2"]) === 0.3],
  ["many small amounts sum exactly", () => sumAmounts(Array(10).fill("10.10")) === 101.00],
  ["mixed large/small amounts", () => sumAmounts(["1200.00", "15.99", "60.01"]) === 1276.00],
];

let failed = 0;
for (const [name, fn] of cases) {
  const ok = fn();
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) failed++;
}
process.exit(failed > 0 ? 1 : 0);
```

**Verify**: `pnpm tsx verify-money.ts` → all 3 lines print `PASS`. Delete
`verify-money.ts` after this passes.

### Step 3: Replace the summation sites in `dashboard.tsx`

In `client/src/pages/dashboard.tsx`, replace lines ~205-211:

```ts
import { sumAmounts } from "@/lib/money";
// ...
const totalDue = sumAmounts(monthlyBillStatuses.map(item => item.bill.defaultAmount));
const totalPaid = sumAmounts(
  monthlyBillStatuses.filter(item => item.status === "paid").map(item => item.amount)
);
const totalPending = sumAmounts(
  monthlyBillStatuses.filter(item => item.status !== "paid").map(item => item.bill.defaultAmount)
);
```

**Verify**: `pnpm check` → exit 0.

### Step 4: Replace the summation sites in `analytics.tsx`

Locate each `reduce((sum, ...) => sum + Number(...), 0)` pattern in
`client/src/pages/analytics.tsx` (6 sites per the audit) and replace with
`sumAmounts([...].map(...))` following the same shape as Step 3. Import
`sumAmounts` from `@/lib/money` at the top of the file. Do not change the
filtering logic that selects which payments/bills feed into each total —
only change how the final sum is computed.

**Verify**: `pnpm check` → exit 0 after each replacement (or once at the
end, executor's choice, as long as all 6 sites are covered).

## Test plan

- No automated test framework exists. Verification is the standalone
  script in Step 2 (which specifically targets the `0.1 + 0.2` float trap)
  plus a manual smoke test: on the Analytics page, add several bills with
  amounts likely to trigger float drift (e.g. `10.10` repeated many times,
  or `19.99` + `0.01`) and confirm the displayed category/monthly totals
  match manual addition exactly (no `$X.XX000000001`-style artifacts if
  you inspect the raw computed value before `formatCurrency` rounds it for
  display — `formatCurrency`'s existing rounding was already masking most
  of this bug from the UI, which is why it wasn't visibly broken before).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `verify-money.ts`'s 3 cases all print `PASS` (then delete the temp file — confirm with `git status` it is not tracked)
- [ ] `grep -c "sumAmounts" client/src/pages/analytics.tsx` returns 6 (or however many summation sites were actually found — confirm the count matches what you located, and note in your final report if it differs from 6)
- [ ] `grep -c "sumAmounts" client/src/pages/dashboard.tsx` returns 3
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find, or the number
  of `Number(...)`-summation sites in `analytics.tsx` differs meaningfully
  from the 6 estimated here (e.g. if refactoring by another plan already
  changed this file) — report the actual count rather than guessing which
  ones to change.
- `pnpm check` fails after any replacement for a reason unrelated to a
  missing import.

## Maintenance notes

- `client/src/pages/upcoming.tsx` has the same summation pattern
  (`totalDue`/`totalPaid` in `MonthColumn`, `forecastData` in `Upcoming`)
  and was deliberately left out of this plan's scope — a natural follow-up
  once this pattern is proven out here.
- Any new feature that sums currency amounts on the client should use
  `sumAmounts` from `client/src/lib/money.ts` rather than reintroducing
  `reduce(...+ Number(...))`.
