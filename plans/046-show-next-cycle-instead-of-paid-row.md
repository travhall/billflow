# Plan 046: Show the next unpaid cycle instead of the stale paid row

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0bde9f8..HEAD -- client/src/lib/bill-status.ts client/src/lib/bill-status.test.ts client/src/pages/dashboard.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding;
> on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the same status/display pipeline plans 038-041
  and 044-045 already hardened; the money-correctness stats computation
  from plan 040 must not regress)
- **Depends on**: plan 040 (the `getBillCycleStatus` this plan extends),
  plan 044 (makes "a paid bill always already has its next-cycle row
  queued" a reliable invariant this plan depends on)
- **Category**: direction (UX — information the owner explicitly asked to
  see instead of what's currently shown)
- **Planned at**: commit `0bde9f8`, 2026-09-04

## Why this matters

The owner annotated a live screenshot directly: paid bills sitting in
"Upcoming Monthly Bills"/"Annual Bills Overview" show their already-past
due date and "Paid" badge — accurate, but not what they want to look at.
Their own words: *"I understand that we want to preserve the record but
I don't believe we need to display them. I want to be able to push these
out to the next cycle and get them out of the way. I need to see what's
next, not what's paid."*

This is compatible with everything already shipped, not a reversal of
it. Plan 040 fixed what `"paid"` *means* (correctness — feeds the stats
card, the filter pills, `totalPaid`). This plan changes what the *row*
*displays* once that's true, without touching what it counts as. The
data is already there to do this: plan 044 established that a paid bill
always already has its next-cycle payment queued in the background
(auto-created the moment it was marked paid) — this plan surfaces that
already-existing data in the row instead of hiding it behind "Paid".

## Current state

Relevant files:

- `client/src/lib/bill-status.ts` — `getBillCycleStatus`, gains an
  optional `nextCycle` field on its return type, populated only in the
  `"paid"` branch.
- `client/src/lib/bill-status.test.ts` — existing tests for the `"paid"`
  branch get new assertions on `nextCycle`; one new test covers the
  `nextCycle: undefined` edge case.
- `client/src/pages/dashboard.tsx` — `BillStatusItem` type,
  `getUrgencyDisplay`, the Due Date/Amount table cells, `sortData`'s
  `'date'`/`'amount'` cases, and the default monthly sort's tiebreak all
  need to prefer `item.nextCycle` over the raw paid values when it's
  present. The stats computations (`totalDue`/`totalPaid`/`totalPending`/
  `overdueCount`) and the Actions column's `item.status === "paid"` gates
  (Revert to Pending visibility, Mark Paid hiding) are **not** touched —
  they must keep reading the real underlying `status`/`amount` fields,
  unchanged, since those drive correctness (plan 040) and the auto-pay
  guard (plan 045), not display.

`client/src/lib/bill-status.ts:5-46` (today — the type and the `"paid"`
branch this plan extends; the `oldestUnpaid` branch below it, lines
48-59, already contains the exact lookup logic this plan needs — finding
the oldest unpaid payment for the bill — this plan reuses that same
computation inside the `"paid"` branch instead of only in the fallback):

```ts
export type BillCycleStatus = {
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
};

/**
 * Determines a bill's status for the current billing cycle.
 * ...
 */
export function getBillCycleStatus(bill: Bill, payments: Payment[], today: Date): BillCycleStatus {
  const billPayments = payments.filter(p => p.billId === bill.id);
  const isCurrentCycle = (dueDate: Date) =>
    bill.frequency === "monthly"
      ? isSameMonth(dueDate, today) && isSameYear(dueDate, today)
      : isSameYear(dueDate, today);

  const paidForCurrentCycle = billPayments.find(
    p => p.status === "paid" && isCurrentCycle(parseISO(p.dueDate as unknown as string))
  );
  if (paidForCurrentCycle) {
    return {
      status: "paid",
      dueDate: parseISO(paidForCurrentCycle.dueDate as unknown as string),
      amount: paidForCurrentCycle.amount,
      paymentId: paidForCurrentCycle.id,
    };
  }

  const oldestUnpaid = billPayments
    .filter(p => p.status !== "paid")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  if (oldestUnpaid) {
    const dueDate = parseISO(oldestUnpaid.dueDate as unknown as string);
    return {
      status: isBefore(dueDate, today) ? "overdue" : "pending",
      dueDate,
      amount: oldestUnpaid.amount,
      paymentId: oldestUnpaid.id,
    };
  }

  const currentPeriodDueDate = getDueDateForMonth(bill, today) ?? startOfMonth(today);
  return {
    status: isBefore(currentPeriodDueDate, today) ? "overdue" : "pending",
    dueDate: currentPeriodDueDate,
    amount: bill.defaultAmount,
    paymentId: undefined,
  };
}
```

`client/src/pages/dashboard.tsx:45-51` (today — `BillStatusItem`; gains
the same optional `nextCycle` field, spread in from `getBillCycleStatus`'s
return value at the `allBillStatuses` construction site, unchanged
elsewhere in this file):

```ts
type BillStatusItem = {
  bill: Bill;
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
};
```

`client/src/pages/dashboard.tsx:58-73` (today — `getUrgencyDisplay`):

```ts
function getUrgencyDisplay(item: BillStatusItem): { label: string; className: string } {
  if (item.status === "paid") {
    return { label: "Paid", className: "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" };
  }
  if (item.status === "overdue") {
    return { label: "Overdue", className: "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/20" };
  }
  const today = new Date();
  const isCurrentCycle = item.bill.frequency === "monthly"
    ? isSameMonth(item.dueDate, today) && isSameYear(item.dueDate, today)
    : isSameYear(item.dueDate, today);
  if (isCurrentCycle) {
    return { label: "Due", className: "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20" };
  }
  return { label: "Next Cycle", className: "text-muted-foreground bg-background border-border" };
}
```

`client/src/pages/dashboard.tsx:197-210` (today — the Due Date/Amount/
Status cells inside `BillTable`'s row map):

```tsx
                <TableCell className="text-muted-foreground">
                  {format(item.dueDate, item.bill.frequency === "yearly" ? "MMM d, yyyy" : "MMM d")}
                </TableCell>
                <TableCell className="font-display font-bold text-foreground">
                  {formatCurrency(Number(item.amount))}
                </TableCell>
                <TableCell>
                  <Badge
                    className={clsx("font-semibold", getUrgencyDisplay(item).className)}
                    variant="outline"
                  >
                    {getUrgencyDisplay(item).label}
                  </Badge>
                </TableCell>
```

`client/src/pages/dashboard.tsx:326-358` (today — `sortData`, the
column-header sort; only the `'date'` and `'amount'` cases change):

```ts
    const sortData = (data: any[]) => {
      if (!sortConfig) return data;
      return [...data].sort((a, b) => {
        let valA, valB;
        switch (sortConfig.key) {
          case 'name':
            valA = a.bill.name.toLowerCase();
            valB = b.bill.name.toLowerCase();
            break;
          case 'category':
            valA = a.bill.category.toLowerCase();
            valB = b.bill.category.toLowerCase();
            break;
          case 'date':
            valA = a.dueDate.getTime();
            valB = b.dueDate.getTime();
            break;
          case 'amount':
            valA = Number(a.amount);
            valB = Number(b.amount);
            break;
          case 'status':
            valA = a.status;
            valB = b.status;
            break;
          default:
            return 0;
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    };
```

`client/src/pages/dashboard.tsx:369-384` (today — stats computation,
**unchanged by this plan**, shown so the executor can confirm none of it
reads `nextCycle`; and the default monthly sort, whose tiebreak *does*
change):

```ts
    const totalDue = sumAmounts(monthlyBillStatuses.map(item => item.bill.defaultAmount));
    const totalPaid = sumAmounts(
      monthlyBillStatuses.filter(item => item.status === "paid").map(item => item.amount)
    );
    const totalPending = sumAmounts(
      monthlyBillStatuses.filter(item => item.status !== "paid").map(item => item.bill.defaultAmount)
    );
    const overdueCount = monthlyBillStatuses.filter(item => item.status === "overdue").length;

    // Default sorts then apply user sort
    const statusPriority: Record<BillStatusItem["status"], number> = { overdue: 0, pending: 1, paid: 2 };
    monthlyBillStatuses.sort((a, b) => {
      const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return a.dueDate.getTime() - b.dueDate.getTime();
    });
```

`client/src/pages/dashboard.tsx:385-390` (today — the annual table's
sort; **unchanged by this plan** — it sorts by `bill.dueMonth`/
`bill.dueDay`, the bill's static configured recurrence month/day, not by
any payment's actual due date, so it's unaffected by which payment is
being displayed):

```ts
    annualBillStatuses.sort((a, b) => {
      const aMonth = a.bill.dueMonth || 0;
      const bMonth = b.bill.dueMonth || 0;
      if (aMonth !== bMonth) return aMonth - bMonth;
      return a.bill.dueDay - b.bill.dueDay;
    });
```

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exits 0 |
| Tests     | `pnpm test`   | all pass, including updated/new assertions in `bill-status.test.ts` |
| Dev server | `pnpm dev`   | boots without error; used for manual verification |

## Scope

**In scope**:
- `client/src/lib/bill-status.ts`
- `client/src/lib/bill-status.test.ts`
- `client/src/pages/dashboard.tsx`

**Out of scope** (do NOT touch, even though related):
- `totalDue`/`totalPaid`/`totalPending`/`overdueCount`
  (`dashboard.tsx:369-376`) — must keep reading the real `status`/
  `amount`/`bill.defaultAmount` fields exactly as today. This is the
  money-correctness guarantee from plan 040; nothing in this plan should
  make the stats card's numbers depend on `nextCycle`.
- The status filter pills / `matchesStatus`
  (`statusFilter === "all" || item.status === statusFilter`) — unchanged.
  A bill paid for its current cycle still matches the "Paid" filter pill
  even though its row visually shows "Next Cycle" info — that's
  intentional, not a bug to fix here (see Maintenance notes).
- The Actions column's `item.status === "paid"` gates — "Revert to
  Pending" stays visible (still reverts the *real* paid payment,
  unaffected by what the row displays) and "Mark Paid" stays hidden.
  Both already correctly key off the real `item.status`, not `nextCycle`
  — don't introduce a new gate here.
- `annualBillStatuses.sort` (`dashboard.tsx:385-390`) — confirmed above
  to be unaffected; don't touch it.
- `client/src/pages/upcoming.tsx` — has its own separate status model,
  out of scope, same as every prior plan touching this display logic.
- `server/storage.ts`, `server/routes.ts` — this plan is purely a
  client-side display change; no payment data is created, deleted, or
  modified by it, only what's rendered from data that already exists.

## Git workflow

- Branch: `advisor/046-show-next-cycle-instead-of-paid-row`
- Commit per step or per logical unit. Message style: imperative,
  capitalized sentences, no conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `nextCycle` to `getBillCycleStatus`'s `"paid"` branch

Change `client/src/lib/bill-status.ts:5-46` from:

```ts
export type BillCycleStatus = {
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
};

/**
 * Determines a bill's status for the current billing cycle.
 *
 * `resetPayment` auto-creates a next-cycle payment the moment a payment is
 * marked paid, so a fully-current bill always has a newer, still-unpaid
 * row sitting alongside its already-paid current-cycle row. Naively
 * picking "whichever payment has the latest due date" (the bug this
 * function replaces) always prefers that newer unpaid row, so a bill can
 * never report as paid once it's completed one rollover — it's
 * permanently one cycle behind. This function instead checks explicitly:
 * is there a paid payment covering the CURRENT cycle? If so, that's the
 * status, regardless of any newer unpaid row already sitting ahead of it.
 * Only if the current cycle has no paid payment does it fall through to
 * finding the oldest outstanding (unpaid) obligation — which correctly
 * surfaces a genuinely stale, still-overdue prior-cycle payment even if
 * no next-cycle row has been generated yet.
 */
export function getBillCycleStatus(bill: Bill, payments: Payment[], today: Date): BillCycleStatus {
  const billPayments = payments.filter(p => p.billId === bill.id);
  const isCurrentCycle = (dueDate: Date) =>
    bill.frequency === "monthly"
      ? isSameMonth(dueDate, today) && isSameYear(dueDate, today)
      : isSameYear(dueDate, today);

  const paidForCurrentCycle = billPayments.find(
    p => p.status === "paid" && isCurrentCycle(parseISO(p.dueDate as unknown as string))
  );
  if (paidForCurrentCycle) {
    return {
      status: "paid",
      dueDate: parseISO(paidForCurrentCycle.dueDate as unknown as string),
      amount: paidForCurrentCycle.amount,
      paymentId: paidForCurrentCycle.id,
    };
  }
```

to:

```ts
export type BillCycleStatus = {
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
  /**
   * When `status` is `"paid"`, this bill's next (already-created, still
   * unpaid) cycle payment — undefined only if none has been generated
   * yet, which shouldn't normally happen for a paid bill (see plan 044)
   * but is handled gracefully rather than assumed. Purely a display hint
   * for callers that want to show "what's next" instead of the stale
   * paid row — `status`/`dueDate`/`amount`/`paymentId` above always
   * describe the real, current-cycle paid payment regardless of this
   * field, and callers that need the true paid state (stats totals,
   * filters, the auto-pay-revert guard) must keep reading those, not this.
   */
  nextCycle?: { dueDate: Date; amount: string };
};

/**
 * Determines a bill's status for the current billing cycle.
 *
 * `resetPayment` auto-creates a next-cycle payment the moment a payment is
 * marked paid, so a fully-current bill always has a newer, still-unpaid
 * row sitting alongside its already-paid current-cycle row. Naively
 * picking "whichever payment has the latest due date" (the bug this
 * function replaces) always prefers that newer unpaid row, so a bill can
 * never report as paid once it's completed one rollover — it's
 * permanently one cycle behind. This function instead checks explicitly:
 * is there a paid payment covering the CURRENT cycle? If so, that's the
 * status, regardless of any newer unpaid row already sitting ahead of it.
 * Only if the current cycle has no paid payment does it fall through to
 * finding the oldest outstanding (unpaid) obligation — which correctly
 * surfaces a genuinely stale, still-overdue prior-cycle payment even if
 * no next-cycle row has been generated yet.
 */
export function getBillCycleStatus(bill: Bill, payments: Payment[], today: Date): BillCycleStatus {
  const billPayments = payments.filter(p => p.billId === bill.id);
  const isCurrentCycle = (dueDate: Date) =>
    bill.frequency === "monthly"
      ? isSameMonth(dueDate, today) && isSameYear(dueDate, today)
      : isSameYear(dueDate, today);

  const paidForCurrentCycle = billPayments.find(
    p => p.status === "paid" && isCurrentCycle(parseISO(p.dueDate as unknown as string))
  );
  if (paidForCurrentCycle) {
    const nextUnpaid = billPayments
      .filter(p => p.status !== "paid")
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    return {
      status: "paid",
      dueDate: parseISO(paidForCurrentCycle.dueDate as unknown as string),
      amount: paidForCurrentCycle.amount,
      paymentId: paidForCurrentCycle.id,
      nextCycle: nextUnpaid
        ? { dueDate: parseISO(nextUnpaid.dueDate as unknown as string), amount: nextUnpaid.amount }
        : undefined,
    };
  }
```

The `oldestUnpaid` lookup a few lines below (the existing fallback
branch, unchanged) uses the identical pattern — this step just runs that
same kind of lookup one branch earlier too, for display purposes.

**Verify**: `pnpm check` → exits 0.

### Step 2: Update and extend the unit tests

In `client/src/lib/bill-status.test.ts`, add an assertion to the
existing RCU-bug test (the first `it(...)` block) — after the existing
`expect(result.paymentId).toBe(2);` line, add:

```ts
    expect(result.nextCycle?.dueDate.getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(result.nextCycle?.amount).toBe("100.00");
```

Add the same kind of assertion to the yearly-bill test (the last
`it(...)` block) — after `expect(result.paymentId).toBe(30);`, add:

```ts
    expect(result.nextCycle?.dueDate.getTime()).toBe(new Date(2027, 5, 24).getTime());
    expect(result.nextCycle?.amount).toBe("100.00");
```

Add one new test, covering the case where a bill is paid but no
next-cycle row exists yet (shouldn't normally happen per plan 044, but
`nextCycle` must degrade gracefully rather than throw):

```ts
  it("leaves nextCycle undefined when a bill is paid but no next-cycle row has been created", () => {
    const b = bill({ id: 6, dueDay: 1 });
    const payments = [payment({ id: 40, billId: 6, dueDate: "2026-09-01T05:00:00.000Z" as unknown as Payment["dueDate"], status: "paid" })];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 2));
    expect(result.status).toBe("paid");
    expect(result.nextCycle).toBeUndefined();
  });
```

**Verify**: `pnpm test` → all pass, 11/11 (8 pre-existing + 3 new/extended assertions counted as part of existing `it` blocks, plus 1 new `it` block).

### Step 3: Thread `nextCycle` through `BillStatusItem` and the display cells

Change `client/src/pages/dashboard.tsx:45-51` from:

```ts
type BillStatusItem = {
  bill: Bill;
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
};
```

to:

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

(No change needed where `allBillStatuses` is built —
`bills.filter(...).map(bill => ({ bill, ...getBillCycleStatus(bill, payments, today) }))`
already spreads every field `getBillCycleStatus` returns, `nextCycle`
included.)

Change `getUrgencyDisplay` (`dashboard.tsx:58-73`) from:

```ts
function getUrgencyDisplay(item: BillStatusItem): { label: string; className: string } {
  if (item.status === "paid") {
    return { label: "Paid", className: "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" };
  }
```

to:

```ts
function getUrgencyDisplay(item: BillStatusItem): { label: string; className: string } {
  if (item.status === "paid") {
    if (item.nextCycle) {
      return { label: "Next Cycle", className: "text-muted-foreground bg-background border-border" };
    }
    return { label: "Paid", className: "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" };
  }
```

(The rest of the function is unchanged — this reuses the exact same
"Next Cycle" label/style already defined a few lines below for the
unpaid-future-cycle case, so no new visual language is introduced.)

Change the Due Date and Amount cells (`dashboard.tsx:197-203`) from:

```tsx
                <TableCell className="text-muted-foreground">
                  {format(item.dueDate, item.bill.frequency === "yearly" ? "MMM d, yyyy" : "MMM d")}
                </TableCell>
                <TableCell className="font-display font-bold text-foreground">
                  {formatCurrency(Number(item.amount))}
                </TableCell>
```

to:

```tsx
                <TableCell className="text-muted-foreground">
                  {format(item.nextCycle?.dueDate ?? item.dueDate, item.bill.frequency === "yearly" ? "MMM d, yyyy" : "MMM d")}
                </TableCell>
                <TableCell className="font-display font-bold text-foreground">
                  {formatCurrency(Number(item.nextCycle?.amount ?? item.amount))}
                </TableCell>
```

**Verify**: `pnpm check` → exits 0.

### Step 4: Keep sorting consistent with what's now displayed

Change `sortData`'s `'date'` and `'amount'` cases (`dashboard.tsx:339-346`) from:

```ts
          case 'date':
            valA = a.dueDate.getTime();
            valB = b.dueDate.getTime();
            break;
          case 'amount':
            valA = Number(a.amount);
            valB = Number(b.amount);
            break;
```

to:

```ts
          case 'date':
            valA = (a.nextCycle?.dueDate ?? a.dueDate).getTime();
            valB = (b.nextCycle?.dueDate ?? b.dueDate).getTime();
            break;
          case 'amount':
            valA = Number(a.nextCycle?.amount ?? a.amount);
            valB = Number(b.nextCycle?.amount ?? b.amount);
            break;
```

Change the default monthly sort's tiebreak (`dashboard.tsx:380-384`) from:

```ts
    monthlyBillStatuses.sort((a, b) => {
      const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return a.dueDate.getTime() - b.dueDate.getTime();
    });
```

to:

```ts
    monthlyBillStatuses.sort((a, b) => {
      const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return (a.nextCycle?.dueDate ?? a.dueDate).getTime() - (b.nextCycle?.dueDate ?? b.dueDate).getTime();
    });
```

This keeps clicking the "Due Date"/"Amount" column headers, and the
default within-group ordering, consistent with whatever value is
actually showing in those columns — without this step, sorting by "Due
Date" would order paid rows by their hidden real due date while the
column visibly shows a different (next-cycle) date, which would look
broken.

**Verify**: `pnpm check` → exits 0. `grep -n "nextCycle" client/src/pages/dashboard.tsx` → present in the type, `getUrgencyDisplay`, both table cells, both `sortData` cases, and the default sort tiebreak (7+ occurrences).

## Test plan

Step 2 covers the pure-logic part (`getBillCycleStatus`'s new
`nextCycle` field) with real assertions. The React display change has no
rendering harness in this repo, same as every prior plan touching
`dashboard.tsx` this session — verify manually against a live `pnpm dev`
+ the owner's real Neon DB:

1. Load the Dashboard. Confirm `RCU: Mortgage`, `CenterPoint: Gas`, `City
   of Minneapolis: Utilities`, `Xcel: Electricity` (all paid for
   September) now show their *October* due date and amount with a
   "Next Cycle" badge — not "Paid" with their September date.
2. Confirm `Mint Mobile: Travis`/`Mint Mobile: Erin` (paid for 2026) now
   show their *2027* due date with "Next Cycle" — same pattern, annual
   table.
3. Confirm the "Total Monthly Budget" stats card is **completely
   unchanged** — same %/$ figures as before this plan. This is the
   critical regression check: the display pivot must not leak into the
   money totals.
4. Click the "Paid" filter pill. Confirm the same bills as before still
   appear (they still count as paid — the filter is unchanged), even
   though their rows now show "Next Cycle" info. This is expected per
   Scope, not a bug — but worth seeing once to confirm it reads
   reasonably rather than confusingly.
5. Click the "Due Date" column header on the monthly table. Confirm rows
   sort by whatever date is actually displayed in that column (i.e. a
   "Next Cycle" row sorts by its October date, not a hidden September
   one) — toggle ascending/descending, confirm both directions look
   correct.
6. Confirm "Revert to Pending" still works exactly as it did after plan
   045 (visible + functional for non-autopay paid bills, disabled with
   the explanatory tooltip for autopay ones) — this plan must not have
   changed that gate.
7. Confirm "Mark Paid" still does not appear on any of these
   now-"Next Cycle"-labeled rows (they're still `status: "paid"`
   underneath).
8. Pick a bill that's currently unpaid/due/overdue (e.g. `USI: Internet`).
   Confirm its row is completely unaffected by this plan — same date,
   amount, and badge as before.

**Verify**: all 8 observations above hold as described.

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, all passing including the new/extended `bill-status.test.ts` assertions
- [ ] `grep -n "nextCycle" client/src/lib/bill-status.ts` → present in the type and the `"paid"` branch
- [ ] `grep -n "nextCycle" client/src/pages/dashboard.tsx` → present in the type, `getUrgencyDisplay`, both table cells, both `sortData` cases, and the default sort tiebreak
- [ ] `grep -n "item.status === \"paid\"" client/src/pages/dashboard.tsx` → same match count/locations as before this plan (Actions column gates untouched)
- [ ] No files outside the 3 in-scope files modified (`git status`)
- [ ] All 8 manual observations confirmed live, especially #3 (stats card unchanged)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt above doesn't match the live code at that
  location (drift since this plan was written).
- The stats card's %/$ figures change at all after this plan's edits —
  that's a hard regression against plan 040, stop immediately and report
  which computation ended up reading `nextCycle`.
- `pnpm check` or `pnpm test` report failures you can't resolve in one
  reasonable fix attempt.
- You find a bill where `getBillCycleStatus` returns `status: "paid"`
  with `nextCycle: undefined` in the live data (per plan 044's
  invariant, this shouldn't happen for any normally-paid bill) — confirm
  the row still renders reasonably (falls back to showing the real paid
  date/amount/"Paid" badge, per Step 3's `??` fallback and
  `getUrgencyDisplay`'s `if (item.nextCycle)` check) rather than
  crashing, and note it in your report rather than treating it as a
  STOP-worthy contradiction — the fallback path is intentional.

## Maintenance notes

- The "Paid" filter pill now surfaces rows that visually read "Next
  Cycle" — this is intentional (see Scope), but if a future round of
  feedback finds it confusing, the fix belongs in the filter pill's
  label/behavior, not by reverting this plan's display change.
- If a future plan wants "Mark Paid" to work directly from a
  `nextCycle`-displaying row (pay the upcoming cycle early, straight from
  this preview), that's a real, separate feature — it would need to
  target `item.nextCycle`'s own payment id (not currently returned by
  `getBillCycleStatus`, only its `dueDate`/`amount` are) and is
  deliberately not attempted here.
- `client/src/pages/upcoming.tsx`'s independent status model was not
  touched and does not benefit from this plan — if the owner wants the
  same "show what's next" treatment there, it needs its own plan, scoped
  to that file's different (4-value, month-grid) status logic.
