# Plan 005: Make "mark paid + reset cycle" a single atomic server operation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- client/src/components/mark-paid-dialog.tsx server/routes.ts server/storage.ts`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding;
> on a mismatch, treat it as a STOP condition.
>
> **Depends on `plans/002-atomic-autopay-rollover.md`**: that plan adds an
> optional transaction-handle parameter to `resetPayment()`
> (`resetPayment(id, executor = db)`). This plan reuses that same pattern.
> Confirm it's applied first via `grep -n "executor: typeof db" server/storage.ts`.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/002-atomic-autopay-rollover.md
- **Category**: bug
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

The "Mark as Paid" dialog's submit handler performs **two sequential HTTP
requests** when "Reset for next cycle" is checked (the default): first a
`PUT`/`POST` to record the payment as paid, then a separate `POST .../reset`.
If the first request succeeds but the second fails (network blip, server
restart, validation edge case), the server now has the bill correctly
marked paid but **no next-cycle payment was created** — yet the client's
catch block only knows "something in this multi-step flow failed" and
shows a generic "Failed to record payment" toast. The user has no reason
to suspect the payment itself actually went through, so the bill silently
stops being tracked going forward until they notice by other means. This
plan collapses the two-request flow into one atomic server operation.

## Current state

`client/src/components/mark-paid-dialog.tsx:72-119` — `handleSubmit`,
performing up to 2 sequential requests with no atomicity between them:

```ts
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!amount || !paidDate) return;

  setIsPending(true);
  const previousPayments = queryClient.getQueryData<Payment[]>(["/api/payments"]);

  if (paymentId && previousPayments) {
    queryClient.setQueryData<Payment[]>(["/api/payments"], (old) =>
      old?.map((p) =>
        p.id === paymentId
          ? { ...p, status: "paid" as const, paidDate: new Date(paidDate).toISOString() }
          : p
      ) ?? []
    );
  }

  try {
    let savedPaymentId: number;

    if (paymentId) {
      await apiRequest("PUT", `/api/payments/${paymentId}`, {
        amount,
        paidDate: new Date(paidDate),
        status: "paid",
        notes: "",
      });
      savedPaymentId = paymentId;
    } else {
      const res = await apiRequest("POST", "/api/payments", {
        billId: bill.id,
        amount,
        dueDate,
        paidDate: new Date(paidDate),
        status: "paid",
        notes: "",
      });
      const created = await res.json();
      savedPaymentId = created.id;
    }

    // Optionally reset for next cycle
    if (resetCycle) {
      await apiRequest("POST", `/api/payments/${savedPaymentId}/reset`);
    }

    queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    toast({
      title: "Payment Recorded",
      description: resetCycle
        ? "Bill marked as paid and reset for next cycle."
        : "The bill has been marked as paid.",
    });
    closeDialog();
  } catch {
    if (previousPayments) {
      queryClient.setQueryData(["/api/payments"], previousPayments);
    }
    toast({ title: "Error", description: "Failed to record payment", variant: "destructive" });
  } finally {
    setIsPending(false);
  }
};
```

Note the two branches: `paymentId` present means an existing pending
payment is being updated to paid (`PUT /api/payments/:id`); `paymentId`
absent means a brand-new payment record is created (`POST /api/payments`)
— this happens for bills with no payment row yet. Both branches then
optionally call `POST /api/payments/:id/reset`.

`server/routes.ts:118-125` — the existing `/reset` endpoint (unchanged by
this plan, still used standalone by the "Next Cycle" button on the
dashboard — see `client/src/pages/dashboard.tsx:67-78`'s `resetMutation`):
```ts
app.post("/api/payments/:id/reset", async (req, res) => {
  try {
    const payment = await storage.resetPayment(Number(req.params.id));
    res.json(payment);
  } catch (err) {
    res.status(404).json({ message: err instanceof Error ? err.message : "Unknown error" });
  }
});
```

`server/storage.ts` (after `plans/002-atomic-autopay-rollover.md` is
applied) — `resetPayment` accepts an optional transaction executor:
```ts
async resetPayment(id: number, executor: typeof db = db): Promise<Payment> {
  // ...
}
```

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

No automated test runner exists. Verification uses `curl` and manual UI
testing against the running dev server.

## Scope

**In scope**:
- `server/storage.ts` — add one new method, `markPaidAndReset`.
- `server/routes.ts` — add one new route, `POST /api/payments/:id/mark-paid-and-reset` (for the existing-payment branch) — see Step 2 for why the create-new-payment branch is handled differently.
- `client/src/components/mark-paid-dialog.tsx` — `handleSubmit` only.

**Out of scope**:
- The standalone "Next Cycle" button on the dashboard
  (`client/src/pages/dashboard.tsx:67-78`, `resetMutation`) — it already
  calls `/reset` as a single, non-composed action; not affected by this
  plan.
- `shared/routes.ts` contract additions for this new endpoint — tracked
  separately under the tech-debt finding about contract drift; this plan
  adds the endpoint directly in `server/routes.ts` following the same
  ungoverned pattern already used by `/reset` and `/revert`, to avoid
  scope creep into the contract-migration work.

## Git workflow

- Branch: `advisor/005-atomic-mark-paid-endpoint`
- Commit per step; message style matches repo history. Suggested message:
  `Make mark-paid-and-reset a single atomic server operation`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `markPaidAndReset` to the storage layer

In `server/storage.ts`, add a new method to `IStorage` and
`DatabaseStorage` (place it near `resetPayment`/`revertPayment`):

```ts
// In the IStorage interface:
markPaidAndReset(id: number, updates: { amount: string; paidDate: Date }): Promise<{ paid: Payment; next: Payment }>;

// In DatabaseStorage:
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

This only covers the "existing payment being updated to paid" branch
(`paymentId` present in the dialog). The "brand-new payment" branch
(`paymentId` absent) is handled in Step 3 by creating the payment first,
then calling this same atomic method — see that step for why a single
combined "create + mark paid + reset" method isn't necessary.

**Verify**: `pnpm check` → exit 0.

### Step 2: Add the route

In `server/routes.ts`, add a new route near the existing `/reset` and
`/revert` routes (after line 134):

```ts
app.post("/api/payments/:id/mark-paid-and-reset", async (req, res) => {
  try {
    const input = z.object({
      amount: z.string(),
      paidDate: z.coerce.date(),
    }).parse(req.body);
    const result = await storage.markPaidAndReset(Number(req.params.id), input);
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors[0].message });
    }
    if (err instanceof Error && err.message === "Payment not found") {
      return res.status(404).json({ message: err.message });
    }
    throw err;
  }
});
```

**Verify**: `pnpm check` → exit 0.

### Step 3: Update the client to call one endpoint instead of two sequential ones

In `client/src/components/mark-paid-dialog.tsx`, replace the body of
`handleSubmit`'s `try` block (lines 72-110, keeping the optimistic-update
snapshot/rollback structure around it unchanged):

```ts
try {
  let savedPaymentId: number;

  if (!paymentId) {
    // No existing payment record — create it first (unavoidable second
    // request, since there's no id yet to mark-paid-and-reset against).
    const res = await apiRequest("POST", "/api/payments", {
      billId: bill.id,
      amount,
      dueDate,
      paidDate: new Date(paidDate),
      status: "paid",
      notes: "",
    });
    const created = await res.json();
    savedPaymentId = created.id;

    if (resetCycle) {
      await apiRequest("POST", `/api/payments/${savedPaymentId}/reset`);
    }
  } else {
    // Existing pending payment — mark paid and (optionally) reset in one
    // atomic server-side transaction.
    savedPaymentId = paymentId;
    if (resetCycle) {
      await apiRequest("POST", `/api/payments/${savedPaymentId}/mark-paid-and-reset`, {
        amount,
        paidDate: new Date(paidDate),
      });
    } else {
      await apiRequest("PUT", `/api/payments/${savedPaymentId}`, {
        amount,
        paidDate: new Date(paidDate),
        status: "paid",
        notes: "",
      });
    }
  }

  queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
  toast({
    title: "Payment Recorded",
    description: resetCycle
      ? "Bill marked as paid and reset for next cycle."
      : "The bill has been marked as paid.",
  });
  closeDialog();
} catch {
  if (previousPayments) {
    queryClient.setQueryData(["/api/payments"], previousPayments);
  }
  toast({ title: "Error", description: "Failed to record payment", variant: "destructive" });
} finally {
  setIsPending(false);
}
```

Note: the `paymentId`-absent branch still makes 2 requests (create, then
reset) because the payment doesn't exist yet to atomically mark-paid — this
is an acceptable, smaller residual risk window (create-then-reset, not
update-then-reset) that this plan does not attempt to close further, since
doing so would require a combined create-and-reset endpoint outside this
plan's scope. The `paymentId`-present branch (the common case — marking an
already-pending payment as paid) is now fully atomic.

**Verify**: `pnpm check` → exit 0.

### Step 4: Manually verify both branches

With `pnpm dev` running:

1. **Existing-payment branch**: on the dashboard, click "Mark Paid" on a
   bill that already has a pending payment row, with "Reset for next
   cycle" checked, submit. Confirm via `GET /api/payments` the bill now
   has exactly 2 rows (paid + pending-next-cycle) in one visible state
   change — open the Network tab and confirm only **one** POST request
   fires (`/mark-paid-and-reset`), not two sequential ones.
2. **New-payment branch**: mark paid a bill with no existing payment row
   (if none available, use a freshly-created bill). Confirm it still
   works and produces the same 2-row end state (this branch still issues
   2 requests — confirm both succeed, not that it's atomic).

**Verify**: Step 4.1 shows exactly one `/mark-paid-and-reset` network
request producing both the paid and next-cycle rows; Step 4.2 completes
successfully with the expected 2-row end state.

## Test plan

- No automated test framework exists. Verification is the manual UI flows
  in Step 4, which cover both branches (existing payment vs. new payment)
  of the dialog's submit logic.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -n "markPaidAndReset" server/storage.ts server/routes.ts client/src/components/mark-paid-dialog.tsx` shows all three files reference it
- [ ] Manual Step 4.1 shows a single atomic request for the existing-payment branch
- [ ] Manual Step 4.2 confirms the new-payment branch still works end-to-end
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `plans/002-atomic-autopay-rollover.md` hasn't been applied yet
  (`resetPayment` doesn't accept an `executor` parameter) — apply it
  first, since this plan's transaction reuses that signature.
- The code at "Current state" doesn't match what you find.
- The transaction in `markPaidAndReset` fails to typecheck against the
  `resetPayment(id, tx)` call — report the actual TypeScript error rather
  than casting to `any`.

## Maintenance notes

- The `paymentId`-absent branch (brand-new payment) is intentionally left
  as 2 sequential requests rather than a combined create-and-reset
  endpoint. If this residual gap matters in practice, a future plan could
  add a `createPaymentAndReset` storage method mirroring this one's
  transaction pattern.
- This endpoint (`/api/payments/:id/mark-paid-and-reset`) is added
  directly in `server/routes.ts` without a `shared/routes.ts` contract
  entry, matching the existing (already inconsistent) pattern used by
  `/reset` and `/revert`. A reviewer should be aware this repo has a
  known, separately-tracked issue where `shared/routes.ts` doesn't cover
  all real endpoints — not something this plan attempts to fix.
