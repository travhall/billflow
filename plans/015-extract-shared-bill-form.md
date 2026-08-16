# Plan 015: Extract a shared bill-form component to deduplicate create/edit dialogs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- client/src/components/create-bill-dialog.tsx client/src/components/edit-bill-dialog.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Depends on `plans/014-unify-api-contract.md`**: that plan migrates
> `edit-bill-dialog.tsx`'s `onSubmit` to use `useUpdateBill()`. Apply it
> first (or confirm via `grep -n "useUpdateBill" client/src/components/edit-bill-dialog.tsx`)
> so this plan's extraction starts from the already-cleaned-up version of
> that file rather than fighting with two plans editing the same submit
> logic.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/014-unify-api-contract.md
- **Category**: tech-debt
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`create-bill-dialog.tsx` (309 lines) and `edit-bill-dialog.tsx` (295
lines) hand-build the same `Form`/`FormField` tree — name, category,
amount, frequency, due day, conditional due month, Auto Pay, Variable
Amount, and the payment-reminder block — as two independent,
copy-pasted implementations. They've already partially diverged: the
create dialog uses a `Switch` for "Variable Amount" where the edit dialog
uses a `Checkbox`; the create dialog wraps the Auto Pay/Variable fields in
a styled card (`bg-muted/30` etc.) that the edit dialog doesn't. Any
future field-level change (a new bill attribute, a validation rule, label
copy) has to be made in two places by hand, and they will keep drifting
apart. This plan extracts the shared field set into one component,
parameterized by mode.

## Current state

`client/src/components/create-bill-dialog.tsx` — the create dialog's form
fields (lines 92-291), using `Switch` for `isVariable` and a `formSchema`
extending `insertBillSchema` with stricter form-level validation:
```ts
const formSchema = insertBillSchema.extend({
  defaultAmount: z.string().min(1, "Amount is required"),
  dueDay: z.coerce.number().min(1).max(31),
  dueMonth: z.coerce.number().min(1).max(12).optional(),
  reminderDays: z.number().nullable().optional(),
});
```

`client/src/components/edit-bill-dialog.tsx` — the edit dialog's nearly
identical field set (lines 105-286), using `Checkbox` for `isVariable`
and resolving directly against `insertBillSchema` (no form-level
extension):
```ts
const form = useForm({
  resolver: zodResolver(insertBillSchema),
  defaultValues: { /* ... */ },
});
```

Both files render, in the same order: name → category/amount →
frequency/dueDay → (conditional) dueMonth → isAutoPay → isVariable → the
reminder section → a submit button. The differences worth preserving as
intentional (not bugs to "fix" during extraction, just note them and ask
the shared component to support both via a prop if they're genuinely
different, or standardize on one if they're accidental drift — the STOP
condition below covers this):
- Create uses `Switch` for Variable Amount; Edit uses `Checkbox`. This
  looks like accidental drift, not an intentional design choice — no
  comment or reasoning distinguishes them. Standardize on `Checkbox`
  (matching Edit and matching how `isAutoPay` is rendered in *both*
  files) unless you find evidence this was deliberate.
- Create wraps `isAutoPay`/`isVariable` in a styled card with a
  description line; Edit does not. Since Create is the newer, more
  polished implementation (per its richer styling throughout), use its
  styled-card treatment as the shared version.
- Create's submit button shows a pending/loading state
  (`createBill.isPending`); Edit's does not currently expose one (though
  after `plans/014` is applied, `useUpdateBill()` does provide `isPending`
  the same way — use it).

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

## Scope

**In scope**:
- `client/src/components/bill-form-fields.tsx` (create) — the shared field set.
- `client/src/components/create-bill-dialog.tsx` — refactor to use it.
- `client/src/components/edit-bill-dialog.tsx` — refactor to use it.

**Out of scope**:
- `client/src/components/mark-paid-dialog.tsx` — a structurally different
  form (payment fields, not bill fields); not part of this extraction.
- Any change to `formSchema`'s validation rules beyond what's needed to
  make one shared schema work for both create and edit (see Step 1) —
  don't tighten or loosen validation as a side effect of this refactor.

## Git workflow

- Branch: `advisor/015-extract-shared-bill-form`
- Commit per step; message style matches repo history. Suggested message:
  `Extract shared bill form fields to deduplicate create/edit dialogs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the shared form-fields component

Create `client/src/components/bill-form-fields.tsx`. This component
renders the field set only — it does not own the `<Form>` wrapper, the
submit button, or the dialog chrome, since those differ enough between
create/edit (different submit-button label, different dialog header) to
stay in the two call sites:

```tsx
import type { UseFormReturn } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { requestNotificationPermission, type NotificationPermission } from "@/lib/notifications";

interface BillFormFieldsProps {
  form: UseFormReturn<any>;
  notifPermission: NotificationPermission;
  onNotifPermissionChange: (p: NotificationPermission) => void;
}

export function BillFormFields({ form, notifPermission, onNotifPermissionChange }: BillFormFieldsProps) {
  const frequency = form.watch("frequency");

  async function enableReminders() {
    const result = await requestNotificationPermission();
    onNotifPermissionChange(result);
    if (result === "granted" && !form.getValues("reminderDays")) {
      form.setValue("reminderDays", 3);
    }
  }

  return (
    <>
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem>
          <FormLabel>Bill Name</FormLabel>
          <FormControl><Input placeholder="e.g. Netflix, Rent" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <div className="grid grid-cols-2 gap-4">
        <FormField control={form.control} name="category" render={({ field }) => (
          <FormItem>
            <FormLabel>Category</FormLabel>
            <FormControl><Input placeholder="e.g. Utilities" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="defaultAmount" render={({ field }) => (
          <FormItem>
            <FormLabel>Default Amount ($)</FormLabel>
            <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField control={form.control} name="frequency" render={({ field }) => (
          <FormItem>
            <FormLabel>Frequency</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl><SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="dueDay" render={({ field }) => (
          <FormItem>
            <FormLabel>Due Day</FormLabel>
            <FormControl><Input type="number" min={1} max={31} {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>

      {frequency === "yearly" && (
        <FormField control={form.control} name="dueMonth" render={({ field }) => (
          <FormItem>
            <FormLabel>Due Month</FormLabel>
            <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString() ?? ""}>
              <FormControl><SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger></FormControl>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    {new Date(0, i).toLocaleString('default', { month: 'long' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
      )}

      <FormField control={form.control} name="isAutoPay" render={({ field }) => (
        <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border p-4 bg-muted/30">
          <div className="space-y-0.5">
            <FormLabel className="text-base">Auto Pay</FormLabel>
            <div className="text-xs text-muted-foreground">Automatically reset cycle when due date passes</div>
          </div>
          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
        </FormItem>
      )} />

      <FormField control={form.control} name="isVariable" render={({ field }) => (
        <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border p-4 bg-muted/30">
          <div className="space-y-0.5">
            <FormLabel className="text-base">Variable Amount</FormLabel>
            <div className="text-xs text-muted-foreground">Does the amount change each bill?</div>
          </div>
          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
        </FormItem>
      )} />

      <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Payment Reminder</span>
          </div>
          {notifPermission !== "granted" && (
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={enableReminders}>
              <Bell className="w-3 h-3" /> Enable
            </Button>
          )}
        </div>
        {notifPermission === "granted" ? (
          <FormField control={form.control} name="reminderDays" render={({ field }) => (
            <FormItem>
              <Select
                onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))}
                value={field.value === null || field.value === undefined ? "none" : String(field.value)}
              >
                <FormControl><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="No reminder" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="none">No reminder</SelectItem>
                  <SelectItem value="0">On the due date</SelectItem>
                  <SelectItem value="1">1 day before</SelectItem>
                  <SelectItem value="3">3 days before</SelectItem>
                  <SelectItem value="5">5 days before</SelectItem>
                  <SelectItem value="7">1 week before</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {notifPermission === "denied"
              ? "Notifications are blocked. Allow them in your browser settings."
              : "Get notified before bills are due. Click Enable to allow notifications."}
          </p>
        )}
      </div>
    </>
  );
}
```

**Verify**: `pnpm check` → exit 0.

### Step 2: Use it in `create-bill-dialog.tsx`

Replace the field-rendering block (the `<FormField>` calls between the
`<form>` open tag and the reminder-section closing, roughly lines 92-291
in the current file) with `<BillFormFields form={form} notifPermission={notifPermission} onNotifPermissionChange={setNotifPermission} />`.
Keep the surrounding `<Dialog>`/`<DialogContent>`/`<Form>`/submit-button
structure, the `useCreateBillStore`, `formSchema`, and `onSubmit` exactly
as they are — only the field-rendering JSX is replaced.

**Verify**: `pnpm check` → exit 0.

### Step 3: Use it in `edit-bill-dialog.tsx`

Same pattern: replace the field-rendering block (lines 105-286 in the
current file, after `plans/014` has already updated `onSubmit`) with
`<BillFormFields form={form} notifPermission={notifPermission} onNotifPermissionChange={setNotifPermission} />`.
Keep the surrounding structure and `onSubmit` (already migrated to
`useUpdateBill()` by plan 014) as-is.

**Verify**: `pnpm check` → exit 0.

### Step 4: Manually verify both dialogs still work identically to before

With `pnpm dev` running:
1. Open Add Bill, fill every field including toggling Yearly (confirm Due
   Month appears), enabling notifications and picking a reminder, submit.
   Confirm the bill appears correctly.
2. Edit that same bill via its pencil icon, confirm every field is
   pre-filled correctly (including the reminder dropdown showing the
   value you picked), change one field, save. Confirm the change persists.

**Verify**: both flows work exactly as before the refactor — same fields,
same validation messages, same visual layout (the edit dialog now also
gets the styled-card treatment for Auto Pay/Variable Amount that create
already had — this is an intentional, expected visual change per this
plan's design choice above, not a bug).

## Test plan

- No automated test framework exists. Verification is the manual create +
  edit flow in Step 4, covering every field including the conditional
  Due Month and the notification-permission-gated reminder section.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -l "BillFormFields" client/src/components/create-bill-dialog.tsx client/src/components/edit-bill-dialog.tsx` lists both files
- [ ] `wc -l client/src/components/create-bill-dialog.tsx client/src/components/edit-bill-dialog.tsx` shows both files meaningfully shorter than their original 309/295 lines
- [ ] Manual Step 4 confirms both create and edit flows work end-to-end
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find, or
  `plans/014-unify-api-contract.md` hasn't been applied to
  `edit-bill-dialog.tsx` yet — apply it first.
- You find a field or behavior difference between the two dialogs beyond
  what's documented in "Current state" that looks intentional (not
  accidental drift) — report it and ask rather than silently picking one
  version, since collapsing an intentional difference would be a real
  behavior regression.

## Maintenance notes

- Any new bill field added in the future should be added once, to
  `BillFormFields`, and will automatically appear in both create and edit.
- If `mark-paid-dialog.tsx` later grows enough shared structure with these
  two, a similar extraction could apply there — not attempted in this
  plan since its field set is currently quite different (payment amount/
  date, not bill attributes).
