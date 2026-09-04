# Plan 044: Make `resetPayment` idempotent and remove the redundant "Next Cycle" button

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 9d5bb21..HEAD -- server/storage.ts client/src/pages/dashboard.tsx client/src/hooks/use-payments.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding;
> on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (changes a function called from every payment-rollover
  path in the app — `processAutoPay`, `markPaidAndReset`, and the manual
  reset route — so the idempotency guard must not break any of them)
- **Depends on**: none
- **Category**: bug (data-correctness)
- **Planned at**: commit `9d5bb21`, 2026-09-03

## Why this matters

The Dashboard's "Next Cycle" button (shown on any paid bill, next to
"Revert to Pending") calls `POST /api/payments/:id/reset` →
`storage.resetPayment`, which unconditionally inserts a new pending
payment for the bill's next cycle — with no check for whether one already
exists. But every paid bill visible in that table already got its
next-cycle row created automatically, atomically, the moment it was
marked paid (`markPaidAndReset` marks the payment paid *and* calls
`resetPayment` in the same transaction). Investigation into the running
dev DB confirmed the button is therefore **always redundant** — there's
no code path (including CSV import, which only creates bills, never
payments) that produces a paid bill without a next-cycle row already
waiting — and clicking it anyway produces a genuine duplicate: two
separate payment rows for the identical next due date, with nothing
capping how many more clicks would keep adding.

This was caught live: the owner clicked "Next Cycle" on `Mint Mobile:
Travis` (bill 24) and `Mint Mobile: Erin` (bill 25), and confirmed
duplicate 2027 payment rows appeared for both (payments 56 and 57,
identical due dates to the already-existing 36 and 38). Those two
duplicates were deleted directly during this session
(`DELETE /api/payments/56`, `DELETE /api/payments/57`, both 204) — the
live DB is already clean; this plan is about preventing recurrence, not
further cleanup.

Two fixes, one server-side and one client-side:

1. **`resetPayment` becomes idempotent** — the real guarantee. If an
   unpaid payment already exists for the bill, return it instead of
   inserting another. This protects every caller, including any future
   or direct-API use, not just the button.
2. **Remove the "Next Cycle" button entirely** — since it's proven always
   redundant, a button that (after fix 1) merely does nothing when
   clicked is confusing dead UI; better to not show it at all.

## Current state

Relevant files:

- `server/storage.ts` — `resetPayment`, the function being fixed. Called
  by `processAutoPay` and `markPaidAndReset` internally (server-side
  method calls, not HTTP), and by the `POST /api/payments/:id/reset`
  route (`server/routes.ts:120-127`, **unchanged by this plan** — still
  needed, see Scope).
- `client/src/pages/dashboard.tsx` — the "Next Cycle" button, its prop
  plumbing (`BillTableProps.onResetCycle`/`resetPending`), and the
  `resetMutation` hook call being removed.
- `client/src/hooks/use-payments.ts` — `useResetPayment`, the hook being
  removed. `resetPaymentRequest` (the raw function it wraps) is **not**
  removed — confirmed via `grep -rn "resetPaymentRequest" client/src/` to
  have a second, independent caller: `mark-paid-dialog.tsx:89`, in its
  "new payment" (create-then-reset) 2-request flow, which stays fully
  intact and untouched by this plan.

`server/storage.ts:148-166` (today):

```ts
  async resetPayment(id: number, executor: Executor = db): Promise<Payment> {
    const [payment] = await executor.select().from(payments).where(eq(payments.id, id));
    if (!payment) throw new Error("Payment not found");

    const [bill] = await executor.select().from(bills).where(eq(bills.id, payment.billId));
    if (!bill) throw new Error("Bill not found");

    const currentDueDate = new Date(payment.dueDate);
    const nextDueDate = getNextCycleDueDate(currentDueDate, bill.frequency);

    const [newPayment] = await executor.insert(payments).values({
      billId: payment.billId,
      amount: bill.defaultAmount,
      dueDate: nextDueDate,
      status: "pending",
    }).returning();

    return newPayment;
  }
```

`server/storage.ts:1-9` (imports already available — `and`, `ne`, `eq`
already imported, no new import needed):

```ts
import { db } from "./db";
import {
  bills, payments, categoryBudgets,
  type Bill, type InsertBill, type Payment, type InsertPayment,
  type UpdateBillRequest, type UpdatePaymentRequest,
  type CategoryBudget,
} from "@shared/schema";
import { eq, desc, inArray, and, ne } from "drizzle-orm";
```

`client/src/pages/dashboard.tsx:75-87` (today — `BillTableProps`; this
plan removes `onResetCycle` and `resetPending`):

```ts
interface BillTableProps {
  items: BillStatusItem[];
  title: string;
  sortConfig: SortConfig;
  onSort: (key: string) => void;
  onShowHistory: (bill: Bill) => void;
  onDeleteBill: (id: number) => void;
  onMarkPaid: (bill: Bill, dueDate: Date, paymentId?: number) => void;
  onResetCycle: (paymentId: number) => void;
  onRevertPayment: (paymentId: number) => void;
  resetPending: boolean;
  revertPending: boolean;
}
```

`client/src/pages/dashboard.tsx:96-106` (today — the destructured
params, same removals):

```tsx
  title,
  sortConfig,
  onSort,
  onShowHistory,
  onDeleteBill,
  onMarkPaid,
  onResetCycle,
  onRevertPayment,
  resetPending,
  revertPending,
}: BillTableProps) {
```

`client/src/pages/dashboard.tsx:252-275` (today — the button block; this
plan removes only the second `<Button>` (lines 264-273), keeping the
wrapping `<div>` and the "Revert to Pending" button exactly as-is):

```tsx
                    {item.status === "paid" && item.paymentId && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRevertPayment(item.paymentId!)}
                          disabled={revertPending}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground no-default-hover-elevate"
                          title="Revert to Pending"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onResetCycle(item.paymentId!)}
                          disabled={resetPending}
                          className="h-8 border-primary/20 hover:bg-primary/5 text-primary gap-2"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Next Cycle
                        </Button>
                      </div>
                    )}
```

`client/src/pages/dashboard.tsx:298-303` (today — the hook calls):

```tsx
  const { openDialog } = useMarkPaidDialog();
  const deleteBill = useDeleteBill();
  const resetMutation = useResetPayment();
  const revertMutation = useRevertPayment();
```

`client/src/pages/dashboard.tsx:625-645` (today — both `<BillTable>` call
sites; this plan removes the `onResetCycle`/`resetPending` lines from
both, verbatim identical removal at each):

```tsx
              sortConfig={sortConfig}
              onSort={handleSort}
              onShowHistory={setHistoryBill}
              onDeleteBill={(id) => deleteBill.mutate(id)}
              onMarkPaid={openDialog}
              onResetCycle={(id) => resetMutation.mutate(id)}
              onRevertPayment={(id) => revertMutation.mutate(id)}
              resetPending={resetMutation.isPending}
              revertPending={revertMutation.isPending}
            />
            <BillTable
              items={filteredAnnual}
              title="Annual Bills Overview"
              sortConfig={sortConfig}
              onSort={handleSort}
              onShowHistory={setHistoryBill}
              onDeleteBill={(id) => deleteBill.mutate(id)}
              onMarkPaid={openDialog}
              onResetCycle={(id) => resetMutation.mutate(id)}
              onRevertPayment={(id) => revertMutation.mutate(id)}
              resetPending={resetMutation.isPending}
```

`client/src/hooks/use-payments.ts:65-87` (today — `resetPaymentRequest`
stays, `useResetPayment` goes; note the doc comment above this block,
already present, explicitly calls `resetPaymentRequest` one of the "raw
request functions" with no standalone hook needed by its remaining
caller):

```ts
export async function resetPaymentRequest(paymentId: number): Promise<Payment> {
  const res = await fetch(buildUrl("/api/payments/:id/reset", { id: paymentId }), {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to reset billing cycle");
  return (await res.json()) as Payment;
}

export function useResetPayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: resetPaymentRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.payments.list.path] });
      toast({
        title: "Success",
        description: "Billing cycle reset for the next period.",
      });
    },
  });
}
```

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exits 0 |
| Tests     | `pnpm test`   | all pass (this plan adds no test files; see "Test plan" below) |
| Dev server | `pnpm dev`   | boots without error; used for manual verification |

## Scope

**In scope**:
- `server/storage.ts` (only `resetPayment`)
- `client/src/pages/dashboard.tsx`
- `client/src/hooks/use-payments.ts` (only `useResetPayment` — remove it; `resetPaymentRequest` stays)

**Out of scope** (do NOT touch, even though related):
- `server/routes.ts`'s `POST /api/payments/:id/reset` route
  (`server/routes.ts:120-127`) — stays exactly as-is. Still called by
  `resetPaymentRequest`, still needed by `mark-paid-dialog.tsx`'s
  new-payment flow.
- `client/src/hooks/use-payments.ts`'s `resetPaymentRequest` function —
  stays. Do not delete it along with `useResetPayment`; they are
  separate, and only the hook is dead code.
- `client/src/components/mark-paid-dialog.tsx` — not touched. Its use of
  `resetPaymentRequest` is a legitimate, different call path (creating a
  bill's very first payment and immediately rolling it forward in one
  user action) — this plan's idempotency fix makes that path *more*
  robust for free (it's now safe even if somehow called twice), not less
  functional.
- `processAutoPay` and `markPaidAndReset` (`server/storage.ts`) — not
  modified; both already call `this.resetPayment(...)` internally and
  automatically benefit from the idempotency guard without needing any
  change of their own.
- `revertPayment` and the "Revert to Pending" button — completely
  unrelated action, stays exactly as it is (including the wrapping
  `<div className="flex gap-2">`, which keeps its one remaining child
  fine as-is).
- `RotateCcw` import in `dashboard.tsx` — remove only if, after Step 2,
  `grep -n "RotateCcw" client/src/pages/dashboard.tsx` shows no remaining
  usage (confirmed at plan-writing time to have exactly one usage, the
  button being removed — re-confirm this yourself before removing the
  import, in case of drift).

## Git workflow

- Branch: `advisor/044-idempotent-reset-payment`
- Commit per step or per logical unit. Message style: imperative,
  capitalized sentences, no conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `resetPayment` idempotent

Change `server/storage.ts:148-166` from:

```ts
  async resetPayment(id: number, executor: Executor = db): Promise<Payment> {
    const [payment] = await executor.select().from(payments).where(eq(payments.id, id));
    if (!payment) throw new Error("Payment not found");

    const [bill] = await executor.select().from(bills).where(eq(bills.id, payment.billId));
    if (!bill) throw new Error("Bill not found");

    const currentDueDate = new Date(payment.dueDate);
    const nextDueDate = getNextCycleDueDate(currentDueDate, bill.frequency);

    const [newPayment] = await executor.insert(payments).values({
      billId: payment.billId,
      amount: bill.defaultAmount,
      dueDate: nextDueDate,
      status: "pending",
    }).returning();

    return newPayment;
  }
```

to:

```ts
  async resetPayment(id: number, executor: Executor = db): Promise<Payment> {
    const [payment] = await executor.select().from(payments).where(eq(payments.id, id));
    if (!payment) throw new Error("Payment not found");

    const [existingUnpaid] = await executor.select().from(payments)
      .where(and(eq(payments.billId, payment.billId), ne(payments.status, "paid"), ne(payments.id, id)));
    if (existingUnpaid) {
      return existingUnpaid;
    }

    const [bill] = await executor.select().from(bills).where(eq(bills.id, payment.billId));
    if (!bill) throw new Error("Bill not found");

    const currentDueDate = new Date(payment.dueDate);
    const nextDueDate = getNextCycleDueDate(currentDueDate, bill.frequency);

    const [newPayment] = await executor.insert(payments).values({
      billId: payment.billId,
      amount: bill.defaultAmount,
      dueDate: nextDueDate,
      status: "pending",
    }).returning();

    return newPayment;
  }
```

The new check looks for any *other* unpaid payment on the same bill
(excluding the row being reset itself, via `ne(payments.id, id)` — needed
because in every real call site today, the row being reset is either
already `"paid"` or about to be within the same transaction, but this
keeps the check correct regardless). If one exists, it's returned as-is —
no insert, no duplicate — matching "we should never add a 3rd row"
regardless of how many times this is called.

Note: this closes the *sequential* duplicate-click bug that was actually
observed (each click is a separate completed request before the next
starts). It does not add cross-request locking against two genuinely
*simultaneous* requests racing each other — see Maintenance notes.

**Verify**: `pnpm check` → exits 0.

### Step 2: Remove the "Next Cycle" button, keep "Revert to Pending"

Change `client/src/pages/dashboard.tsx:252-275` from the block shown in
full in "Current state" above to:

```tsx
                    {item.status === "paid" && item.paymentId && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRevertPayment(item.paymentId!)}
                          disabled={revertPending}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground no-default-hover-elevate"
                          title="Revert to Pending"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
```

Only the second `<Button>` (the "Next Cycle" one, with its `RotateCcw`
icon) is removed. The wrapping `<div>` and the "Revert to Pending" button
are untouched.

**Verify**: `pnpm check` → exits 0 (expected to still show unused-variable-style errors for `onResetCycle`/`resetPending`/`resetMutation`/`useResetPayment` until Steps 3-4 remove them — this repo has no `noUnusedLocals` in `tsconfig.json`, confirmed at plan-writing time via `grep -i unused tsconfig.json` returning nothing, so these won't actually fail `tsc` — but remove them anyway per Steps 3-4 for cleanliness, not because typecheck forces it).

### Step 3: Remove the now-dead `onResetCycle`/`resetPending` plumbing in `dashboard.tsx`

Remove `onResetCycle: (paymentId: number) => void;` and `resetPending:
boolean;` from the `BillTableProps` interface (`dashboard.tsx:75-87`).

Remove `onResetCycle,` and `resetPending,` from the destructured
component params (`dashboard.tsx:96-106`).

Remove `const resetMutation = useResetPayment();`
(`dashboard.tsx:300`).

Remove `onResetCycle={(id) => resetMutation.mutate(id)}` and
`resetPending={resetMutation.isPending}` from **both** `<BillTable>` call
sites (`dashboard.tsx:625-645` — two occurrences, one per table, shown in
full in "Current state" above).

Change the import at the top of the file from:

```ts
import { useResetPayment, useRevertPayment } from "@/hooks/use-payments";
```

to:

```ts
import { useRevertPayment } from "@/hooks/use-payments";
```

Re-confirm `grep -n "RotateCcw" client/src/pages/dashboard.tsx` now shows
no matches (Step 2 removed its only usage); if so, remove `RotateCcw`
from the `lucide-react` import list at the top of the file. If it still
shows a match (drift from what this plan expected), leave the import
alone and note the discrepancy in your report.

**Verify**: `pnpm check` → exits 0. `grep -n "onResetCycle\|resetPending\|resetMutation" client/src/pages/dashboard.tsx` → no matches.

### Step 4: Remove the now-unused `useResetPayment` hook

Remove the `useResetPayment` function
(`client/src/hooks/use-payments.ts:73-87`, shown in full in "Current
state" above) entirely. Leave `resetPaymentRequest`
(`use-payments.ts:65-71`) exactly as it is — it has a second, independent
caller (`mark-paid-dialog.tsx:89`) and must not be removed.

The doc comment above this section of the file
(`use-payments.ts:17-22`, "Raw request functions below... are the single
source of truth...") already describes `resetPaymentRequest` as one of
the raw functions with no standalone hook needed elsewhere — it's now
accurate for this function too in every remaining respect, since its one
remaining caller (`mark-paid-dialog.tsx`) already calls it as a raw
function, not through a hook. No comment change needed.

**Verify**: `pnpm check` → exits 0. `grep -n "useResetPayment" client/src/` → no matches anywhere in the codebase. `grep -n "resetPaymentRequest" client/src/hooks/use-payments.ts client/src/components/mark-paid-dialog.tsx` → present in both (function definition + its one real caller, unchanged).

## Test plan

No new automated tests for the UI removal (no React rendering harness in
this repo, same as every prior plan touching `dashboard.tsx` this
session). But `resetPayment`'s new idempotency branch is exactly the kind
of pure-ish, high-stakes logic this repo already has Vitest coverage for
elsewhere (`shared/date-utils.test.ts`, `client/src/lib/bill-status.test.ts`
from plan 040) — however, `resetPayment` itself is not a pure function
(it hits the live DB via `executor`), and this repo has no DB-mocking or
test-database harness (confirmed by every prior storage.ts-touching plan
this session, e.g. 036, 040). Adding one is out of scope here. Verify
manually instead, against a live `pnpm dev` + the owner's real Neon DB:

1. Confirm the "Next Cycle" button no longer appears anywhere for any
   paid bill in either table — only "Revert to Pending" (the undo icon)
   remains in that action group.
2. Pick any currently-unpaid bill, mark it paid via "Mark Paid". Confirm
   this still works exactly as before (goes through `markPaidAndReset`,
   unaffected by this plan) — the bill shows "Paid", and a next-cycle
   pending row is created for it as usual.
3. Directly exercise the now-button-less endpoint to confirm the
   idempotency guard actually works: find that same bill's newly-paid
   payment's id (via `curl http://localhost:5050/api/payments`, filter by
   the bill), then `curl -X POST http://localhost:5050/api/payments/<that-id>/reset`
   **twice** in a row. Confirm via `curl http://localhost:5050/api/payments`
   afterward that the bill still has exactly **one** pending next-cycle
   row, not two or three — this is the direct regression test for the
   exact bug that was found live in this session.
4. Confirm `Mint Mobile: Travis` (bill 24) and `Mint Mobile: Erin` (bill
   25) — the two bills the duplicates were found and cleaned up on this
   session — each still show exactly one pending 2027 payment
   (`curl http://localhost:5050/api/payments`, filter by `billId` 24 and
   25) — confirming the earlier manual cleanup wasn't disturbed.
5. Create a brand-new bill via "Add Bill" with no prior payment history,
   then mark its first cycle paid (exercises `mark-paid-dialog.tsx`'s
   *new-payment* 2-request `createPaymentRequest` → `resetPaymentRequest`
   path specifically, the one caller this plan deliberately preserves).
   Confirm it still correctly ends up "Paid" with exactly one next-cycle
   pending row — not zero, not two.
6. Delete/archive any test bill created for step 5 afterward to leave the
   DB clean, matching this session's established cleanup convention.

**Verify**: all 6 observations above hold as described.

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (unchanged pass count — this plan adds no test files)
- [ ] `grep -n "existingUnpaid" server/storage.ts` → present inside `resetPayment`
- [ ] `grep -n "Next Cycle" client/src/pages/dashboard.tsx` → no matches
- [ ] `grep -n "onResetCycle\|resetPending\|resetMutation\|useResetPayment" client/src/pages/dashboard.tsx` → no matches
- [ ] `grep -n "useResetPayment" client/src/` → no matches anywhere
- [ ] `grep -n "resetPaymentRequest" client/src/hooks/use-payments.ts client/src/components/mark-paid-dialog.tsx` → present in both, unchanged
- [ ] No files outside the 3 in-scope files modified (`git status`)
- [ ] All 6 manual observations confirmed live
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt above doesn't match the live code at that
  location (drift since this plan was written).
- `resetPaymentRequest` has gained additional callers beyond
  `mark-paid-dialog.tsx` since this plan was written (i.e.
  `grep -rn "resetPaymentRequest" client/src/` returns more than the 2
  matches named in this plan) — investigate what the new caller needs
  before assuming this plan's removal of `useResetPayment` (a different,
  separate export) is still safe.
- `pnpm check` reports new errors you can't resolve in one reasonable fix
  attempt.
- Step 3's `RotateCcw` re-check finds it still in use elsewhere in
  `dashboard.tsx` — leave the import alone and note it, don't guess.

## Maintenance notes

- This plan's idempotency check (SELECT existing unpaid, then INSERT if
  none) is not safe against two truly *simultaneous* requests both
  passing the SELECT before either INSERT commits — a real theoretical
  gap, same class of race plan 002 fixed for `processAutoPay` via a
  conditional `UPDATE` + row-lock pattern. Not fixed here because the
  actual observed bug was sequential (a human clicking a button multiple
  times, each click a fully completed request), and removing the button
  removes the main realistic trigger for rapid repeated calls. If a
  future caller needs true concurrent-safety (e.g. a bulk/automated
  reset path), revisit with the same row-locking approach plan 002 used.
- If a future feature wants to re-expose "manually roll a paid bill
  forward" as a user action (the owner explicitly did not want this, per
  this session's conversation, but flagging in case direction changes
  later), the safe way to do it now is trivial: the idempotency guard
  from Step 1 means it's just wiring the button back up — `resetPayment`
  itself already handles being called on an already-rolled-forward bill
  correctly.
