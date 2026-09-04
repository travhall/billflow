# Plan 051: Wrap `revertPayment` in a transaction

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e4429a5..HEAD -- server/storage.ts`
> If the file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness (consistency hardening, low-confidence real-world impact)
- **Planned at**: commit `e4429a5`, 2026-09-04

## Why this matters

`revertPayment` (`server/storage.ts`) reads the payment, reads its bill,
searches for a matching next-cycle payment to clean up, updates the
reverted payment's status, and conditionally deletes the next-cycle row
— five separate statements against the bare `db` connection, none of it
wrapped in a transaction. Every other multi-statement write path in this
file *is* transaction-wrapped: `processAutoPay` (`db.transaction`),
`markPaidAndReset` (`db.transaction`, and it calls `resetPayment` with
the transaction handle passed through), and `resetPayment` itself
accepts an optional `executor` parameter specifically so callers can
include it in their own transaction. `revertPayment` is the one
exception to a pattern this file otherwise applies consistently.

Practically: this app is solo-user and runs locally (per `CLAUDE.md`),
so the realistic odds of two concurrent requests racing on the exact
same payment during the brief window between `revertPayment`'s read and
its write are low — this is a hardening/consistency fix, not a fix for
an observed bug. But the window is real (a concurrent `processAutoPay`
tick or a double-click firing two requests could each read stale state
before either writes), and the fix costs nothing: wrapping the existing
statements in `db.transaction` and swapping `db.` for the transaction
handle is a mechanical change with zero behavior difference in the
common (non-concurrent) case.

## Current state

Relevant file: `server/storage.ts` — only `revertPayment` changes.

`server/storage.ts:1-11` (today — imports, including the `Executor` type
alias already used by `resetPayment`'s optional-executor pattern that
this plan follows):

```ts
import { db } from "./db";
import {
  bills, payments, categoryBudgets,
  type Bill, type InsertBill, type Payment, type InsertPayment,
  type UpdateBillRequest, type UpdatePaymentRequest,
  type CategoryBudget,
} from "@shared/schema";
import { eq, desc, inArray, and, ne } from "drizzle-orm";
import { getNextCycleDueDate, getDueDateForMonth } from "@shared/date-utils";

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;
```

`server/storage.ts`'s `revertPayment` (today, full function):

```ts
  async revertPayment(id: number): Promise<Payment> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    if (!payment) throw new Error("Payment not found");

    const [bill] = await db.select().from(bills).where(eq(bills.id, payment.billId));
    if (!bill) throw new Error("Bill not found");

    if (bill.isAutoPay) {
      throw new Error("Can't revert an Auto Pay bill's payment — turn off Auto Pay for this bill first, or it will be marked paid again automatically.");
    }

    // If this payment was previously marked paid with "reset for next
    // cycle", resetPayment() inserted a fresh pending payment for the same
    // bill dated at the next cycle's due date. There is no direct link
    // between the two rows, so find it by matching billId + status +
    // the expected next due date, and remove it — mirroring what
    // TEST_PLAN.md:55 documents as the expected Undo behavior.
    const currentDueDate = new Date(payment.dueDate);
    const expectedNextDueDate = getNextCycleDueDate(currentDueDate, bill.frequency);

    const candidateNextPayments = await db.select().from(payments).where(
      and(
        eq(payments.billId, payment.billId),
        eq(payments.status, "pending"),
      )
    );
    const nextCyclePayment = candidateNextPayments.find(
      (p) => new Date(p.dueDate).getTime() === expectedNextDueDate.getTime()
    );

    const [updated] = await db.update(payments)
      .set({ status: "pending", paidDate: null })
      .where(eq(payments.id, id))
      .returning();

    if (nextCyclePayment) {
      await db.delete(payments).where(eq(payments.id, nextCyclePayment.id));
    }

    return updated;
  }
```

Exemplar pattern already in this same file for exactly this shape of
change — `resetPayment`'s existing optional-`executor` signature:

```ts
  async resetPayment(id: number, executor: Executor = db): Promise<Payment> {
```

And `markPaidAndReset`'s existing `db.transaction` wrapping pattern
(unchanged by this plan, shown for the shape to match):

```ts
  async markPaidAndReset(id: number, updates: { amount: string; paidDate: Date }): Promise<{ paid: Payment; next: Payment }> {
    return await db.transaction(async (tx) => {
      const [paid] = await tx.update(payments)
        .set({ amount: updates.amount, paidDate: updates.paidDate, status: "paid", notes: "" })
        .where(eq(payments.id, id))
        .returning();
      if (!paid) throw new Error("Payment not found");

      const next = await this.resetPayment(id, tx);
      return { paid, next };
    });
  }
```

`server/routes.ts`'s route handler (today, **unchanged by this plan** —
shown to confirm the call site needs no edit, since `revertPayment`'s
public signature — `(id: number) => Promise<Payment>` — doesn't change):

```ts
  app.post("/api/payments/:id/revert", async (req, res) => {
    try {
      const payment = await storage.revertPayment(Number(req.params.id));
      res.json(payment);
    } catch (err) {
      res.status(404).json({ message: err instanceof Error ? err.message : "Unknown error" });
    }
  });
```

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exits 0 |
| Tests     | `pnpm test`   | all pass (this plan adds no test files; see "Test plan" below) |
| Dev server | `pnpm dev`   | boots without error; used for manual verification |

## Scope

**In scope**:
- `server/storage.ts` (only `revertPayment`)

**Out of scope** (do NOT touch, even though related):
- `server/routes.ts`'s revert route — needs no change; `revertPayment`'s
  external signature and behavior are identical from the caller's
  perspective, only its internal atomicity improves.
- `resetPayment`, `markPaidAndReset`, `processAutoPay` — already
  correctly transaction-wrapped; not touched, shown above only as the
  pattern to match.
- The auto-pay guard (`if (bill.isAutoPay) throw ...`, from plan 045) —
  stays exactly where it is in the function, before any mutation; this
  plan doesn't move or alter it, just wraps the statements around it in
  a transaction.
- The `404` status code the route returns for a thrown error (a separate,
  pre-existing REST-semantics nit noted but explicitly not worth its own
  plan per this session's audit) — not touched here.

## Git workflow

- Branch: `advisor/051-wrap-revert-payment-in-transaction`
- Commit message style: imperative, capitalized sentence, no
  conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Wrap `revertPayment` in a transaction, matching `resetPayment`'s executor pattern

Replace the full `revertPayment` function (shown in "Current state"
above) with:

```ts
  async revertPayment(id: number): Promise<Payment> {
    return await db.transaction(async (tx) => {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, id));
      if (!payment) throw new Error("Payment not found");

      const [bill] = await tx.select().from(bills).where(eq(bills.id, payment.billId));
      if (!bill) throw new Error("Bill not found");

      if (bill.isAutoPay) {
        throw new Error("Can't revert an Auto Pay bill's payment — turn off Auto Pay for this bill first, or it will be marked paid again automatically.");
      }

      // If this payment was previously marked paid with "reset for next
      // cycle", resetPayment() inserted a fresh pending payment for the same
      // bill dated at the next cycle's due date. There is no direct link
      // between the two rows, so find it by matching billId + status +
      // the expected next due date, and remove it — mirroring what
      // TEST_PLAN.md:55 documents as the expected Undo behavior.
      const currentDueDate = new Date(payment.dueDate);
      const expectedNextDueDate = getNextCycleDueDate(currentDueDate, bill.frequency);

      const candidateNextPayments = await tx.select().from(payments).where(
        and(
          eq(payments.billId, payment.billId),
          eq(payments.status, "pending"),
        )
      );
      const nextCyclePayment = candidateNextPayments.find(
        (p) => new Date(p.dueDate).getTime() === expectedNextDueDate.getTime()
      );

      const [updated] = await tx.update(payments)
        .set({ status: "pending", paidDate: null })
        .where(eq(payments.id, id))
        .returning();

      if (nextCyclePayment) {
        await tx.delete(payments).where(eq(payments.id, nextCyclePayment.id));
      }

      return updated;
    });
  }
```

Every statement inside now runs against `tx` instead of the bare `db`,
and a thrown error (payment not found, bill not found, or the auto-pay
guard) anywhere inside the callback rolls back the whole transaction
automatically — no explicit rollback code needed, matching how
`markPaidAndReset`'s `if (!paid) throw ...` already relies on the same
Drizzle `db.transaction` behavior.

The function's external signature (`(id: number): Promise<Payment>`) is
unchanged — this plan does *not* add an optional `executor` parameter
the way `resetPayment` has one, because `revertPayment` currently has
exactly one caller (the route handler) and no internal caller ever needs
to include it in a larger transaction. Don't add unused parameters
speculatively.

**Verify**: `pnpm check` → exits 0. `grep -n "db\.select\|db\.update\|db\.delete" server/storage.ts` inside the `revertPayment` function body specifically → no matches (confirms every internal call now goes through `tx`, not `db` directly) — the easiest way to check this is `sed -n '/async revertPayment/,/^  }/p' server/storage.ts | grep -n "db\."`, which should return nothing.

## Test plan

No new automated tests — `revertPayment` hits the live DB with no test
harness available in this repo (same situation as every other
`storage.ts`-touching plan this session: 036, 040, 044, 045). Verify
manually against a live `pnpm dev` + a throwaway test bill (not the
owner's real data, per this session's established convention):

1. Create a test bill, mark it paid (creates a next-cycle pending
   payment via the normal rollover), then click "Revert to Pending" (or
   `curl -X POST .../revert` directly). Confirm it still succeeds exactly
   as before this plan — payment flips to pending, the auto-created
   next-cycle row is deleted, response is the reverted payment.
2. Repeat with an auto-pay test bill. Confirm the guard still rejects the
   revert with the same error message as before this plan (plan 045's
   behavior, unaffected by wrapping the surrounding statements in a
   transaction) — and confirm via a direct payments fetch that nothing
   was mutated (the transaction rolled back cleanly on the thrown error,
   same as it appeared to behave before, now provably atomic).
3. Try reverting a nonexistent payment id (e.g. `curl -X POST
   .../payments/999999/revert`). Confirm it still 404s with "Payment not
   found", unchanged.
4. Delete the test bill(s) afterward to leave the DB clean.

**Verify**: all 4 observations above hold as described — this plan
should be externally invisible; every check is "still works exactly as
before," not new behavior.

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (unchanged pass count — this plan adds no test files)
- [ ] `sed -n '/async revertPayment/,/^  }/p' server/storage.ts | grep -n "db\."` → no matches
- [ ] `sed -n '/async revertPayment/,/^  }/p' server/storage.ts | grep -c "tx\."` → matches the number of statements in the function (5: 3 selects, 1 update, 1 conditional delete)
- [ ] No files outside `server/storage.ts` modified (`git status`)
- [ ] All 4 manual observations confirmed live
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpt above doesn't match the live code (drift
  since this plan was written).
- `pnpm check` reports new errors you can't resolve in one reasonable fix
  attempt.
- Any of the 4 manual verification steps behaves differently than
  described (this plan should be externally invisible — any behavior
  change beyond "still works the same" means something went wrong in the
  transaction wrap).

## Maintenance notes

- If `revertPayment` ever gains a second internal caller that needs to
  include it in a larger transaction (mirroring `markPaidAndReset` calling
  `resetPayment` with a shared `tx`), add the same optional `executor:
  Executor = db` parameter `resetPayment` already has — not needed today,
  deliberately not added speculatively.
