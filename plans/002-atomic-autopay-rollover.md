# Plan 002: Make auto-pay rollover atomic and remove the N+1/duplicate query in `getPayments()`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- server/storage.ts`
> If this file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Depends on `plans/001-unify-due-date-calculation.md`**: that plan
> changes `resetPayment()`'s due-date calculation to call
> `getNextCycleDueDate()` from `shared/date-utils.ts`. Run `001` first (or
> confirm it's already applied via `grep -n "getNextCycleDueDate" server/storage.ts`)
> before starting this plan — the excerpts below assume it's in place.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-unify-due-date-calculation.md
- **Category**: bug
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`getPayments()` — the function behind `GET /api/payments`, which every page
in the app calls on load — does three things wrong in one function:

1. It scans **all** payments, then for each overdue auto-pay payment issues
   a *separate* `SELECT` (bill lookup), `UPDATE` (mark paid), and a call to
   `resetPayment()` (2 more selects + 1 insert) — none of it batched.
2. After that loop, it re-runs the **exact same** initial `SELECT` a second
   time and returns that, discarding the first result entirely.
3. None of the auto-pay writes (the `UPDATE` + the `resetPayment` insert)
   are wrapped in a transaction. Two concurrent `GET /api/payments`
   requests (e.g. two browser tabs open at once) can both read the same
   overdue payment as not-yet-paid before either write commits, and both
   proceed to mark it paid and insert a next-cycle payment — producing a
   duplicate payment row for the same billing cycle. If the process
   crashes between the `UPDATE` and the `resetPayment` insert, the bill is
   left marked paid with **no** payment queued for the next cycle, and
   silently stops being tracked.

This is exactly the kind of bug a bill tracker cannot afford: it can
corrupt financial history, not just waste a query.

## Current state

`server/storage.ts:54-74` — `getPayments()`:

```ts
async getPayments(): Promise<Payment[]> {
  const allPayments = await db.select().from(payments).orderBy(desc(payments.dueDate));

  // Auto-pay logic: check if any pending/overdue payments for auto-pay bills have passed their due date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const payment of allPayments) {
    if (payment.status !== "paid" && new Date(payment.dueDate) < today) {
      const [bill] = await db.select().from(bills).where(eq(bills.id, payment.billId));
      if (bill && bill.isAutoPay) {
        await db.update(payments)
          .set({ status: "paid", paidDate: new Date() })
          .where(eq(payments.id, payment.id));
        await this.resetPayment(payment.id);
      }
    }
  }

  return await db.select().from(payments).orderBy(desc(payments.dueDate));
}
```

`server/storage.ts:94-120` — `resetPayment()` (after plan 001 is applied,
this calls `getNextCycleDueDate` from `shared/date-utils.ts` instead of
inline `setMonth`/`setFullYear` math — the structure below is otherwise
unchanged):

```ts
async resetPayment(id: number): Promise<Payment> {
  const [payment] = await db.select().from(payments).where(eq(payments.id, id));
  if (!payment) throw new Error("Payment not found");

  const [bill] = await db.select().from(bills).where(eq(bills.id, payment.billId));
  if (!bill) throw new Error("Bill not found");

  const currentDueDate = new Date(payment.dueDate);
  const nextDueDate = getNextCycleDueDate(currentDueDate, bill.frequency); // after plan 001

  const [newPayment] = await db.insert(payments).values({
    billId: payment.billId,
    amount: bill.defaultAmount,
    dueDate: nextDueDate,
    status: "pending",
  }).returning();

  return newPayment;
}
```

`server/db.ts:1-14` — the Drizzle instance, using `drizzle-orm/node-postgres`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;
// ...
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

`drizzle-orm/node-postgres`'s `db` object supports `db.transaction(async (tx) => {...})`,
which is the mechanism this plan uses — no new dependency required (the
installed `drizzle-orm@0.45.2` already ships this API).

`server/routes.ts:76-79` — the only route that calls `getPayments()`:

```ts
app.get(api.payments.list.path, async (req, res) => {
  const payments = await storage.getPayments();
  res.json(payments);
});
```

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

This repo has no automated test runner. Verification for the DB-touching
changes in this plan requires a running dev server with a reachable
`DATABASE_URL` (already configured in `.env` per this repo's existing
setup) and `curl` against the local server.

## Scope

**In scope**:
- `server/storage.ts` — `getPayments()` and (only if needed to share a
  transaction handle) `resetPayment()`'s signature.

**Out of scope**:
- `server/routes.ts` — no route wiring changes needed; `getPayments()`'s
  external signature (`Promise<Payment[]>`) stays the same.
- Moving auto-pay processing out of a GET handler into a scheduled job or
  a separate endpoint — that's a larger architectural change than this
  plan's scope; note it under Maintenance notes instead.
- `resetPayment()`'s due-date math — covered by plan 001, must already be applied.

## Git workflow

- Branch: `advisor/002-atomic-autopay-rollover`
- Commit per step; message style matches repo history (imperative,
  capitalized). Suggested message: `Make auto-pay rollover transactional and remove duplicate query in getPayments`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Give `resetPayment` an optional transaction handle

Drizzle's transaction callback provides a `tx` object with the same query
API as `db`. To reuse `resetPayment`'s insert logic inside a transaction
started by `getPayments`, add an optional parameter so it can run against
either the top-level `db` or a transaction's `tx`:

```ts
import { db } from "./db";

// Replace the resetPayment signature:
async resetPayment(id: number, executor: typeof db = db): Promise<Payment> {
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

If TypeScript rejects `typeof db` as the parameter type for a transaction
object (Drizzle's transaction type is often structurally different from
the top-level db type), use the type of `db.transaction`'s callback
parameter instead — e.g. define
`type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db`
and type `executor: Executor = db`. Confirm whichever approach you use
against `pnpm check` before moving on — do not suppress the error with `any`.

**Verify**: `pnpm check` → exit 0. `resetPayment(id)` called with no second
argument (as `server/routes.ts:118-125`'s `/reset` endpoint does today)
must still typecheck and behave identically.

### Step 2: Rewrite `getPayments()` to batch-fetch bills and wrap auto-pay writes in a transaction

Replace `server/storage.ts:54-74` with:

```ts
async getPayments(): Promise<Payment[]> {
  const allPayments = await db.select().from(payments).orderBy(desc(payments.dueDate));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overduePending = allPayments.filter(
    (p) => p.status !== "paid" && new Date(p.dueDate) < today
  );

  if (overduePending.length === 0) {
    return allPayments;
  }

  // Batch-fetch the bills for every overdue payment in one query instead
  // of one query per payment.
  const billIds = Array.from(new Set(overduePending.map((p) => p.billId)));
  const relevantBills = await db.select().from(bills).where(inArray(bills.id, billIds));
  const billsById = new Map(relevantBills.map((b) => [b.id, b]));

  const autoPayPayments = overduePending.filter((p) => billsById.get(p.billId)?.isAutoPay);

  if (autoPayPayments.length === 0) {
    return allPayments;
  }

  await db.transaction(async (tx) => {
    for (const payment of autoPayPayments) {
      await tx.update(payments)
        .set({ status: "paid", paidDate: new Date() })
        .where(eq(payments.id, payment.id));
      await this.resetPayment(payment.id, tx);
    }
  });

  // Only re-query if something actually changed.
  return await db.select().from(payments).orderBy(desc(payments.dueDate));
}
```

Add `inArray` to the existing `drizzle-orm` import at the top of the file
(currently `import { eq, desc } from "drizzle-orm";` — change to
`import { eq, desc, inArray } from "drizzle-orm";`).

**Verify**: `pnpm check` → exit 0.

### Step 3: Manually verify the transaction and the no-duplicate-query behavior

With `pnpm dev` running and `DATABASE_URL` pointing at a reachable
Postgres instance:

1. Create a bill with `isAutoPay: true` and a `dueDay` in the past relative
   to today (e.g. via `POST /api/bills` with `curl`, or the UI's Add Bill
   dialog with Auto Pay toggled on and a due day earlier this month).
2. Confirm a pending payment exists for it with a past `dueDate` (check via
   `GET /api/payments` or the dashboard).
3. Issue two near-simultaneous requests:
   ```bash
   curl -s http://localhost:5000/api/payments > /dev/null &
   curl -s http://localhost:5000/api/payments > /dev/null &
   wait
   ```
4. `GET /api/payments` again and count payments for that bill — there
   should be exactly one `paid` payment (the original, now paid) and
   exactly one `pending` payment (the new next-cycle one) — not two of
   either.

**Verify**: exactly 2 payments exist for the test bill after Step 3 (1
paid, 1 pending) — not 3 or 4. If duplicates appear, the transaction is
not preventing the race; STOP and report rather than attempting a fix
beyond this plan's scope.

## Test plan

- No automated test framework exists in this repo. Verification is the
  manual concurrent-request check in Step 3 above, plus `pnpm check` for
  type safety.
- If a test harness is added later (see the audit's DX findings, not
  in scope for this plan), the ideal regression test here is: seed two
  overdue auto-pay payments, call `getPayments()` twice concurrently
  (e.g. via `Promise.all`), and assert the final payment count for each
  bill is exactly 2 (1 paid + 1 pending), not 3+.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -n "db.transaction" server/storage.ts` shows the auto-pay block wrapped in a transaction
- [ ] `grep -n "inArray(bills.id" server/storage.ts` confirms the batched bill lookup replaced the per-payment `SELECT`
- [ ] The manual concurrent-request check in Step 3 shows no duplicate payment rows
- [ ] `grep -c "orderBy(desc(payments.dueDate))" server/storage.ts` shows the query is only issued twice total in `getPayments()` (once for the initial read, once conditionally after a transaction — never unconditionally twice)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `plans/001-unify-due-date-calculation.md` has not been applied yet
  (`grep -n "getNextCycleDueDate" server/storage.ts` returns nothing) —
  apply that plan first.
- The `db.transaction` type signature doesn't accept the pattern shown in
  Step 1/2 after two reasonable attempts — this may mean the installed
  `drizzle-orm` version's transaction API differs from what's documented
  here; report the actual type error rather than casting to `any`.
- The manual concurrency test in Step 3 still produces duplicate rows
  after the transaction is in place — this would mean Postgres's default
  isolation level isn't sufficient and needs explicit tuning, which is
  beyond this plan's scope.
- No reachable `DATABASE_URL` is available to run Step 3 against — report
  this rather than skipping verification silently.

## Maintenance notes

- Auto-pay processing still runs as a side effect of a `GET` request,
  which is unusual REST design (reads shouldn't have side effects) even
  though it's now safe from the race/partial-failure bugs this plan fixes.
  A future improvement worth considering separately: move this to a
  scheduled job or an explicit `POST /api/payments/process-autopay`
  endpoint, so `GET /api/payments` is a pure read again. Not done here to
  keep this plan's blast radius small.
- `plans/005-atomic-mark-paid-endpoint.md` also adds a `db.transaction`
  call in `server/storage.ts` for a different flow (manual mark-paid +
  reset) — if both plans are executed, there's no code overlap, but a
  reviewer should confirm both transactions follow the same pattern
  established here.
- If bill/payment volume ever grows large enough that scanning all
  payments on every `GET /api/payments` becomes slow, revisit the
  "no index on `payments.dueDate`" audit finding — not selected for a plan
  this round.
