# Plan 048: Make the auto-pay revert block discoverable at click time, not hover time

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a59c890..HEAD -- client/src/pages/dashboard.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (loosens a client-side convenience gate; the actual
  enforcement — the server-side guard from plan 045 — is untouched)
- **Depends on**: plan 045 (the server guard and the `onError` toast this
  plan relies on both already exist and are unmodified)
- **Category**: bug (UX / discoverability)
- **Planned at**: commit `a59c890`, 2026-09-04

## Why this matters

Plan 045 correctly guards `revertPayment` against auto-pay bills
server-side, and disables the "Revert to Pending" button client-side with
an explanatory `title` tooltip. In practice, the owner hit exactly the
failure mode a hover-only signal is bad at: mid-troubleshooting, actively
toggling a bill's Auto Pay checkbox back and forth in a separate dialog,
they lost track of which state the bill was actually saved in, saw a
grayed-out icon, and had no way to find out *why* without deliberately
hovering it — which they didn't think to do, because nothing prompted
them to. The information needed ("this bill has Auto Pay on, turn it off
first") already exists and is already correct — it's just invisible until
you go looking for it in exactly the right way.

The fix: stop disabling the button client-side. Let every click attempt
the revert. The server-side guard (plan 045, unmodified) still rejects it
for auto-pay bills, and `useRevertPayment`'s `onError` handler (also
plan 045, unmodified) already shows a toast with the *exact* guard
message — that path already exists and already works, it's just
currently unreachable because the button is disabled before a click can
ever trigger it. Removing the client-side gate turns a passive, easy-to-
miss signal into an immediate, impossible-to-miss one, using
infrastructure that's already built and already correct.

## Current state

Relevant file: `client/src/pages/dashboard.tsx` — only the "Revert to
Pending" button's `disabled`/`title` props change. No other file needs
touching: `server/storage.ts`'s guard and
`client/src/hooks/use-payments.ts`'s `onError` toast (both from plan 045)
are already correct and already wired — this plan is purely about
removing a client-side gate that's currently preventing them from ever
being exercised for this case.

`client/src/pages/dashboard.tsx:252-265` (today — the button):

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

`client/src/hooks/use-payments.ts`'s `useRevertPayment` (from plan 045,
**unchanged by this plan** — shown so the executor can confirm the error
path this plan relies on is already in place, not something to add):

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

`server/storage.ts`'s `revertPayment` guard (from plan 045, **unchanged
by this plan**):

```ts
    if (bill.isAutoPay) {
      throw new Error("Can't revert an Auto Pay bill's payment — turn off Auto Pay for this bill first, or it will be marked paid again automatically.");
    }
```

For reference, the existing, persistent (non-hover) signal that a bill
has Auto Pay on — already present and unaffected by this plan
(`dashboard.tsx:190-193`):

```tsx
                    {item.bill.isAutoPay && (
                      <Badge variant="outline" className="h-5 text-[10px] bg-primary/5 text-primary border-primary/20">
                        Auto
                      </Badge>
                    )}
```

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
- `server/storage.ts`'s `revertPayment` guard — stays exactly as-is. It's
  the real, authoritative enforcement; this plan only changes whether the
  client tries to pre-empt it.
- `client/src/hooks/use-payments.ts`'s `useRevertPayment` — already
  correct (reads the real error message, has an `onError` toast); no
  change needed, this plan relies on it working exactly as it already
  does.
- The "Auto" badge (`dashboard.tsx:190-193`) — stays as the persistent
  visual signal that a bill has Auto Pay on; not duplicated onto the
  Revert button.
- A "turn off Auto Pay and retry" one-click action bundled into the error
  toast — a reasonable future enhancement (see Maintenance notes), not
  attempted here; this plan is scoped to making the *existing* error
  message reachable, not adding a new recovery action.
- `revertPending` — stays as the sole remaining `disabled` condition
  (prevents double-submitting while a revert request is in flight);
  unrelated to the auto-pay gate this plan removes.

## Git workflow

- Branch: `advisor/048-clickable-revert-with-error-toast`
- Commit message style: imperative, capitalized sentence, no
  conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Stop disabling the button for auto-pay bills; let the click surface the real error

Change `client/src/pages/dashboard.tsx:252-265` from:

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

to:

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

The button now always looks and behaves like a normal action for every
paid bill. Clicking it on a non-auto-pay bill works exactly as before
(unaffected). Clicking it on an auto-pay bill sends the same request as
always, gets rejected by the unmodified server guard, and — because
`useRevertPayment`'s `onError` already exists and already reads the real
message — immediately shows a destructive toast: "Couldn't revert
payment / Can't revert an Auto Pay bill's payment — turn off Auto Pay for
this bill first, or it will be marked paid again automatically." No other
code changes are needed to make that happen; it was already fully wired,
just unreachable.

**Verify**: `pnpm check` → exits 0. `grep -n "item.bill.isAutoPay" client/src/pages/dashboard.tsx` → exactly 1 match remaining (the "Auto" badge condition at line ~190) — confirms the button's own reference to it is fully removed, not shadowed.

## Test plan

No new automated tests — this is a UI-affordance change with no React
rendering harness in this repo, same as every prior plan touching this
button. Verify manually against a live `pnpm dev` + the owner's real Neon
DB:

1. Find a currently-paid, auto-pay bill (e.g. `Mint Mobile: Travis`/
   `Mint Mobile: Erin`, or the owner's `USI: Internet` once its Auto Pay
   is back on, if it is). Confirm the "Revert to Pending" icon now
   renders as a normal, non-grayed button — same visual weight as it has
   on a non-auto-pay paid bill.
2. Click it. Confirm a destructive toast appears immediately: "Couldn't
   revert payment" with the description "Can't revert an Auto Pay bill's
   payment — turn off Auto Pay for this bill first, or it will be marked
   paid again automatically." Confirm the row is completely unchanged
   after this — still "Paid"/showing the same info as before the click
   (the server guard rejected before any mutation, matching plan 045's
   own verification).
3. Turn off Auto Pay on that same bill (Edit Bill dialog), then click
   "Revert to Pending" again. Confirm it now succeeds — "Reverted" toast,
   row flips to pending/overdue as appropriate — exactly as it already
   did before this plan for non-auto-pay bills.
4. Confirm a currently-paid, non-auto-pay bill (e.g. `RCU: Mortgage`) is
   completely unaffected by this plan — Revert still works exactly as it
   did before.
5. Confirm the "Auto" badge next to the bill name is unaffected and still
   the persistent visual signal that a bill has Auto Pay on, independent
   of anything this plan changed.

**Verify**: all 5 observations above hold as described.

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (unchanged pass count — this plan adds no test files)
- [ ] `grep -n "item.bill.isAutoPay" client/src/pages/dashboard.tsx` → exactly 1 match (the "Auto" badge, unrelated to this plan)
- [ ] `grep -n 'disabled={revertPending}' client/src/pages/dashboard.tsx` → 1 match, on the Revert to Pending button
- [ ] No files outside `client/src/pages/dashboard.tsx` modified (`git status`)
- [ ] All 5 manual observations confirmed live
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpt above doesn't match the live code (drift
  since this plan was written).
- `useRevertPayment`'s `onError` handler is missing or doesn't read the
  real server error message when you check it — this plan assumes it's
  already correct from plan 045; if it's regressed, that's a bigger
  problem than this plan's scope, report rather than silently re-fixing
  it here.
- `pnpm check` reports new errors you can't resolve in one reasonable fix
  attempt.

## Maintenance notes

- A reasonable future enhancement: give the error toast an inline action
  button ("Turn off Auto Pay & retry") that bundles an `updateBill`
  call (`isAutoPay: false`) with a follow-up revert, so the user doesn't
  need to separately open Edit Bill. Deliberately not attempted here —
  this plan's scope is "make the existing explanation reachable," not
  "add a new one-click recovery flow."
- If a future plan wants a *persistent* (non-toast, non-hover) indicator
  that a specific paid row can't be reverted without turning off Auto
  Pay first, the "Auto" badge already on the row (`dashboard.tsx:190-193`)
  is arguably sufficient signal once a viewer knows the rule — this plan
  bets that a clear error at the moment of the actual attempt is more
  effective than another passive badge, based directly on what the owner
  hit in practice.
