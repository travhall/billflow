# Plan 047: Sort the annual bills table by full date instead of month/day only

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 231fd28..HEAD -- client/src/pages/dashboard.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plan 046 (the `nextCycle` field this plan's fix reads;
  the bug this plan fixes only exists because of what 046 shipped)
- **Category**: bug (sort correctness)
- **Planned at**: commit `231fd28`, 2026-09-04

## Why this matters

The annual table's default sort (`dashboard.tsx:389-394`) orders rows by
`bill.dueMonth`/`bill.dueDay` — the bill's fixed calendar position within
*a* year, ignoring which year each row's due date actually falls in. That
was harmless before plan 046: every row's own due date always fell within
the same rough window (the current cycle), so month/day order and true
chronological order agreed.

Plan 046 changed that: a paid bill now displays its *next* cycle's due
date, which can be a full year ahead. Month/day-only sorting doesn't
account for that — a bill paid this January, now showing "Next Cycle —
Jan 2027", sorts *ahead of* a still-unpaid bill due December 2026, purely
because January comes before December in month order, even though
December 2026 is chronologically sooner. Confirmed with the owner
directly: the fix is scoped to the annual table's sort only — the
monthly table's overdue-first-then-date grouping (plan 041) is a
deliberate, separate decision and stays exactly as it is.

## Current state

Relevant file: `client/src/pages/dashboard.tsx` — only the annual
table's default sort comparator changes.

`client/src/pages/dashboard.tsx:389-394` (today):

```ts
    annualBillStatuses.sort((a, b) => {
      const aMonth = a.bill.dueMonth || 0;
      const bMonth = b.bill.dueMonth || 0;
      if (aMonth !== bMonth) return aMonth - bMonth;
      return a.bill.dueDay - b.bill.dueDay;
    });
```

`client/src/pages/dashboard.tsx:45-52` (today — `BillStatusItem`; the
`nextCycle` field this plan's fix reads, added by plan 046, unchanged
here):

```ts
type BillStatusItem = {
  bill: Bill;
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
  nextCycle?: { dueDate: Date; amount: string };
};
```

Pattern already established elsewhere in this same file for exactly this
"prefer the displayed date" concern — the monthly table's default sort
tiebreak (`dashboard.tsx`, plan 046) and `sortData`'s `'date'` case both
already do `(a.nextCycle?.dueDate ?? a.dueDate).getTime()` rather than
reading `a.dueDate` directly; this plan applies the identical pattern to
the annual table's sort.

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exits 0 |
| Tests     | `pnpm test`   | all pass (this plan adds no test files; see "Test plan" below) |
| Dev server | `pnpm dev`   | boots without error; used for manual verification |

## Scope

**In scope** (the only file you should modify):
- `client/src/pages/dashboard.tsx`

**Out of scope** (do NOT touch, even though related):
- `monthlyBillStatuses.sort` (the status-priority-then-date comparator
  from plan 041) — stays exactly as-is. The owner explicitly confirmed
  this plan is annual-table-only; do not add status grouping there and
  do not remove it from the monthly table.
- `sortData`'s `'date'`/`'amount'` column-header-click cases — already
  `nextCycle`-aware from plan 046, unaffected by this plan (they apply to
  both tables already, via the shared `sortData` function; this plan only
  touches the annual table's *default*, pre-column-click order, the same
  distinction plan 041 drew for the monthly table).
- `getBillCycleStatus`, `getUrgencyDisplay`, the table cells — unrelated
  to a sort-order fix, not touched.
- `client/src/pages/upcoming.tsx` — separate status/sort model, out of
  scope, consistent with every prior plan touching this display logic.

## Git workflow

- Branch: `advisor/047-annual-table-sort-by-full-date`
- Commit message style: imperative, capitalized sentence, no
  conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Sort the annual table by full displayed date, not month/day

Change `client/src/pages/dashboard.tsx:389-394` from:

```ts
    annualBillStatuses.sort((a, b) => {
      const aMonth = a.bill.dueMonth || 0;
      const bMonth = b.bill.dueMonth || 0;
      if (aMonth !== bMonth) return aMonth - bMonth;
      return a.bill.dueDay - b.bill.dueDay;
    });
```

to:

```ts
    annualBillStatuses.sort((a, b) => {
      const aDate = (a.nextCycle?.dueDate ?? a.dueDate).getTime();
      const bDate = (b.nextCycle?.dueDate ?? b.dueDate).getTime();
      return aDate - bDate;
    });
```

This reads the same value already displayed in each row's Due Date
column (per plan 046), full year included, so the default order always
matches what's chronologically soonest — a bill showing "Dec 19, 2026"
now correctly sorts ahead of one showing "Jun 24, 2027", regardless of
which bill's *configured* month/day is numerically smaller.

**Verify**: `pnpm check` → exits 0.

## Test plan

No new automated tests — a one-comparator sort change with no React
rendering harness available in this repo, same as every prior plan
touching this file's display logic. Verify manually against a live
`pnpm dev` + the owner's real Neon DB:

1. Load the Dashboard. In "Annual Bills Overview", confirm rows are now
   ordered by their *displayed* due date chronologically — e.g. any bill
   showing a 2026 date sorts ahead of any bill showing a 2027 date,
   regardless of month number (this is the direct regression check: `Mint
   Mobile: Travis`/`Mint Mobile: Erin`, both showing "Next Cycle" dates
   in mid-2027, must sort *after* every bill still showing a 2026 date,
   even ones with a numerically later month like December).
2. Click the "Due Date" column header, then click it again (toggle
   descending). Confirm both directions still work correctly and are
   unaffected by this change (they already used `sortData`'s
   `nextCycle`-aware `'date'` case from plan 046).
3. Confirm the monthly table ("Upcoming Monthly Bills") is completely
   unaffected — same overdue-first-then-date order as before this plan.
4. Confirm the stats card and filter pills are unaffected (this plan
   touches only row order, not any computed value).

**Verify**: all 4 observations above hold as described.

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (unchanged pass count — this plan adds no test files)
- [ ] `grep -n "aMonth\|bMonth" client/src/pages/dashboard.tsx` → no matches (confirms the old month/day comparator is fully gone, not shadowed)
- [ ] `grep -n "annualBillStatuses.sort" -A 4 client/src/pages/dashboard.tsx` → matches the new comparator shown in Step 1
- [ ] No files outside `client/src/pages/dashboard.tsx` modified (`git status`)
- [ ] All 4 manual observations confirmed live
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpt above (lines 389-394) doesn't match the
  live code (drift since this plan was written).
- `pnpm check` reports new errors you can't resolve in one reasonable fix
  attempt.
- You find `bill.dueMonth`/`bill.dueDay` used for sorting anywhere else
  in this file beyond the block this plan replaces — report rather than
  assume the same fix should apply there too without being asked.

## Maintenance notes

- `bill.dueMonth`/`bill.dueDay` remain the source of truth for *what
  calendar position* a yearly bill recurs on (used elsewhere for due-date
  calculation, unrelated to this plan) — this plan only changes what the
  *table row order* is derived from, not the underlying scheduling logic.
- If the monthly table's grouping is ever revisited to also apply to the
  annual table (a deliberate future decision, not this plan's), the
  comparator this plan introduces is the correct chronological tiebreak
  to combine it with — same pattern already used in
  `monthlyBillStatuses.sort`.
