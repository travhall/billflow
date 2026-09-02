# Plan 041: Sort the monthly bill table actionable-first, paid last

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7779a91..HEAD -- client/src/pages/dashboard.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plan 040 (merged to `main` as of this plan — the bug it
  fixed is what made this plan's problem visible: before 040, a paid bill
  never actually reported `status: "paid"`, so this sort-order issue
  couldn't have surfaced the way it did)
- **Category**: bug (UX / row prioritization)
- **Planned at**: commit `7779a91`, 2026-09-02

## Why this matters

Now that plan 040 correctly reports a bill as `"paid"` for its current
cycle, the owner noticed a follow-on issue: the "Upcoming Monthly Bills"
table's default row order is a flat ascending sort on `dueDate`
(`client/src/pages/dashboard.tsx:387`), with no regard for `status`. A
paid bill's due date is its *already-passed* current-cycle date (e.g.
`RCU: Mortgage`, paid, `dueDate: Sep 1`) — so it sorts ahead of a
still-unpaid bill due later in the month (e.g. `USI: Internet`, unpaid,
`dueDate: Sep 14`), even though the paid one needs zero further attention
and the unpaid one is the actual next thing to act on. The table's default
view currently puts settled bills at the top and the real to-do items
further down.

This is a pure row-*ordering* change, independent of plan 040's status
derivation and the stats-card totals — neither is touched here. Scoped to
the monthly table only, per the owner's direction: the annual table's
"Next Cycle" state is the normal condition for most bills most of the
year (not an edge case the way it now is for monthly bills post-040), so
actionable-first ordering there wouldn't clearly help and chronological
browsing stays more useful — leave `annualBillStatuses`'s sort untouched.

## Current state

Relevant file: `client/src/pages/dashboard.tsx` — same `processedData`
`useMemo` plan 040 touched, but this plan only changes the default sort
comparator; nothing about `getBillCycleStatus` or how `status`/`dueDate`
are computed changes.

`client/src/pages/dashboard.tsx:45-51` (the type — unchanged by this
plan; `status` is exactly the 3-value field this plan's new comparator
groups by):

```ts
type BillStatusItem = {
  bill: Bill;
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
};
```

`client/src/pages/dashboard.tsx:386-393` (today — the default-sort block;
this plan changes only the `monthlyBillStatuses.sort(...)` line, line
387; `annualBillStatuses.sort(...)` right below it is unchanged, per
Scope):

```ts
    // Default sorts then apply user sort
    monthlyBillStatuses.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    annualBillStatuses.sort((a, b) => {
      const aMonth = a.bill.dueMonth || 0;
      const bMonth = b.bill.dueMonth || 0;
      if (aMonth !== bMonth) return aMonth - bMonth;
      return a.bill.dueDay - b.bill.dueDay;
    });
```

How this interacts with explicit column-header sorting (unchanged by this
plan, shown for context only — confirms this plan's change affects only
the *default*, unsorted view): `sortData` (`dashboard.tsx:335-360`)
returns its input unchanged when `sortConfig` is `null` — the initial
state (`dashboard.tsx:297`, `useState<SortConfig>(null)`) — so the array
order produced by the line-387 sort above is exactly what renders by
default. The moment a user clicks a column header (e.g. "Due Date"),
`sortConfig` becomes non-null and `sortData` takes over with a literal
per-column comparator instead — that behavior is untouched by this plan;
clicking "Due Date" will still sort literally by date, paid bills
included, exactly as it does today.

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
- `annualBillStatuses.sort(...)` (`dashboard.tsx:388-392`, immediately
  below the line this plan changes) — stays chronological by
  month/day, unchanged, per the owner's explicit "monthly only" direction.
- `getBillCycleStatus` (`client/src/lib/bill-status.ts`, from plan 040) —
  not touched. This plan only reorders rows using the `status` and
  `dueDate` values it already produces; it does not change what those
  values are.
- `sortData` and the column-header click sorting behavior
  (`dashboard.tsx:335-360`, `591-606`-area headers) — unchanged. Clicking
  a column header (including "Due Date") should keep behaving exactly as
  it does today; this plan only changes the *default* pre-sort order that
  applies when no column header is active.
- `totalDue`/`totalPaid`/`totalPending`/`overdueCount` — all computed
  before the sort lines in this `useMemo` and read from the same
  `monthlyBillStatuses` array by value/filter, not by order — reordering
  the array does not change any of these sums. No changes needed there,
  but worth the executor double-checking after the edit that this
  assumption holds (it does — `Array.prototype.sort` mutates order, not
  contents, and none of those four are order-dependent).

## Git workflow

- Branch: `advisor/041-sort-monthly-table-actionable-first`
- Commit message style: imperative, capitalized sentence, no
  conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Sort the monthly table by status priority first, due date second

Change `client/src/pages/dashboard.tsx:387` from:

```ts
    monthlyBillStatuses.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
```

to:

```ts
    const statusPriority: Record<BillStatusItem["status"], number> = { overdue: 0, pending: 1, paid: 2 };
    monthlyBillStatuses.sort((a, b) => {
      const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return a.dueDate.getTime() - b.dueDate.getTime();
    });
```

This groups rows overdue-first, then pending/due, then paid last — each
group still sorted by due date ascending within itself, so within the
"paid" group a bill paid for Sep 1 still lists above one paid for Sep 8,
same relative order as before, just as a block moved to the bottom rather
than interleaved by raw date. `annualBillStatuses.sort(...)` immediately
below is left completely untouched.

**Verify**: `pnpm check` → exits 0. `grep -n "statusPriority" client/src/pages/dashboard.tsx` → 2 matches (the declaration and its two uses in the comparator count as usages on the same lines, so this should show the `const statusPriority` line and the two `statusPriority[...]` reads — confirm at least the declaration is present and referenced).

## Test plan

No new automated tests — this is a comparator change inside a React
`useMemo`, same category as prior sort/label plans in this session with
no React rendering harness in this repo. Verify manually against a live
`pnpm dev`:

1. Load the Dashboard with the owner's real data. Confirm the "Upcoming
   Monthly Bills" table's default (unsorted, no column header active)
   order now shows any overdue bills first, then unpaid "Due" bills
   (still in date order among themselves), then paid bills last (also
   still in date order among themselves) — e.g. `USI: Internet` (Due, Sep
   14) should now appear above `RCU: Mortgage` (Paid, Sep 1), the reverse
   of today's order.
2. Click the "Due Date" column header. Confirm it still sorts literally
   chronologically, including paid bills interleaved by their actual due
   date (i.e. clicking the header un-does this plan's default grouping,
   on purpose) — click it again to confirm descending toggles correctly
   too.
3. Click "Bill Name", "Category", "Amount", "Status" column headers in
   turn — confirm all four still sort exactly as they did before this
   plan (unaffected; this plan only changes the *default* array order
   these all sort a copy of).
4. Confirm the "Total Monthly Budget" card's %/$ figures and the
   "Unpaid"/"Paid"/"Overdue" filter pill counts are unchanged from before
   this plan — reordering rows must not change any totals.
5. Confirm the "Annual Bills Overview" table's order is completely
   unaffected — still sorted by month/day as before.

**Verify**: all 5 observations above hold as described.

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (unchanged pass count — this plan adds no test files)
- [ ] `grep -n "statusPriority" client/src/pages/dashboard.tsx` → present, referenced in the monthly sort comparator
- [ ] `grep -n "annualBillStatuses.sort" client/src/pages/dashboard.tsx` → 1 match, body byte-for-byte unchanged from "Current state" above
- [ ] No files outside `client/src/pages/dashboard.tsx` modified (`git status`)
- [ ] All 5 manual observations confirmed live
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpt above (lines 386-393) doesn't match the
  live code (drift since this plan was written).
- `pnpm check` reports new errors you can't resolve in one reasonable fix
  attempt.
- You find that `totalDue`/`totalPaid`/`totalPending`/`overdueCount` are
  computed *after* the sort line rather than before it, or otherwise
  depend on array order — this plan's "Scope" section assumes they don't;
  if that assumption is wrong, stop and report rather than silently
  reordering the computation to compensate.

## Maintenance notes

- If the owner later wants the same actionable-first treatment applied to
  the annual table, that's a deliberate follow-up decision (explicitly
  deferred this round because "Next Cycle" is the normal annual state,
  not an edge case) — don't retrofit it here without that explicit ask.
- `statusPriority`'s ranking (`overdue: 0, pending: 1, paid: 2`) is a
  small, easy-to-adjust map if priorities ever need to change — no other
  logic depends on its exact values beyond relative ordering.
