# Plan 025: Memoize derived data in Analytics and Upcoming

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- client/src/pages/analytics.tsx client/src/pages/upcoming.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Note**: if `plans/006-cents-safe-money-summation.md` has been applied,
> `analytics.tsx`'s summation sites now call `sumAmounts(...)` instead of
> `reduce((sum,...) => sum + Number(...), 0)`. This plan's `useMemo`
> wrapping applies the same way regardless — wrap whichever summation
> implementation is currently present.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`analytics.tsx` computes `paidPayments`, `billMap`, `budgetMap`,
`monthlyData` (a 6-month reduce over all payments), `categoryData`,
`totalSpent`, `totalThisYear`, `billTotals`, and `thisMonthByCategory` —
none of it wrapped in `useMemo` — on every render. Because the
budget-limit inline edit input (`editValue`) is local component state
updated on every keystroke, typing a single character into that input
re-renders the whole `Analytics` component, which re-derives every one of
those computations from scratch and re-renders both Recharts components.
`upcoming.tsx`'s `getPaymentForMonth` does a linear scan over all
payments for every `(bill, month)` pair with no memoization either. At
this app's current data volume this is not perceptible, but it's a free
fix: wrapping the derivation blocks in `useMemo` removes the "recompute
everything on every keystroke" pattern entirely.

## Current state

`client/src/pages/analytics.tsx:97-163` — the unmemoized derivation
block (excerpted; exact line numbers may shift if `plans/006` was
applied first):
```ts
const paidPayments = (payments ?? []).filter(p => p.status === "paid" && p.paidDate);
const billMap = new Map((bills ?? []).map(b => [b.id, b]));
const budgetMap = new Map((budgets ?? []).map(b => [b.category, b]));

const monthlyData = Array.from({ length: 6 }, (_, i) => { /* ... */ });
const categoryMap = new Map<string, number>();
paidPayments.forEach(p => { /* ... */ });
const categoryData = Array.from(categoryMap.entries()) /* ... */;
const totalSpent = paidPayments.reduce(/* ... */);
const totalThisYear = paidPayments.filter(/* ... */).reduce(/* ... */);
const avgMonthly = /* ... */;
const billTotals = new Map<number, number>();
paidPayments.forEach(/* ... */);
const thisMonthByCategory = new Map<string, number>();
paidPayments.forEach(/* ... */);
```

`client/src/pages/analytics.tsx:75-76,322-324` — the keystroke-triggered
re-render source:
```ts
const [editValue, setEditValue] = useState("");
// ...
<input
  value={editValue}
  onChange={e => setEditValue(e.target.value)}
  // ...
/>
```

`client/src/pages/upcoming.tsx:37-43` — the unmemoized linear scan:
```ts
function getPaymentForMonth(payments: Payment[], billId: number, monthDate: Date): Payment | undefined {
  return payments.find((p) => {
    if (p.billId !== billId) return false;
    const d = parseISO(p.dueDate as unknown as string);
    return isSameMonth(d, monthDate) && isSameYear(d, monthDate);
  });
}
```
Called once per `(bill, month)` pair inside `MonthColumn` (line 58) and
again in `Upcoming`'s `forecastData` computation — 6 month columns × N
bills, all re-scanning the full `payments` array on every render.

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

## Scope

**In scope**:
- `client/src/pages/analytics.tsx` — wrap the derivation block in `useMemo`.
- `client/src/pages/upcoming.tsx` — memoize per-bill payment lookups.

**Out of scope**:
- Any change to the actual computed values or filtering logic — this plan
  is a pure performance refactor, output must be identical before/after.
- `dashboard.tsx` — has its own `processedData` derivation but wasn't
  flagged in the audit as having the same keystroke-triggered re-render
  pathology (no inline-editable input on that page); not touched here.

## Git workflow

- Branch: `advisor/025-memoize-analytics-upcoming`
- Commit per step; message style matches repo history. Suggested message:
  `Memoize derived data in Analytics and Upcoming`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Wrap Analytics' derivation block in `useMemo`

In `client/src/pages/analytics.tsx`, wrap the entire block from
`paidPayments` through `thisMonthByCategory` (everything computed from
`payments`/`bills`/`budgets` before the `allCategories` line) in a single
`useMemo`, keyed on `[payments, bills, budgets]`:

```ts
import { useMemo, useState } from "react";
// ...
const derived = useMemo(() => {
  const paidPayments = (payments ?? []).filter(p => p.status === "paid" && p.paidDate);
  const billMap = new Map((bills ?? []).map(b => [b.id, b]));
  const budgetMap = new Map((budgets ?? []).map(b => [b.category, b]));

  // ... (all the existing computation logic, unchanged, moved inside this callback)

  return { paidPayments, billMap, budgetMap, monthlyData, categoryData, totalSpent, totalThisYear, avgMonthly, billTotals, topBillName, topBillAmount, thisMonthByCategory };
}, [payments, bills, budgets]);

const { paidPayments, billMap, budgetMap, monthlyData, categoryData, totalSpent, totalThisYear, avgMonthly, billTotals, topBillName, topBillAmount, thisMonthByCategory } = derived;
```

Keep every existing line of computation logic exactly as it is — only
wrap it and destructure the result. `now`/`thisYear`/`thisMonthStart`/
`thisMonthEnd` (derived from `new Date()`) can either stay outside the
memo (recomputed each render, cheap) or move inside — moving them inside
is preferred since "today" shouldn't change within a single render cycle
anyway.

**Verify**: `pnpm check` → exit 0.

### Step 2: Memoize Upcoming's per-bill payment lookup

In `client/src/pages/upcoming.tsx`, inside `MonthColumn`, replace the
linear `getPaymentForMonth` scan with a `Map` built once per render (not
once per `find()` call) via `useMemo`:

```ts
import { useMemo } from "react";
// ...
function MonthColumn({ monthDate, bills, payments, today, isCurrentMonth }: MonthColumnProps) {
  const activeBills = bills.filter((b) => !b.archived);

  const paymentsByBillAndMonth = useMemo(() => {
    const map = new Map<string, Payment>();
    for (const p of payments) {
      const d = parseISO(p.dueDate as unknown as string);
      const key = `${p.billId}-${d.getFullYear()}-${d.getMonth()}`;
      map.set(key, p);
    }
    return map;
  }, [payments]);

  const rows = activeBills
    .map((bill) => {
      const dueDate = getMonthDueDate(bill, monthDate);
      if (!dueDate) return null;

      const key = `${bill.id}-${monthDate.getFullYear()}-${monthDate.getMonth()}`;
      const payment = paymentsByBillAndMonth.get(key);
      // ... rest of the mapping logic unchanged
    })
    // ...
}
```

Note this changes `getPaymentForMonth`'s O(bills × months × payments)
linear-scan pattern into an O(payments) map build + O(1) lookups per row,
built once per `MonthColumn` render instead of re-scanned per row. The
`getPaymentForMonth` function itself can be left in place (unused) or
removed if no other call site references it — check with
`grep -rn "getPaymentForMonth" client/src/` before removing it, since the
audit didn't confirm whether it's called anywhere beyond `MonthColumn`.

**Verify**: `pnpm check` → exit 0.

### Step 3: Manually verify both pages still render identically

With `pnpm dev` running:
1. On Analytics, confirm all cards/charts/budget-limit rows show the same
   values as before this change (compare against a screenshot or your
   memory of the page pre-change if possible). Type in a budget-limit
   input and confirm no visible lag or incorrect re-render.
2. On Upcoming, confirm all 6 month columns still show the correct bills,
   amounts, and statuses (paid/overdue/pending/upcoming) matching what
   they showed before this change.

**Verify**: both pages are visually and functionally identical to before
the refactor — this is a pure performance change, any visible difference
is a bug.

## Test plan

- No automated test framework exists. Verification is the manual visual
  comparison in Step 3, since this is a pure refactor with no intended
  behavior change — output correctness is verified by "looks the same,"
  and the performance improvement itself isn't independently measurable
  without profiling tools this plan doesn't require.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -c "useMemo" client/src/pages/analytics.tsx` shows at least 1 new usage wrapping the derivation block
- [ ] `grep -c "useMemo" client/src/pages/upcoming.tsx` shows at least 1 new usage in `MonthColumn`
- [ ] Manual Step 3 confirms both pages render identically to before
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.
- The manual visual check in Step 3 shows ANY difference in displayed
  values — this must be a behavior-preserving refactor; a value mismatch
  means the memoization dependency array is wrong (likely missing a
  dependency), not an acceptable side effect.

## Maintenance notes

- If a future change adds a new input to `payments`/`bills`/`budgets`
  that the derivation block should react to, add it to the `useMemo`
  dependency array in Step 1 — a missing dependency would show as stale
  data after that input changes.
