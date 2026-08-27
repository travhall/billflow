# Plan 035: Restore per-request auto-pay rollover

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e1609da..HEAD -- server/storage.ts server/routes.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (correctness — money/date)
- **Planned at**: commit `e1609da`, 2026-08-27

## Why this matters

Auto-pay rollover — marking an auto-pay bill's overdue payment as paid and
creating its next-cycle payment — currently only runs **once, at server
startup** (`await storage.processAutoPay()` in `registerRoutes`). It used
to run on every `GET /api/payments` request, inside `getPayments()` itself,
before a refactor (commit `598fe81`, "Refactor payment handling... and
implement auto-pay processing") split `processAutoPay()` out as its own
named method and wired it to the server-boot path instead — without adding
back any trigger for it to run again after that first boot.

The practical effect: on any server process that stays up longer than one
boot (local `pnpm dev` left running, or a Render instance above the free
tier that doesn't sleep/restart), an auto-pay bill's payment that goes
overdue after that first boot never gets marked paid or rolled to its next
cycle. It just sits "Overdue" — the dashboard's status computation is
purely client-side (`payment.dueDate < today` and `payment.status`, see
`client/src/pages/dashboard.tsx`'s `isBefore(...)` checks), so this is
directly user-visible: the overdue banner fires for a bill the user
correctly expects to auto-resolve itself, and no next-cycle payment ever
appears in Upcoming/Dashboard for that bill. On Render's free tier this is
partially masked by the ~15-minute-idle sleep/wake cycle re-running
`registerRoutes` on every cold start, which is likely why it hasn't been
noticed yet — but it's broken for the common case of an actively-used
session or a non-free-tier deployment.

The fix is small: re-add the call to `processAutoPay()` inside
`getPayments()`'s request path, restoring the original per-request cadence.
This is not new, unproven code — `processAutoPay()`'s transaction already
handles concurrent-request safety (`ne(payments.status, "paid")` guard on
the claiming `UPDATE`, skipping already-claimed rows), which is exactly
the protection plan 002 built for this exact "runs on every GET" design.
The boot-time call stays too — it's harmless and catches the case of a
fresh boot before the first request arrives.

## Current state

`server/routes.ts`, the payments GET handler and the boot sequence,
[server/routes.ts:26-31](server/routes.ts:26) and [server/routes.ts:76-80](server/routes.ts:76):

```typescript
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedData();
  await storage.processAutoPay();

  // Bills
  app.get(api.bills.list.path, async (req, res) => {
```

```typescript
  // Payments
  app.get(api.payments.list.path, async (req, res) => {
    const payments = await storage.getPayments();
    res.json(payments);
  });
```

`server/storage.ts`, `getPayments()` and `processAutoPay()` as they exist
today, [server/storage.ts:88-124](server/storage.ts:88):

```typescript
  async getPayments(): Promise<Payment[]> {
    return await db.select().from(payments).orderBy(desc(payments.dueDate));
  }

  async processAutoPay(): Promise<void> {
    const allPayments = await db.select().from(payments);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overduePending = allPayments.filter(
      (p) => p.status !== "paid" && new Date(p.dueDate) < today
    );

    if (overduePending.length === 0) return;

    // Batch-fetch the bills for every overdue payment in one query instead
    // of one query per payment.
    const billIds = Array.from(new Set(overduePending.map((p) => p.billId)));
    const relevantBills = await db.select().from(bills).where(inArray(bills.id, billIds));
    const billsById = new Map(relevantBills.map((b) => [b.id, b]));

    const autoPayPayments = overduePending.filter((p) => billsById.get(p.billId)?.isAutoPay);

    if (autoPayPayments.length === 0) return;

    await db.transaction(async (tx) => {
      for (const payment of autoPayPayments) {
        const updated = await tx.update(payments)
          .set({ status: "paid", paidDate: new Date() })
          .where(and(eq(payments.id, payment.id), ne(payments.status, "paid")))
          .returning();
        if (updated.length === 0) continue; // another concurrent request already claimed it
        await this.resetPayment(payment.id, tx);
      }
    });
  }
```

Note `processAutoPay()` itself needs **no changes** — it's correct and
already concurrency-safe. This plan only restores its caller.

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0, no output |
| Dev server | `pnpm dev`  | starts on port 5000 (or `$PORT`) |

## Scope

**In scope** (the only file you should modify):
- `server/routes.ts` — only the `GET /api/payments` handler.

**Out of scope** (do NOT touch, even though they look related):
- `server/storage.ts`'s `processAutoPay()` or `getPayments()` — both are
  correct as-is; do not change their internals or signatures.
- The boot-time `await storage.processAutoPay();` call in `registerRoutes`
  ([server/routes.ts:31](server/routes.ts:31)) — keep it, it's harmless and still useful
  (catches the pre-first-request window right after a fresh boot).
- Any other route handler — this is the only place auto-pay rollover needs
  to be re-triggered from; other endpoints (mark-paid, reset, revert, bill
  create/update/delete) don't need it.

## Git workflow

- Branch: `advisor/035-restore-per-request-autopay-rollover`
- Commit message style: imperative, capitalized sentence (e.g. "Restore
  per-request auto-pay rollover trigger"), no conventional-commit prefix —
  matches this repo's existing log.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Call `processAutoPay()` before `getPayments()` in the GET handler

In `server/routes.ts`, change the `GET /api/payments` handler from:

```typescript
  app.get(api.payments.list.path, async (req, res) => {
    const payments = await storage.getPayments();
    res.json(payments);
  });
```

to:

```typescript
  app.get(api.payments.list.path, async (req, res) => {
    await storage.processAutoPay();
    const payments = await storage.getPayments();
    res.json(payments);
  });
```

**Verify**: `pnpm check` → exit 0, no new errors.

### Step 2: Confirm the rollover actually re-fires on a live request, not just at boot

This needs a live dev DB with at least one auto-pay bill whose payment can
be made overdue. Against a running `pnpm dev`:

1. Note (or create via the UI) a bill with "Auto" enabled, and find its
   current pending payment's `id` and `dueDate` via `GET /api/payments`
   (e.g. `curl -s http://localhost:5000/api/payments | jq '.[] | select(.status != "paid")'` —
   adjust the port if `$PORT` differs).
2. Directly update that payment's `dueDate` in the database to yesterday,
   status still `pending` (e.g. via a one-off `UPDATE payments SET
   due_date = now() - interval '1 day' WHERE id = <id>;` against the same
   `DATABASE_URL` the dev server is using — this simulates "time passed
   without a server restart," which is exactly the scenario this plan
   fixes; do this on the real dev DB, not a throwaway, and note the
   original `due_date` so you can restore it if this step is abandoned
   partway).
3. Without restarting the dev server, hit `GET /api/payments` again (a
   simple page reload/refetch, or the same `curl`) and confirm: that
   payment's `status` is now `paid`, and a new next-cycle payment exists
   for the same bill with the next due date.
4. This is the core proof the fix works — before this plan, the same
   sequence would leave the payment `pending`/overdue indefinitely since
   nothing but a server restart re-triggers rollover.

**Verify**: step 3's two outcomes (existing payment flips to `paid`, new
next-cycle payment appears) both hold, confirming rollover now fires on a
live request without requiring a server restart.

## Test plan

No automated test exists for this path (`processAutoPay` itself has no
unit test — the existing Vitest suite only covers `shared/date-utils.ts`
per `plans/019`). Verification is the manual live-request check in Step 2,
which is the only way to prove the actual regression (a *timing* issue —
"does it fire without a restart," not something a type-checker or a
snapshot test of the function in isolation can catch).

## Done criteria

- [ ] `pnpm check` exits 0, no new errors
- [ ] `grep -n "processAutoPay" server/routes.ts` shows 2 call sites (the existing boot-time one, plus the new one inside the `GET /api/payments` handler)
- [ ] Manual Step 2 confirms rollover fires on a live request without a server restart
- [ ] No files outside `server/routes.ts` are modified (`git status`)
- [ ] `plans/README.md` status row for 035 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at either "Current state" excerpt doesn't match what's actually
  in the file (drift since this plan was written).
- Step 2's manual verification shows the payment does NOT flip to paid on
  the live request — that would mean `processAutoPay()`'s own logic has a
  separate bug beyond the missing-caller issue this plan targets; report
  the exact behavior observed rather than modifying `processAutoPay()`
  yourself (out of scope for this plan).

## Maintenance notes

- This restores a GET-with-side-effects pattern (a data mutation inside a
  request that's nominally a read). That's a known, already-accepted
  tradeoff in this codebase — it's exactly what plan 002 originally built
  concurrency-safety for — not a new problem introduced by this plan.
- If a future refactor wants to move rollover triggering to something
  cleaner (a scheduled job, an interval timer, a cron), that's a larger,
  separate architectural change with its own tradeoffs (timing precision
  vs. added complexity) — worth its own plan, not bundled into this
  regression fix.
