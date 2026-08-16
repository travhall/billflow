# Plan 004: `revertPayment` must remove the next-cycle payment it invalidates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- server/storage.ts TEST_PLAN.md`
> If either file changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

The app's own manual QA spec, `TEST_PLAN.md:55`, documents the expected
behavior of the "Undo" button on a paid bill:

> 4d | Revert the payment (Undo button) | Bill returns to pending; **next-cycle record removed**

But `revertPayment()` only flips the reverted payment's `status` back to
`"pending"` — it never looks for or deletes the next-cycle payment that
`resetPayment()` already inserted when the bill was originally marked
paid. Result: after "Mark Paid" (with "Reset for next cycle" checked, the
default) followed by "Undo", the bill ends up with **two** active payment
rows for what should be one billing cycle — the reverted-to-pending
original, and the leftover next-cycle payment nothing ever cleans up. This
directly corrupts the payment history the app is supposed to track.

## Current state

`server/storage.ts:122-128` — `revertPayment`, the buggy version:
```ts
async revertPayment(id: number): Promise<Payment> {
  const [updated] = await db.update(payments)
    .set({ status: "pending", paidDate: null })
    .where(eq(payments.id, id))
    .returning();
  return updated;
}
```

`server/storage.ts:94-120` — `resetPayment`, which is what inserts the
next-cycle payment that `revertPayment` needs to be able to find and
remove:
```ts
async resetPayment(id: number): Promise<Payment> {
  const [payment] = await db.select().from(payments).where(eq(payments.id, id));
  if (!payment) throw new Error("Payment not found");

  const [bill] = await db.select().from(bills).where(eq(bills.id, payment.billId));
  if (!bill) throw new Error("Bill not found");

  const currentDueDate = new Date(payment.dueDate);
  let nextDueDate: Date;
  // ... date math (see plans/001 for the fix to this part) ...

  const [newPayment] = await db.insert(payments).values({
    billId: payment.billId,
    amount: bill.defaultAmount,
    dueDate: nextDueDate,
    status: "pending",
  }).returning();

  return newPayment;
}
```

Note there is **no foreign key or link** from the new next-cycle payment
back to the payment it was created from — `resetPayment` inserts a fresh
row with only `billId`, `amount`, `dueDate`, `status`. This means
`revertPayment` cannot identify "the specific next-cycle row this payment
spawned" by any direct reference; it has to identify it by shape: same
`billId`, `status === "pending"`, and a `dueDate` matching what
`resetPayment` would have computed from this payment's `dueDate` and the
bill's frequency.

`server/routes.ts:127-134` — the route that calls `revertPayment`:
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

`TEST_PLAN.md:52-56` — the spec this plan is fixing behavior to match:
```
| 4c | Submit | Bill marked paid; new pending record created for next cycle |
| 4d | Revert the payment (Undo button) | Bill returns to pending; next-cycle record removed |
```

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

No automated test runner exists. Verification uses `curl` against the
running dev server with a reachable `DATABASE_URL`.

## Scope

**In scope**:
- `server/storage.ts` — `revertPayment()` only.

**Out of scope**:
- `resetPayment()` itself — not modified by this plan (its due-date math is
  covered separately by `plans/001-unify-due-date-calculation.md`; this
  plan only reads its output shape to know what to look for).
- Adding a schema-level link (foreign key) from a payment to the payment
  it was rolled over from — a cleaner long-term fix, but a schema/migration
  change is out of scope for this bug fix; the shape-matching approach
  below is deliberately conservative.

## Git workflow

- Branch: `advisor/004-revert-payment-cleanup`
- Commit per step; message style matches repo history. Suggested message:
  `Remove next-cycle payment when reverting a paid payment`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Identify and delete the matching next-cycle payment inside `revertPayment`

Replace `server/storage.ts:122-128` with:

```ts
async revertPayment(id: number): Promise<Payment> {
  const [payment] = await db.select().from(payments).where(eq(payments.id, id));
  if (!payment) throw new Error("Payment not found");

  const [bill] = await db.select().from(bills).where(eq(bills.id, payment.billId));
  if (!bill) throw new Error("Bill not found");

  // If this payment was previously marked paid with "reset for next
  // cycle", resetPayment() inserted a fresh pending payment for the same
  // bill dated at the next cycle's due date. There is no direct link
  // between the two rows, so find it by matching billId + status +
  // the expected next due date, and remove it — mirroring what
  // TEST_PLAN.md:55 documents as the expected Undo behavior.
  const currentDueDate = new Date(payment.dueDate);
  const expectedNextDueDate = getNextCycleDueDate(currentDueDate, bill.frequency); // from shared/date-utils (plan 001)

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

Add `and` to the existing `drizzle-orm` import at the top of the file if
not already present (`import { eq, desc, and } from "drizzle-orm";` —
check whether `plans/002-atomic-autopay-rollover.md` already added
`inArray` to this same import line; if so, combine into one import with
`eq, desc, inArray, and`).

This depends on `getNextCycleDueDate` from `shared/date-utils.ts` — if
`plans/001-unify-due-date-calculation.md` has not been applied yet, either
apply it first, or (if running this plan standalone) inline the
equivalent next-cycle-date calculation using the same clamping logic
shown in that plan's Step 1, and add the import
`import { getNextCycleDueDate } from "@shared/date-utils";` once it
exists.

**Verify**: `pnpm check` → exit 0.

### Step 2: Manually verify the fix

With `pnpm dev` running and a reachable `DATABASE_URL`:

1. Create a bill (any frequency).
2. Mark it paid with "Reset for next cycle" checked (via the UI's Mark
   Paid dialog, or `POST /api/payments` then `POST /api/payments/:id/reset`
   directly).
3. Confirm via `GET /api/payments` that the bill now has 2 payments: one
   `paid`, one `pending` (the next-cycle row).
4. Call `POST /api/payments/:id/revert` on the `paid` payment's id.
5. `GET /api/payments` again for this bill.

**Verify**: exactly 1 payment remains for the bill, with `status: "pending"`
and `paidDate: null` — the next-cycle row from step 3 is gone. Before this
fix, step 5 would show 2 payments (the reverted one + the orphaned
next-cycle one).

## Test plan

- No automated test framework exists. Verification is the manual sequence
  in Step 2, which reproduces the exact scenario `TEST_PLAN.md:52-56`
  describes and confirms the fixed behavior matches it.
- Edge case worth checking manually while you're in there: revert a
  payment that was marked paid *without* "reset for next cycle" (so no
  next-cycle payment was ever created) — confirm `revertPayment` still
  succeeds and doesn't error when `nextCyclePayment` is `undefined`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -n "nextCyclePayment" server/storage.ts` shows the lookup-and-delete logic present in `revertPayment`
- [ ] Manual Step 2 above shows exactly 1 payment remaining after revert (not 2)
- [ ] The edge case (revert without a prior reset) does not throw
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.
- `getNextCycleDueDate` isn't available and plan 001 hasn't been applied —
  either apply it first or inline the equivalent logic as described in
  Step 1, but do not guess at a different date-matching approach.
- The shape-matching heuristic (billId + pending status + exact due-date
  match) ever matches more than one candidate row in your manual testing —
  report this rather than picking one arbitrarily, since it would indicate
  a data state this plan didn't anticipate (e.g. two independently-created
  pending payments for the same bill landing on the same due date).

## Maintenance notes

- This fix uses a **heuristic match** (billId + status + computed due
  date) because the schema has no direct link between a payment and the
  payment it was rolled over from. If a future change adds a
  `previousPaymentId` (or similar) column to `payments`, this function
  should be revisited to use that direct link instead of date-matching,
  which is more robust against edge cases like two pending payments
  landing on the same date.
- A reviewer should specifically test the "revert a manually-created
  payment with no prior reset" edge case, since that's the one path where
  `nextCyclePayment` is expected to be `undefined` and the function must
  not error.
