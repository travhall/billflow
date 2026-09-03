# Plan 042: Let editing a bill also correct its already-paid current-cycle amount

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2a8dde5..HEAD -- client/src/components/edit-bill-dialog.tsx client/src/components/bill-form-fields.tsx client/src/components/create-bill-dialog.tsx client/src/pages/dashboard.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding;
> on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the bill-edit save flow and a real payment record;
  scoped tightly and opt-in by default to keep the blast radius small)
- **Depends on**: plan 040 (merged — its `getBillCycleStatus` is what makes
  `item.paymentId`/`item.amount` for a `"paid"` row reliably mean "the
  payment actually paid for the current cycle," which this plan's checkbox
  visibility and payload both depend on)
- **Category**: direction (small feature — data-correction affordance)
- **Planned at**: commit `2a8dde5`, 2026-09-03

## Why this matters

The owner hit a real gap discussed at length in conversation: they created
`Mint Mobile: Erin` with `defaultAmount: "360.00"` as a placeholder, that
placeholder amount got paid for the current cycle, and they later learned
the real amount is `388.99`. Opening Edit Bill and changing the default
amount only affects *future, not-yet-paid* cycles — by design, per
`server/storage.ts`'s `updateBill` cascade (`ne(payments.status, "paid")`,
lines 64-66), which exists to protect variable bills: a bill whose real
charge legitimately differs month to month shouldn't have an old
already-paid amount silently overwritten just because someone edited an
unrelated future estimate.

But that protection doesn't fit this case. Mint Mobile is fixed-rate —
`360.00` wasn't "what actually happened that later differed from the
template," it was a wrong number that propagated into the paid record
too. The owner isn't trying to rewrite history; they're correcting a
mistake. Investigation confirmed the backend already supports this:
`PUT /api/payments/:id` (`server/routes.ts` → `storage.updatePayment`)
has no paid-status guard at all — it's just never been exposed anywhere
in the UI as a standalone action. This plan adds that missing, narrowly-
scoped affordance directly into the Edit Bill dialog the owner is already
using, rather than a separate new screen.

## Current state

Relevant files:

- `client/src/components/edit-bill-dialog.tsx` — the dialog being
  extended; currently only calls `useUpdateBill`.
- `client/src/components/bill-form-fields.tsx` — shared form-field layout
  used by **both** `EditBillDialog` and `CreateBillDialog`. The new
  correction control must be edit-only — added here behind a new optional
  prop so `CreateBillDialog` (which never passes it) renders nothing
  different.
- `client/src/components/create-bill-dialog.tsx` — confirmed via
  `grep -n "BillFormFields" client/src/components/create-bill-dialog.tsx`
  to call `<BillFormFields form={form} notifPermission={...}
  onNotifPermissionChange={...} />` with no other props — this plan does
  not modify this file's behavior, only confirms (in Scope/STOP) that it
  stays that way.
- `client/src/pages/dashboard.tsx` — the one call site of
  `<EditBillDialog>`, inside `BillTable`'s row map, where `item:
  BillStatusItem` already carries exactly the data this plan needs
  (`item.status`, `item.paymentId`, `item.amount`, `item.dueDate` — all
  produced by `getBillCycleStatus`, plan 040). No new data-fetching is
  needed anywhere in this plan.
- `client/src/hooks/use-payments.ts` — already exports
  `updatePaymentRequest(id, data)`, the exact function this plan reuses
  to correct the payment. No server or hook changes needed.
- `shared/routes.ts:70-78` — confirms `api.payments.update.input =
  insertPaymentSchema.partial()`, so `{ amount: "388.99" }` alone is a
  valid, already-supported payload for `PUT /api/payments/:id`.

`client/src/pages/dashboard.tsx:45-51` (the type carrying the data this
plan's dashboard.tsx edit reads — unchanged by this plan):

```ts
type BillStatusItem = {
  bill: Bill;
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
};
```

`client/src/pages/dashboard.tsx:243` (today — the one call site this plan
changes):

```tsx
                    <EditBillDialog bill={item.bill} />
```

`client/src/components/edit-bill-dialog.tsx` (today, full file — see
"Current state" note above; the whole file is short enough to show in
full since Step 2 rewrites most of it):

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBillSchema, type Bill } from "@shared/schema";
import { useUpdateBill } from "@/hooks/use-bills";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { getNotificationPermission } from "@/lib/notifications";
import { BillFormFields } from "@/components/bill-form-fields";

interface EditBillDialogProps {
  bill: Bill;
  trigger?: React.ReactNode;
}

export function EditBillDialog({ bill, trigger }: EditBillDialogProps) {
  const [open, setOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
  const updateBill = useUpdateBill();

  const form = useForm({
    resolver: zodResolver(insertBillSchema),
    defaultValues: {
      name: bill.name,
      category: bill.category,
      defaultAmount: bill.defaultAmount,
      isVariable: bill.isVariable,
      frequency: bill.frequency,
      dueDay: bill.dueDay,
      dueMonth: bill.dueMonth,
      isAutoPay: bill.isAutoPay,
      archived: bill.archived,
      reminderDays: bill.reminderDays ?? null,
    },
  });

  const onSubmit = (data: any) => {
    updateBill.mutate(
      { id: bill.id, data },
      { onSuccess: () => setOpen(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Bill</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <BillFormFields form={form} notifPermission={notifPermission} onNotifPermissionChange={setNotifPermission} />

            <Button type="submit" className="w-full" disabled={updateBill.isPending}>
              {updateBill.isPending ? "Updating..." : "Update Bill"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

`client/src/components/bill-form-fields.tsx:1-19,50-57` (today — imports
and the Default Amount field this plan's new checkbox goes directly
after; the rest of the file, shown earlier in this session's
investigation, is unchanged):

```tsx
import type { UseFormReturn } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { requestNotificationPermission, type NotificationPermission } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";

interface BillFormFieldsProps {
  form: UseFormReturn<any>;
  notifPermission: NotificationPermission;
  onNotifPermissionChange: (p: NotificationPermission) => void;
}

export function BillFormFields({ form, notifPermission, onNotifPermissionChange }: BillFormFieldsProps) {
  const frequency = form.watch("frequency");
  const { toast } = useToast();
  ...
        <FormField control={form.control} name="defaultAmount" render={({ field }) => (
          <FormItem>
            <FormLabel>Default Amount ($)</FormLabel>
            <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
```

Repo convention to match: `client/src/lib/utils.ts`'s `formatCurrency`
(already used throughout `dashboard.tsx`, `history.tsx`, etc.) for any
dollar figure shown in the new checkbox's copy — don't hand-roll currency
formatting here.

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exits 0 |
| Tests     | `pnpm test`   | all pass (this plan adds no test files; see "Test plan" below) |
| Dev server | `pnpm dev`   | boots without error; used for manual verification |

## Scope

**In scope**:
- `client/src/components/bill-form-fields.tsx`
- `client/src/components/edit-bill-dialog.tsx`
- `client/src/pages/dashboard.tsx` (only the single `<EditBillDialog>`
  call site)

**Out of scope** (do NOT touch, even though related):
- `client/src/components/create-bill-dialog.tsx` — must keep calling
  `<BillFormFields>` exactly as it does today (no new prop passed). A new
  bill has no paid payment to correct; the new prop being optional and
  unpassed there is what keeps this feature edit-only with zero risk to
  create. Confirm this file is unmodified in your final diff.
- `server/storage.ts`'s `updateBill` cascade (`ne(payments.status,
  "paid")`, lines 64-66) — stays exactly as-is. This plan does not change
  when *automatic* cascades touch paid payments; it adds an explicit,
  opt-in, user-initiated correction that goes through the existing,
  already-unguarded `PUT /api/payments/:id` endpoint instead.
- `server/routes.ts` / `server/storage.ts`'s `updatePayment` — no server
  changes needed at all; `PUT /api/payments/:id` already accepts a
  partial `{ amount }` payload with no paid-status guard, confirmed in
  "Current state" above.
- `client/src/hooks/use-payments.ts`'s `updatePaymentRequest` — already
  exported and exactly fit for purpose; import and call it, don't modify
  it.
- Variable bills (`bill.isVariable === true`) — the new control must
  never appear for these; see Step 2's visibility condition. Do not
  weaken or remove that condition — it's the reason this plan is safe
  (see "Why this matters").
- `client/src/components/bill-history-sheet.tsx`, `client/src/pages/history.tsx`
  — a more general "edit any past payment" feature (not just the current
  cycle's) is a reasonable future idea but explicitly out of scope here;
  this plan only covers the one payment already visible in the row the
  owner is editing.

## Git workflow

- Branch: `advisor/042-correct-paid-payment-in-edit-bill`
- Commit per step or per logical unit. Message style: imperative,
  capitalized sentences, no conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pass the current cycle's paid-payment info into `EditBillDialog`

Change `client/src/pages/dashboard.tsx:243` from:

```tsx
                    <EditBillDialog bill={item.bill} />
```

to:

```tsx
                    <EditBillDialog
                      bill={item.bill}
                      currentPaidPayment={
                        item.status === "paid" && item.paymentId != null
                          ? { id: item.paymentId, amount: item.amount, dueDate: item.dueDate }
                          : null
                      }
                    />
```

This reuses exactly the data `getBillCycleStatus` (plan 040) already
computed for this row — no new fetch, no new state.

**Verify**: `pnpm check` → exits 0 (will show a prop-type error until Step
2 adds `currentPaidPayment` to `EditBillDialogProps` — that's expected;
re-run this check again after Step 2, not as a standalone gate here).

### Step 2: Rewrite `edit-bill-dialog.tsx` to accept the new prop and chain the correction

Replace the full contents of `client/src/components/edit-bill-dialog.tsx`
with:

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBillSchema, type Bill } from "@shared/schema";
import { useUpdateBill } from "@/hooks/use-bills";
import { updatePaymentRequest } from "@/hooks/use-payments";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { getNotificationPermission } from "@/lib/notifications";
import { BillFormFields } from "@/components/bill-form-fields";

interface EditBillDialogProps {
  bill: Bill;
  trigger?: React.ReactNode;
  currentPaidPayment?: { id: number; amount: string; dueDate: Date } | null;
}

export function EditBillDialog({ bill, trigger, currentPaidPayment }: EditBillDialogProps) {
  const [open, setOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
  const [correctPaidPayment, setCorrectPaidPayment] = useState(false);
  const updateBill = useUpdateBill();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertBillSchema),
    defaultValues: {
      name: bill.name,
      category: bill.category,
      defaultAmount: bill.defaultAmount,
      isVariable: bill.isVariable,
      frequency: bill.frequency,
      dueDay: bill.dueDay,
      dueMonth: bill.dueMonth,
      isAutoPay: bill.isAutoPay,
      archived: bill.archived,
      reminderDays: bill.reminderDays ?? null,
    },
  });

  const onSubmit = async (data: any) => {
    try {
      await updateBill.mutateAsync({ id: bill.id, data });

      if (correctPaidPayment && currentPaidPayment) {
        await updatePaymentRequest(currentPaidPayment.id, { amount: data.defaultAmount });
        queryClient.invalidateQueries({ queryKey: [api.payments.list.path] });
      }

      setCorrectPaidPayment(false);
      setOpen(false);
    } catch {
      toast({
        title: "Couldn't finish saving",
        description: "The bill was updated, but correcting the paid amount failed. Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Bill</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <BillFormFields
              form={form}
              notifPermission={notifPermission}
              onNotifPermissionChange={setNotifPermission}
              currentPaidPayment={currentPaidPayment}
              correctPaidPayment={correctPaidPayment}
              onCorrectPaidPaymentChange={setCorrectPaidPayment}
            />

            <Button type="submit" className="w-full" disabled={updateBill.isPending}>
              {updateBill.isPending ? "Updating..." : "Update Bill"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

Notes on this rewrite:

- `updateBill.mutateAsync` (instead of `.mutate`) is used so the payment
  correction can be sequenced strictly *after* the bill update succeeds —
  if the bill update fails, `updatePaymentRequest` is never called.
  `useUpdateBill`'s own `onSuccess` (its "Bill Updated" toast, and its own
  cache invalidation of both bills and payments — see `use-bills.ts:69-76`)
  still fires automatically on `mutateAsync` success; this plan does not
  duplicate that toast for the payment correction specifically, to avoid
  stacking two toasts for one save action.
- The `try`/`catch` only exists to surface a distinct error if the
  *second* call (the payment correction) fails after the bill update
  already succeeded — `updateBill.mutateAsync` itself still shows
  `useUpdateBill`'s own error handling if *it* fails (that hook has no
  `onError` today, so a failed bill update currently just rejects and
  keeps the dialog open with no toast — pre-existing behavior, unchanged
  by this plan; not fixed here, out of scope).
- `correctPaidPayment` resets to `false` after a successful submit so the
  checkbox doesn't stay checked if this same dialog instance is reopened
  later for a different edit.

**Verify**: `pnpm check` → exits 0 (still expected to show a prop error on
the new `BillFormFields` props until Step 3 adds them — re-check after
Step 3).

### Step 3: Add the correction checkbox to `BillFormFields`, edit-only

Change the import block at the top of
`client/src/components/bill-form-fields.tsx` from:

```tsx
import type { UseFormReturn } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { requestNotificationPermission, type NotificationPermission } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";

interface BillFormFieldsProps {
  form: UseFormReturn<any>;
  notifPermission: NotificationPermission;
  onNotifPermissionChange: (p: NotificationPermission) => void;
}

export function BillFormFields({ form, notifPermission, onNotifPermissionChange }: BillFormFieldsProps) {
  const frequency = form.watch("frequency");
  const { toast } = useToast();
```

to:

```tsx
import type { UseFormReturn } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { format } from "date-fns";
import { requestNotificationPermission, type NotificationPermission } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

interface BillFormFieldsProps {
  form: UseFormReturn<any>;
  notifPermission: NotificationPermission;
  onNotifPermissionChange: (p: NotificationPermission) => void;
  currentPaidPayment?: { id: number; amount: string; dueDate: Date } | null;
  correctPaidPayment?: boolean;
  onCorrectPaidPaymentChange?: (checked: boolean) => void;
}

export function BillFormFields({
  form,
  notifPermission,
  onNotifPermissionChange,
  currentPaidPayment,
  correctPaidPayment,
  onCorrectPaidPaymentChange,
}: BillFormFieldsProps) {
  const frequency = form.watch("frequency");
  const isVariable = form.watch("isVariable");
  const watchedAmount = form.watch("defaultAmount");
  const { toast } = useToast();
```

(`CreateBillDialog` calls `<BillFormFields form={form}
notifPermission={...} onNotifPermissionChange={...} />` with no other
props — all three new props are optional and default to `undefined`
there, so this change is a no-op for the create flow, confirmed by the
`grep` in "Current state" above.)

Then insert this new block immediately after the closing `</div>` of the
`category`/`defaultAmount` grid (right after the `defaultAmount`
`FormField` block shown in "Current state" above, before the next
`<div className="grid grid-cols-2 gap-4">` for frequency/dueDay):

```tsx
      {currentPaidPayment && !isVariable && Number(watchedAmount) !== Number(currentPaidPayment.amount) && (
        <div className="flex items-start gap-3 rounded-xl border border-border p-4 bg-muted/30">
          <Checkbox
            checked={correctPaidPayment ?? false}
            onCheckedChange={(checked) => onCorrectPaidPaymentChange?.(checked === true)}
          />
          <div className="space-y-0.5">
            <div className="text-sm font-medium text-foreground">
              Also correct the amount already paid this cycle
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCurrency(Number(currentPaidPayment.amount))} → {formatCurrency(Number(watchedAmount) || 0)}
              {" "}({format(currentPaidPayment.dueDate, "MMM d, yyyy")})
            </div>
          </div>
        </div>
      )}
```

This only renders when all three conditions hold: there's a paid payment
for the current cycle to correct, the bill isn't variable, and the
in-progress edit's amount actually differs from what's currently on that
paid record — no point showing a no-op checkbox. It's reactive to live
form edits via `form.watch`, so toggling "Variable Amount" or changing
the amount field immediately shows/hides it and updates the preview
figures.

**Verify**: `pnpm check` → exits 0. `grep -n "correctPaidPayment\|currentPaidPayment" client/src/components/bill-form-fields.tsx client/src/components/edit-bill-dialog.tsx client/src/pages/dashboard.tsx` → present in all three files. `grep -n "BillFormFields" client/src/components/create-bill-dialog.tsx` → unchanged, still exactly `<BillFormFields form={form} notifPermission={notifPermission} onNotifPermissionChange={setNotifPermission} />` with no new props.

## Test plan

No new automated tests — same rationale as every prior plan this session
touching React components: no React rendering harness in this repo
(`vitest.config.ts` only picks up pure-function `.test.ts` files, per
plan 040's own note). Verify manually against a live `pnpm dev` + the
owner's real Neon DB:

1. Open Edit Bill on `Mint Mobile: Erin` (currently paid for its 2026
   cycle at $360.00, per this session's investigation). Confirm the new
   checkbox does **not** appear yet (amount unchanged from $360.00).
2. Change Default Amount to `388.99`. Confirm the checkbox now appears,
   reading `$360.00 → $388.99 (Jun 25, 2026)` (or whatever the live due
   date is).
3. Leave the checkbox **unchecked**, click "Update Bill". Confirm: the
   bill's default amount is now 388.99 (reopen Edit Bill to check), but
   the Annual Bills Overview table still shows this bill's paid row at
   $360.00 — unchanged, exactly today's (pre-fix) behavior when the box
   isn't checked.
4. Repeat the edit, this time **check** the box before submitting.
   Confirm: after saving, the Annual Bills Overview table now shows this
   bill's row at $388.99, still "Paid", same due date as before — the
   specific payment record was corrected in place, not duplicated or
   reset to unpaid.
5. `curl http://localhost:5050/api/payments` — confirm the corrected
   payment's `id` is unchanged (same record, amount patched in place, not
   a new row) and its `status` is still `"paid"`.
6. Open Edit Bill on a **variable** bill (e.g. `Xcel: Electricity` or
   `CenterPoint: Gas`, whichever has `isVariable: true` in the live data —
   check via `curl http://localhost:5050/api/bills` if unsure) and change
   its default amount. Confirm the checkbox **never** appears, regardless
   of the amount typed.
7. Open Create Bill (the `+ Add Bill` button). Confirm no correction
   checkbox appears anywhere in that dialog — the shared `BillFormFields`
   component must render identically to before this plan when
   `currentPaidPayment` isn't passed.
8. Open Edit Bill on a bill that is currently unpaid/overdue for its
   cycle (e.g. `USI: Internet`). Confirm the checkbox never appears there
   either — `currentPaidPayment` should be `null` for any non-`"paid"`
   row, per Step 1's ternary.

**Verify**: all 8 observations above hold as described.

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (unchanged pass count — this plan adds no test files)
- [ ] `grep -n "currentPaidPayment" client/src/pages/dashboard.tsx` → present at the `<EditBillDialog>` call site
- [ ] `grep -n "updatePaymentRequest" client/src/components/edit-bill-dialog.tsx` → 1 match (the import)
- [ ] `grep -n "isVariable" client/src/components/bill-form-fields.tsx` → the new checkbox's visibility condition includes `!isVariable`
- [ ] `grep -n "BillFormFields" client/src/components/create-bill-dialog.tsx` → unchanged, no new props passed
- [ ] No files outside the 3 in-scope files modified (`git status`)
- [ ] All 8 manual observations confirmed live
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt above doesn't match the live code at that
  location (drift since this plan was written).
- `updatePaymentRequest` or `api.payments.update` have gained a
  paid-status guard since this plan was written (i.e. `PUT
  /api/payments/:id` now rejects amount changes on a `"paid"` payment) —
  this plan's entire mechanism depends on that endpoint being unguarded;
  if it's since been locked down, that was likely done deliberately and
  this plan needs to be reconsidered, not worked around.
- `pnpm check` reports new errors you can't resolve in one reasonable fix
  attempt.
- You find a second call site of `<EditBillDialog>` beyond
  `dashboard.tsx:243` — this plan assumes exactly one, confirmed via
  `grep -rn "<EditBillDialog" client/src/` returning a single match.

## Maintenance notes

- If a future plan generalizes this into "edit any past payment, not just
  the current cycle's" (e.g. from the History page), that's a bigger,
  separate feature — this plan's narrow scope (one payment, the one
  already visible in the row being edited) was a deliberate choice, not
  an oversight.
- The variable-bill exclusion (`!isVariable`) is the safety property that
  makes this feature sound — a future editor should not remove it without
  re-reading "Why this matters" above.
- If `updateBill`'s cascade (`server/storage.ts:64-66`) is ever changed
  to *also* patch paid payments automatically, this plan's explicit
  opt-in checkbox becomes redundant — but that would be a much bigger,
  riskier change (removes the variable-bill protection entirely) and
  isn't what this plan does.
