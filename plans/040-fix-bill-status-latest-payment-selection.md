# Plan 040: Fix `getStatus`'s payment-selection bug hiding paid bills as unpaid

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. This plan touches the logic behind real dollar
> totals shown on the Dashboard — do not take shortcuts on the test/verify
> steps. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4695659..HEAD -- client/src/pages/dashboard.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (changes the logic behind `totalPaid`/`totalPending`/
  `overdueCount` and every bill-status badge on the Dashboard — get the
  algorithm right, this plan includes unit tests specifically because of
  that risk)
- **Depends on**: none (builds on plans 037-039's `getUrgencyDisplay`,
  already merged to `main` — unaffected by this plan, since it consumes
  `item.status`/`item.dueDate`/`item.bill.frequency`, all still produced
  the same way, just now correctly)
- **Category**: bug (money-correctness)
- **Planned at**: commit `4695659`, 2026-09-02

## Why this matters

The owner noticed the "Total Monthly Budget" card reads "0% Paid — $0.00
of $3,035.28" while the bill table right below it shows most monthly bills
as already handled for the cycle. Investigation against the live dev
database confirmed the card is the one that's wrong:

```
RCU: Mortgage (bill id 1)     — Sep 1 payment: paidDate 2026-08-24, status "paid"
                                — Oct 1 payment: status "pending" (auto-created by rollover)
CenterPoint: Gas (bill id 16) — Sep 8 payment: paidDate 2026-08-24, status "paid"
                                — Oct 8 payment: status "pending" (auto-created by rollover)
```

September's payment for both bills genuinely is paid. But
`client/src/pages/dashboard.tsx`'s `getStatus(bill)` — the function behind
every bill's `status`/`dueDate`/`amount` used for the badge, the "% Paid"
progress bar, `totalPaid`, `totalPending`, and `overdueCount` — picks
whichever payment row has the **latest** due date as "the" status for a
bill:

```ts
.sort((a, b) => {
  const dateDiff = new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
  ...
});
const latestPayment = billPayments[0];
if (latestPayment && latestPayment.status === "paid") { return { status: "paid", ... }; }
```

`resetPayment` (in `server/storage.ts`) auto-creates a next-cycle pending
payment every time a payment is marked paid — that's the whole point of
auto-pay rollover. But that means the moment a bill completes one full
pay-and-rollover cycle, its newest row is *always* the not-yet-paid next
cycle, which always wins the "latest due date" sort over the already-paid
current-cycle row. The `if (latestPayment.status === "paid")` check above
it therefore almost never fires for a bill that's actually been kept
current — `getStatus` reports `"pending"` for a bill that is, in fact,
fully paid for the cycle it's supposed to represent. This has been true
since before this session's plans 037-039 (which only changed *display
labels* derived from this same `status` field) — those plans didn't cause
this bug, but plan 038's more specific "Next Cycle" wording made the
symptom look plausible by accident, while the stats card's 0% makes it
obviously wrong. Both are downstream of the same broken selection logic.

This plan rewrites the payment-selection algorithm, and — because it
directly determines dollar totals shown to the owner — extracts it into a
pure, unit-tested function rather than leaving it as an unverified inline
closure. This repo already has that pattern for other date-sensitive pure
logic (`shared/date-utils.ts` + `shared/date-utils.test.ts`, from plan
001) and for money-summation logic (`client/src/lib/money.ts`, from plan
006) — this plan follows the same shape as `client/src/lib/money.ts`
(client-only pure helper, not shared with the server).

## Current state

Relevant files:

- `client/src/pages/dashboard.tsx` — contains the `getStatus` closure
  being extracted and fixed (inside `processedData`'s `useMemo`), and its
  one call site.
- `client/src/lib/money.ts` — exemplar pattern for a small, pure,
  unit-tested client lib file this plan's new file should match in style.
- `shared/date-utils.ts` / `shared/date-utils.test.ts` — exemplar pattern
  for this repo's existing Vitest usage on pure date logic; `vitest.config.ts`
  already picks up any `**/*.test.ts`, so a new test file needs no config
  change.

`client/src/pages/dashboard.tsx:14-18` (today — the imports this plan
edits; `type Payment` needs adding, `parseISO`/`isBefore`/`startOfMonth`
stay since they're still used elsewhere in this file beyond `getStatus`):

```ts
import { type Bill } from "@shared/schema";
import { startOfMonth, endOfMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay, format } from "date-fns";
import { getDueDateForMonth } from "@shared/date-utils";
import { sumAmounts } from "@/lib/money";
```

`client/src/pages/dashboard.tsx:324-378` (today — `processedData`'s
`useMemo`, showing the `getStatus` closure being extracted and its call
site; everything from `const allBillStatuses = ...` onward, shown at the
bottom, is unchanged by this plan and included only so the executor can
see exactly where the extracted function's return value plugs back in):

```tsx
  const processedData = useMemo(() => {
    if (!bills || !payments) return null;

    const today = startOfDay(new Date());
    const currentMonthStart = startOfMonth(today);

    const getStatus = (bill: Bill) => {
      // Find the most recent payment for this bill
      const billPayments = payments
        .filter(p => p.billId === bill.id)
        .sort((a, b) => {
          const dateDiff = new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
          if (dateDiff !== 0) return dateDiff;
          // Tiebreak: paid before pending, then newest id first
          if (a.status === "paid" && b.status !== "paid") return -1;
          if (b.status === "paid" && a.status !== "paid") return 1;
          return b.id - a.id;
        });

      const latestPayment = billPayments[0];

      // If latest payment exists and is paid, we show it as paid regardless of due date
      if (latestPayment && latestPayment.status === "paid") {
        return {
          status: "paid" as const,
          dueDate: parseISO(latestPayment.dueDate as unknown as string),
          amount: latestPayment.amount,
          paymentId: latestPayment.id
        };
      }

      // Calculate current period's expected due date
      const currentPeriodDueDate = getDueDateForMonth(bill, today) ?? currentMonthStart;

      // If no payment exists at all, use current period's due date
      if (!latestPayment) {
        const status = isBefore(currentPeriodDueDate, today) ? "overdue" : "pending";
        return { status, dueDate: currentPeriodDueDate, amount: bill.defaultAmount, paymentId: undefined };
      }

      // If it's pending/overdue
      const latestDueDate = parseISO(latestPayment.dueDate as unknown as string);
      const status = isBefore(latestDueDate, today) ? "overdue" : "pending";
      return {
        status,
        dueDate: latestDueDate,
        amount: latestPayment.amount,
        paymentId: latestPayment.id
      };
    };

    const allBillStatuses = bills.filter(b => !b.archived).map(bill => ({
      bill,
      ...getStatus(bill)
    }));
```

`client/src/lib/money.ts` (full file — exemplar for the new file's style:
short, single-purpose, JSDoc explaining *why*, no class/state):

```ts
/**
 * Sums an array of currency amount strings (as returned by Drizzle's
 * `numeric` columns) without floating-point drift, by converting each to
 * integer cents before summing and dividing back at the end.
 */
export function sumAmounts(amounts: (string | number)[]): number {
  const totalCents = amounts.reduce<number>((cents, a) => {
    const n = typeof a === "string" ? Number(a) : a;
    return cents + Math.round(n * 100);
  }, 0);
  return totalCents / 100;
}
```

`shared/date-utils.ts:1-5` (the `DueDateInput` type `getDueDateForMonth`
takes — `Bill` satisfies this structurally, same as it does today):

```ts
export interface DueDateInput {
  frequency: "monthly" | "yearly";
  dueDay: number;
  dueMonth?: number | null;
}
```

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exits 0 |
| Tests     | `pnpm test`   | all pass, including the new test file this plan adds |
| Dev server | `pnpm dev`   | boots without error; used for live-DB verification against the owner's real `RCU: Mortgage` (bill id 1) and `CenterPoint: Gas` (bill id 16) |

## Scope

**In scope**:
- `client/src/lib/bill-status.ts` (new file)
- `client/src/lib/bill-status.test.ts` (new file)
- `client/src/pages/dashboard.tsx` (remove the inline `getStatus` closure,
  import and call the new function instead)

**Out of scope** (do NOT touch, even though related):
- `server/storage.ts`'s `resetPayment`/`markPaidAndReset`/`processAutoPay`
  — the auto-pay rollover mechanism itself is working as designed (it's
  supposed to create the next-cycle payment on mark-paid). This plan fixes
  how the *client* interprets the resulting payment rows, not the rollover
  mechanism that produces them.
- `getUrgencyDisplay` and the badge render site in `dashboard.tsx` (from
  plans 037-039) — both already correctly consume `item.status`,
  `item.dueDate`, and `item.bill.frequency`. Once this plan fixes what
  those fields *contain*, the existing badge logic needs no change: a bill
  correctly reported as `"paid"` will automatically render the existing
  green "Paid" badge instead of the misleading "Next Cycle" one, with zero
  edits to `getUrgencyDisplay` itself.
- `StatsCards` component (`client/src/components/stats-cards.tsx`) — it's
  a pure display component that already correctly computes `percentPaid`
  from whatever `totalPaid`/`totalDue` it's given as props
  (`stats-cards.tsx:13`). No change needed there; it will display
  correctly once the props it receives are correct.
- `client/src/pages/upcoming.tsx` — has its own separate, independent
  status-derivation logic for its month-grid view (not the same function),
  out of scope for this plan.
- `sortData`'s `case 'status'` (in `dashboard.tsx`, unrelated line) —
  still sorts by whatever `item.status` string is, needs no change.

## Git workflow

- Branch: `advisor/040-fix-bill-status-latest-payment-selection`
- Commit per step or per logical unit. Message style: imperative,
  capitalized sentences, no conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `client/src/lib/bill-status.ts` with the corrected algorithm

Create this new file:

```ts
import { isBefore, isSameMonth, isSameYear, parseISO, startOfMonth } from "date-fns";
import { getDueDateForMonth } from "@shared/date-utils";
import type { Bill, Payment } from "@shared/schema";

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

**Verify**: `pnpm check` → exits 0.

### Step 2: Write unit tests covering the exact bug and its edge cases

Create `client/src/lib/bill-status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getBillCycleStatus } from "./bill-status";
import type { Bill, Payment } from "@shared/schema";

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 1,
    name: "Test Bill",
    category: "Test",
    defaultAmount: "100.00",
    isVariable: false,
    frequency: "monthly",
    dueDay: 1,
    dueMonth: null,
    isAutoPay: false,
    archived: false,
    reminderDays: null,
    ...overrides,
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 1,
    billId: 1,
    amount: "100.00",
    dueDate: "2026-09-01T00:00:00.000Z" as unknown as Payment["dueDate"],
    paidDate: null,
    status: "pending",
    notes: null,
    ...overrides,
  };
}

describe("getBillCycleStatus", () => {
  it("reports paid when the current cycle is paid, even if a next-cycle payment already rolled over unpaid (the RCU: Mortgage bug)", () => {
    const b = bill({ id: 1, dueDay: 1 });
    const payments = [
      payment({ id: 2, billId: 1, dueDate: "2026-09-01T05:00:00.000Z" as unknown as Payment["dueDate"], paidDate: "2026-08-24T00:00:00.000Z" as unknown as Payment["paidDate"], status: "paid" }),
      payment({ id: 50, billId: 1, dueDate: "2026-10-01T05:00:00.000Z" as unknown as Payment["dueDate"], status: "pending" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 2)); // Sep 2, 2026
    expect(result.status).toBe("paid");
    expect(result.paymentId).toBe(2);
  });

  it("reports pending for an unpaid bill due later this cycle with no other payment rows", () => {
    const b = bill({ id: 2, dueDay: 14 });
    const payments = [payment({ id: 10, billId: 2, dueDate: "2026-09-14T00:00:00.000Z" as unknown as Payment["dueDate"], status: "pending" })];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 2));
    expect(result.status).toBe("pending");
  });

  it("reports overdue for a stale unpaid payment from a past cycle when no next-cycle row exists yet", () => {
    const b = bill({ id: 3, dueDay: 1 });
    const payments = [payment({ id: 20, billId: 3, dueDate: "2026-09-01T00:00:00.000Z" as unknown as Payment["dueDate"], status: "pending" })];
    const result = getBillCycleStatus(b, payments, new Date(2026, 9, 15)); // Oct 15, well past Sep 1
    expect(result.status).toBe("overdue");
    expect(result.dueDate.getMonth()).toBe(8); // still September, not silently reset to October
  });

  it("falls back to the bill's default amount and computed due date when no payment rows exist at all", () => {
    const b = bill({ id: 4, dueDay: 20, defaultAmount: "42.00" });
    const result = getBillCycleStatus(b, [], new Date(2026, 8, 2));
    expect(result.status).toBe("pending");
    expect(result.amount).toBe("42.00");
    expect(result.paymentId).toBeUndefined();
  });

  it("handles yearly bills the same way — paid this year despite a next-cycle row already existing", () => {
    const b = bill({ id: 5, frequency: "yearly", dueMonth: 6, dueDay: 24 });
    const payments = [
      payment({ id: 30, billId: 5, dueDate: "2026-06-24T00:00:00.000Z" as unknown as Payment["dueDate"], status: "paid" }),
      payment({ id: 31, billId: 5, dueDate: "2027-06-24T00:00:00.000Z" as unknown as Payment["dueDate"], status: "pending" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 2));
    expect(result.status).toBe("paid");
    expect(result.paymentId).toBe(30);
  });
});
```

**Verify**: `pnpm test` → all pass, including these 5 new cases (should read as 3 pre-existing + 5 new = 8 total, up from the 3 in `shared/date-utils.test.ts`).

### Step 3: Wire `dashboard.tsx` to the new function, remove the old inline closure

Change the import block at `client/src/pages/dashboard.tsx:14-18` from:

```ts
import { type Bill } from "@shared/schema";
import { startOfMonth, endOfMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay, format } from "date-fns";
import { getDueDateForMonth } from "@shared/date-utils";
import { sumAmounts } from "@/lib/money";
```

to:

```ts
import { type Bill } from "@shared/schema";
import { startOfMonth, endOfMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay, format } from "date-fns";
import { sumAmounts } from "@/lib/money";
import { getBillCycleStatus } from "@/lib/bill-status";
```

(`getDueDateForMonth` from `@shared/date-utils` is no longer called
directly in this file after Step 3 — it's used inside the new
`bill-status.ts` instead. `isSameMonth`/`isSameYear`/`parseISO`/`isBefore`
stay: they're still used by `getUrgencyDisplay`, elsewhere in this file,
from plans 037/038.)

Replace the `getStatus` closure (the full block shown in "Current state"
above, from `const getStatus = (bill: Bill) => {` through its closing
`};`) with nothing — delete it entirely — and change the call site
immediately after it from:

```tsx
    const allBillStatuses = bills.filter(b => !b.archived).map(bill => ({
      bill,
      ...getStatus(bill)
    }));
```

to:

```tsx
    const allBillStatuses = bills.filter(b => !b.archived).map(bill => ({
      bill,
      ...getBillCycleStatus(bill, payments, today)
    }));
```

`today` (from `const today = startOfDay(new Date());` a few lines above,
still present and unchanged) is now passed explicitly since
`getBillCycleStatus` is a pure function rather than a closure. The
now-possibly-unused `currentMonthStart` local (`const currentMonthStart =
startOfMonth(today);`) — check whether anything else in this `useMemo`
still references it after this edit; if nothing does, remove that line
too so there's no dead local left behind.

**Verify**: `pnpm check` → exits 0. `grep -n "const getStatus" client/src/pages/dashboard.tsx` → no matches. `grep -n "getBillCycleStatus" client/src/pages/dashboard.tsx` → 2 matches (the import and the call site).

## Test plan

Step 2 adds the required automated coverage — this is the one plan this
session where automated tests are mandatory, not deferred, because the
function under test is pure (no React, no DB) and directly determines
dollar amounts shown to the owner. `pnpm test` must show 8/8 passing
(3 pre-existing + 5 new).

Also verify manually against a live `pnpm dev` + the owner's real Neon DB,
using the exact bills already confirmed broken in this session's
investigation:

1. Load the Dashboard. Confirm `RCU: Mortgage` (bill id 1) now shows a
   green "Paid" badge, not "Next Cycle".
2. Confirm `CenterPoint: Gas` (bill id 16) also now shows "Paid".
3. Confirm the "Total Monthly Budget" card's "% Paid" and "$X of $Y" now
   reflect these (and any other already-paid-for-September bills) as
   paid — no longer "0% Paid — $0.00 of $3,035.28".
4. Confirm `USI: Internet` and `Integrity: Vehicle Insurance` (currently
   unpaid, due later in September) still show "Due" — unaffected by this
   fix, since they were never hitting the buggy code path.
5. `curl http://localhost:5050/api/payments` — confirm no payment rows
   were created, modified, or deleted by this change (this plan is
   read-only against the database; it only changes how the client
   *interprets* existing rows).
6. Confirm the "Unpaid"/"Paid"/"Overdue" filter pills (from plan 039)
   still filter correctly — clicking "Paid" should now include `RCU:
   Mortgage` and `CenterPoint: Gas`, which it incorrectly excluded before
   this fix.

**Verify**: all 6 observations above hold as described.

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, 8/8 passing (3 pre-existing + 5 new in `client/src/lib/bill-status.test.ts`)
- [ ] `client/src/lib/bill-status.ts` exists and exports `getBillCycleStatus`
- [ ] `grep -n "const getStatus" client/src/pages/dashboard.tsx` → no matches
- [ ] `grep -n "getBillCycleStatus" client/src/pages/dashboard.tsx` → 2 matches
- [ ] No files outside `client/src/lib/bill-status.ts` (new),
      `client/src/lib/bill-status.test.ts` (new), and
      `client/src/pages/dashboard.tsx` modified (`git status`)
- [ ] All 6 manual observations confirmed live, specifically including
      `RCU: Mortgage` and `CenterPoint: Gas` showing "Paid" and the stats
      card no longer reading "0% Paid"
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts above don't match the live code (drift
  since this plan was written).
- Any of the 5 new unit tests fail and you can't identify why within one
  reasonable debugging attempt — given the money stakes, do not weaken or
  delete a failing test to make it pass; report the discrepancy instead.
- You find more than one payment row per bill matching `paidForCurrentCycle`
  in the live data (multiple paid payments both falling in the current
  cycle) — this plan's algorithm assumes at most one, matching this app's
  own mutation invariants (`resetPayment`/`markPaidAndReset` never produce
  two payments for the same cycle in normal operation); if you find real
  data violating that, report it rather than guessing which one is
  authoritative.
- `pnpm check` or `pnpm test` report failures you can't resolve in one
  reasonable fix attempt.

## Maintenance notes

- `getUrgencyDisplay` (plans 037-039) and this plan's `getBillCycleStatus`
  are now cleanly separated: this function decides *what* a bill's status
  is (the correctness-critical part), `getUrgencyDisplay` decides *how to
  label/color* a `"pending"` result (the display-only part). Future
  wording changes to the "Due"/"Next Cycle" labels should only ever touch
  `getUrgencyDisplay`; future correctness fixes to status derivation
  should only ever touch `bill-status.ts`. Keep that boundary.
- If `client/src/pages/upcoming.tsx`'s separate status logic is ever found
  to have the same latest-payment-selection bug, it's a good candidate to
  migrate onto this same `getBillCycleStatus` function rather than
  duplicating the fix — not attempted in this plan since `upcoming.tsx`'s
  status model is structurally different (4 values including
  `"upcoming"`, month-grid-scoped) and out of this plan's scope.
- `client/src/pages/analytics.tsx` computes its own spending aggregates
  directly from `payments` (filtered by `status === "paid"`), not through
  `getStatus`/`getBillCycleStatus` — unaffected by this bug or this fix,
  not revisited here.
