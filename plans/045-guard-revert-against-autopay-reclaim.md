# Plan 045: Prevent auto-pay from silently undoing a payment revert

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca471f5..HEAD -- server/storage.ts client/src/hooks/use-payments.ts client/src/pages/dashboard.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding;
> on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (data-correctness / silent failure)
- **Planned at**: commit `ca471f5`, 2026-09-04

## Why this matters

`GET /api/payments` runs `processAutoPay()` before returning data
(`server/routes.ts:77-81`) — on every single request, not just on a
schedule. `revertPayment` restores a payment's original due date and
flips it back to `"pending"`. For any bill with `isAutoPay: true`, that
combination — pending + due date in the past — is exactly what
`processAutoPay` treats as "an overdue auto-pay bill nobody's handled,
mark it paid" (`server/storage.ts`'s `processAutoPay`, `autoPayPayments =
overduePending.filter(p => billsById.get(p.billId)?.isAutoPay)`).

The result, confirmed live this session on the owner's real `Mint Mobile:
Erin`/`Mint Mobile: Travis` bills: click "Revert to Pending" → the
mutation succeeds, a "Reverted" toast appears → its own `onSuccess`
invalidates the payments cache → the resulting refetch's `GET
/api/payments` call runs `processAutoPay()` first → it immediately
reclaims the just-reverted payment, marking it paid again with today's
date and creating a fresh next-cycle row → by the time the UI re-renders,
the bill is paid again. This is deterministic, not a race: it happens
every time, for every auto-pay bill, because reverting an already-paid
bill's payment always produces exactly the "overdue auto-pay" state that
triggers reclaim. "Revert to Pending" is currently silently pointless for
any auto-pay bill.

There's also a smaller, related gap this plan closes along the way:
`useRevertPayment`'s `mutationFn` discards the server's actual error body
on failure (`throw new Error("Failed to revert payment")`, a hardcoded
generic string), and the hook has no `onError` handler at all — so any
revert failure today, for any reason, shows the user nothing. That's why
a guard added purely server-side wouldn't be enough on its own; the error
needs an actual path to the user.

## Current state

Relevant files:

- `server/storage.ts` — `revertPayment`, the function being guarded.
- `client/src/hooks/use-payments.ts` — `useRevertPayment`, which needs to
  surface the guard's error message instead of discarding it.
- `client/src/pages/dashboard.tsx` — the "Revert to Pending" button,
  which gets a disabled state + explanatory tooltip so users don't hit
  the guard blindly.

`server/storage.ts:187-221` (today — `revertPayment`, full function):

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

`server/routes.ts:129-136` (today — the route; **unchanged by this
plan**, already forwards any thrown `Error`'s `.message` in the response
body, which is what makes the client-side fix in Step 2 work):

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

`client/src/hooks/use-payments.ts:73-93` (today — `useRevertPayment`,
full function):

```ts
export function useRevertPayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (paymentId: number) => {
      const res = await fetch(buildUrl("/api/payments/:id/revert", { id: paymentId }), {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to revert payment");
      return (await res.json()) as Payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.payments.list.path] });
      toast({
        title: "Reverted",
        description: "Payment has been marked as pending again.",
      });
    },
  });
}
```

Repo convention to match for the error handling
(`client/src/hooks/use-bills.ts`'s `useCreateBill`, already in the
codebase):

```ts
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
```

`client/src/pages/dashboard.tsx:248-260` (today — the "Revert to
Pending" button; `item.bill.isAutoPay` is already read elsewhere in this
same file for the "Auto" badge, so this is an established, valid
accessor):

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

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exits 0 |
| Tests     | `pnpm test`   | all pass (this plan adds no test files; see "Test plan" below) |
| Dev server | `pnpm dev`   | boots without error; used for manual verification |

## Scope

**In scope**:
- `server/storage.ts` (only `revertPayment`)
- `client/src/hooks/use-payments.ts` (only `useRevertPayment`)
- `client/src/pages/dashboard.tsx` (only the "Revert to Pending" `<Button>`)

**Out of scope** (do NOT touch, even though related):
- `server/routes.ts`'s `POST /api/payments/:id/revert` route — already
  correctly forwards the thrown error's message; no change needed.
- `processAutoPay` — not modified. This plan prevents the *conflicting
  state* from being created in the first place (guarding `revertPayment`)
  rather than teaching `processAutoPay` to distinguish "genuinely
  forgotten" from "just reverted," which would require tracking intent
  it currently has no way to represent.
- `markPaidAndReset`, `resetPayment` — unrelated, not touched.
- Auto Pay's own toggle (`isAutoPay` field, the "Auto Pay" checkbox in
  Edit Bill) — not modified. The fix directs the user to turn it off
  themselves first if they need to revert an auto-pay bill's payment;
  this plan does not add any automatic toggling of that setting.
- Plan 042's "correct the paid amount" checkbox
  (`client/src/components/bill-form-fields.tsx`,
  `client/src/components/edit-bill-dialog.tsx`) — already the correct
  tool for "I made a data-entry mistake on an already-paid bill's
  amount" without touching status/due date at all, so it's unaffected by
  and doesn't overlap with this fix.

## Git workflow

- Branch: `advisor/045-guard-revert-against-autopay-reclaim`
- Commit per step or per logical unit. Message style: imperative,
  capitalized sentences, no conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Guard `revertPayment` against auto-pay bills

Change `server/storage.ts:187-193` (the start of `revertPayment`,
through the bill lookup) from:

```ts
  async revertPayment(id: number): Promise<Payment> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    if (!payment) throw new Error("Payment not found");

    const [bill] = await db.select().from(bills).where(eq(bills.id, payment.billId));
    if (!bill) throw new Error("Bill not found");

```

to:

```ts
  async revertPayment(id: number): Promise<Payment> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    if (!payment) throw new Error("Payment not found");

    const [bill] = await db.select().from(bills).where(eq(bills.id, payment.billId));
    if (!bill) throw new Error("Bill not found");

    if (bill.isAutoPay) {
      throw new Error("Can't revert an Auto Pay bill's payment — turn off Auto Pay for this bill first, or it will be marked paid again automatically.");
    }

```

The rest of the function (the next-cycle-payment lookup and deletion, the
status/paidDate update) is unchanged — this is a pure early-exit guard,
placed after the `bill` lookup (since it needs `bill.isAutoPay`) and
before any mutation, so a rejected revert leaves the payment completely
untouched.

**Verify**: `pnpm check` → exits 0.

### Step 2: Surface the guard's error message on the client

Change `client/src/hooks/use-payments.ts:73-93` (full function) from:

```ts
export function useRevertPayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (paymentId: number) => {
      const res = await fetch(buildUrl("/api/payments/:id/revert", { id: paymentId }), {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to revert payment");
      return (await res.json()) as Payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.payments.list.path] });
      toast({
        title: "Reverted",
        description: "Payment has been marked as pending again.",
      });
    },
  });
}
```

to:

```ts
export function useRevertPayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (paymentId: number) => {
      const res = await fetch(buildUrl("/api/payments/:id/revert", { id: paymentId }), {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to revert payment");
      }
      return (await res.json()) as Payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.payments.list.path] });
      toast({
        title: "Reverted",
        description: "Payment has been marked as pending again.",
      });
    },
    onError: (error) => {
      toast({
        title: "Couldn't revert payment",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
```

`mutationFn` now reads the actual JSON error body (matching the pattern
already used by `updatePaymentRequest`/`createPaymentRequest` in this
same file) instead of discarding it, and the new `onError` surfaces
whatever message comes back — Step 1's guard message specifically, but
also any other future/existing revert failure this hook previously
failed silently on.

**Verify**: `pnpm check` → exits 0.

### Step 3: Disable the button and explain why, for auto-pay bills

Change `client/src/pages/dashboard.tsx:248-260` from:

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

to:

```tsx
                    {item.status === "paid" && item.paymentId && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRevertPayment(item.paymentId!)}
                          disabled={revertPending || item.bill.isAutoPay}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground no-default-hover-elevate"
                          title={item.bill.isAutoPay ? "Turn off Auto Pay to revert this payment" : "Revert to Pending"}
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
```

This is a convenience/discoverability layer only — Step 1's server-side
guard is the actual enforcement and stays correct even if this button
were somehow bypassed (e.g. a direct API call).

**Verify**: `pnpm check` → exits 0. `grep -n "item.bill.isAutoPay" client/src/pages/dashboard.tsx` → at least 2 matches (the existing "Auto" badge usage, plus this new one).

## Test plan

No new automated tests — `revertPayment` hits the live DB with no test
harness available (same situation as plans 036, 040, 044). Verify
manually against a live `pnpm dev` + the owner's real Neon DB, using
throwaway test bills rather than the owner's real Mint Mobile records
(which were already disturbed once this session):

1. Create a test bill with `isAutoPay: true`, mark its first cycle paid.
   Confirm it shows "Paid".
2. Confirm the "Revert to Pending" button now renders disabled (greyed
   out) for this bill, with tooltip text "Turn off Auto Pay to revert
   this payment".
3. Directly `curl -X POST http://localhost:5050/api/payments/<id>/revert`
   on that bill's paid payment id anyway (bypassing the disabled client
   button, to test the server-side guard is the real enforcement).
   Confirm a 404 response with `{"message": "Can't revert an Auto Pay
   bill's payment — turn off Auto Pay for this bill first, or it will be
   marked paid again automatically."}`, and confirm via
   `curl http://localhost:5050/api/payments` that the payment's status
   and `paidDate` are completely unchanged — the guard rejected before
   any mutation.
4. Turn off Auto Pay on that test bill (Edit Bill dialog), then click
   "Revert to Pending" again through the actual UI. Confirm it now
   succeeds — "Reverted" toast, row flips to overdue/pending, and stays
   that way after the resulting refetch (no auto-reclaim, since
   `isAutoPay` is now false).
5. Create a second, separate test bill with `isAutoPay: false`, mark it
   paid, revert it. Confirm this still works exactly as it already did
   before this plan (regression check for the working, non-autopay
   path) — status flips, stays reverted, no error toast.
6. Delete both test bills afterward to leave the DB clean.
7. Confirm `Mint Mobile: Travis`/`Mint Mobile: Erin` (the owner's real
   bills, already disturbed once this session by testing this exact bug)
   are untouched by this plan's verification — no further action taken
   on them.

**Verify**: all 7 observations above hold as described.

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (unchanged pass count — this plan adds no test files)
- [ ] `grep -n "bill.isAutoPay" server/storage.ts` → present inside `revertPayment`
- [ ] `grep -n "onError" client/src/hooks/use-payments.ts` → present inside `useRevertPayment`
- [ ] `grep -n "item.bill.isAutoPay" client/src/pages/dashboard.tsx` → at least 2 matches
- [ ] No files outside the 3 in-scope files modified (`git status`)
- [ ] All 7 manual observations confirmed live
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt above doesn't match the live code at that
  location (drift since this plan was written).
- `pnpm check` reports new errors you can't resolve in one reasonable fix
  attempt.
- The server's error response shape for a rejected revert doesn't
  actually include a `message` field readable by the client's new
  `error.json()` parse (e.g. if the route ever returns a non-JSON body on
  error) — re-verify `server/routes.ts:129-136` matches the excerpt in
  "Current state" before assuming Step 2 will work as written.

## Maintenance notes

- If a future plan wants to let a user revert an auto-pay bill's payment
  *without* manually toggling Auto Pay off first, the right place to add
  that convenience is a confirmation dialog client-side ("This bill has
  Auto Pay on — reverting will turn it off for you, is that okay?") that
  bundles an `updateBill` call (`isAutoPay: false`) with the revert — not
  weakening or removing this plan's server-side guard, which should stay
  as the correctness backstop regardless of what client conveniences get
  layered on top.
- This plan does not address whether `processAutoPay` re-claiming a
  payment the instant it's overdue (with no grace period at all) is the
  right general behavior — that's a separate, broader question about
  auto-pay's own design, out of scope here.
