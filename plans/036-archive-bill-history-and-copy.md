# Plan 036: Fix archived-bill history lookup, clean up dangling payments, relabel Delete as Archive

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 850ab7a..HEAD -- server/storage.ts client/src/pages/dashboard.tsx client/src/pages/history.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on
> a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug (data-correctness) + UX copy
- **Planned at**: commit `850ab7a`, 2026-09-01

## Why this matters

BillFlow already has an `archived` boolean on `bills` (`shared/schema.ts:26`),
and the "Delete Bill" button in the dashboard is secretly an archive: it sets
`archived: true` and never touches the `payments` table
(`server/storage.ts:84-86`). That's the right underlying design for a
solo-user app that wants to keep historical/metric data — recurring bills
that end (a loan paid off, a subscription cancelled) should stop showing up
as active but keep their payment history intact.

Two things currently undermine that design:

1. **The bill-name lookup breaks for archived bills.** `GET /api/bills`
   filters to `WHERE archived = false` server-side
   (`server/storage.ts:36-38`). The History and Analytics pages build their
   bill-name/category lookup map directly from that same list
   (`client/src/pages/history.tsx:59,70`, `client/src/pages/analytics.tsx:57,69`).
   Once a bill is archived, every one of its *past, already-paid* payments
   silently renders as `"Unknown Bill"` / `"Uncategorized"` in History
   (`client/src/pages/history.tsx:131,135`) and Analytics — the exact
   historical record the owner is trying to preserve gets its labels wiped.
2. **The confirm dialog lies, and a dangling payment survives archiving.**
   The delete confirmation says *"This will also remove its payment
   history"* (`client/src/pages/dashboard.tsx:216`) — false, and needlessly
   scary. Separately, `resetPayment` (called after every "mark paid",
   including the one that pays off a bill for the last time) unconditionally
   creates a next-cycle pending payment (`server/storage.ts:143-161`).
   Archiving right after that final payment leaves one pending payment
   permanently orphaned — it'll show as `"Pending"` forever in History for a
   bill that will never generate another cycle.

This plan fixes both without adding any new schema field or status enum —
`archived` already means the right thing; the plumbing just needs to honor
it consistently, and the button that sets it needs to say what it actually
does.

## Current state

Relevant files:

- `server/storage.ts` — data access layer. `getBills()` (filters archived
  out), `deleteBill()` (the actual archive operation), `resetPayment()`
  (creates the next pending cycle after any "mark paid").
- `client/src/pages/dashboard.tsx` — bill table + the delete/archive confirm
  dialog, category filter dropdown, and the "no bills yet" empty state.
- `client/src/pages/history.tsx` — payment history table; looks up each
  payment's bill via a map built from `useBills()`.
- `shared/schema.ts` — `bills.archived` already exists (line 26); not
  modified by this plan.

`server/storage.ts:36-38` (today):

```ts
  async getBills(): Promise<Bill[]> {
    return await db.select().from(bills).where(eq(bills.archived, false));
  }
```

`server/storage.ts:84-86` (today):

```ts
  async deleteBill(id: number): Promise<void> {
    await db.update(bills).set({ archived: true }).where(eq(bills.id, id));
  }
```

`server/storage.ts:1-9` (imports available in this file already — `and`,
`ne`, `eq` are all imported, no new import needed for Step 3):

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

`client/src/pages/dashboard.tsx:206-229` (today — the delete/archive dialog):

```tsx
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Delete bill" className="h-8 w-8 text-muted-foreground hover:text-destructive no-default-hover-elevate">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Bill</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{item.bill.name}"? This will also remove its payment history.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => onDeleteBill(item.bill.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
```

`client/src/pages/dashboard.tsx:29` (icon imports — `Trash2` is used only at
line 209, nowhere else in this file, confirmed by
`grep -n "Trash2" client/src/pages/dashboard.tsx`):

```ts
import { Trash2, Edit2, RotateCcw, Undo2, AlertTriangle, X, CreditCard, FlaskConical, Bell, ChevronDown, Search } from "lucide-react";
```

`client/src/pages/dashboard.tsx:463` (category filter dropdown source —
currently unfiltered, will start including archived-bill categories once
Step 1 lands unless fixed here too):

```ts
  const allCategories = Array.from(new Set((bills ?? []).map(b => b.category))).sort();
```

`client/src/pages/dashboard.tsx:626` ("no bills yet" empty state — currently
correct only because the server already excludes archived bills; would
silently break once Step 1 removes that filter):

```tsx
        {bills?.length === 0 ? (
```

`client/src/pages/dashboard.tsx:363` (already correctly filters — no change
needed, shown for contrast with the two broken spots above):

```ts
    const allBillStatuses = bills.filter(b => !b.archived).map(bill => ({
```

`client/src/pages/history.tsx:59,70,126-136` (today):

```tsx
  const { data: bills, isLoading: billsLoading } = useBills();
  ...
  const billMap = new Map(bills?.map(b => [b.id, b]));
  ...
                sortedPayments.map((payment) => {
                  const bill = billMap.get(payment.billId);
                  return (
                    <TableRow key={payment.id} className="hover:bg-muted/30 transition-colors border-border/50">
                      <TableCell className="font-medium text-foreground">
                        {bill?.name || "Unknown Bill"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal text-muted-foreground">
                          {bill?.category || "Uncategorized"}
                        </Badge>
                      </TableCell>
```

Conventions to match: this repo's `db.transaction(async (tx) => {...})`
pattern for multi-statement writes that must be atomic — see
`server/storage.ts`'s existing `processAutoPay()` (lines 113-121) and
`markPaidAndReset()` (lines 162-172) for the exact shape to follow in Step 3.

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exits 0 (this repo's baseline is currently clean — confirm your own baseline first with `pnpm check` before any edits, since some prior plans note transient unrelated errors) |
| Tests     | `pnpm test`   | all pass (currently 3/3, `shared/date-utils.test.ts` only — this plan does not add new automated tests; see "Test plan" below for why) |
| Dev server | `pnpm dev`   | boots without error; used for manual verification steps |

## Scope

**In scope** (the only files you should modify):
- `server/storage.ts`
- `client/src/pages/dashboard.tsx`
- `client/src/pages/history.tsx`

**Out of scope** (do NOT touch, even though related):
- `shared/schema.ts` — no new column or enum. `archived` already means what
  this plan needs.
- Renaming the `deleteBill` storage method, the `useDeleteBill` hook, or the
  `DELETE /api/bills/:id` route — only the *user-facing copy* changes in
  this plan, not the API/function names. Renaming those is a bigger,
  unrelated refactor.
- `client/src/pages/analytics.tsx` — it already builds its `billMap` from
  the unfiltered `bills` array (`analytics.tsx:69`), so it's fixed for free
  by Step 1 with no code change needed there. Do not add an "Archived"
  badge there; that's scoped to History only in this plan.
- Adding an "Archived bills" list/unarchive UI — a reasonable future
  feature, deliberately left out of this plan's scope (see Maintenance
  notes).
- `client/src/lib/notifications.ts` — already correctly skips archived
  bills (`bill.archived` check at line 70); no change needed, don't touch.

## Git workflow

- Branch: `advisor/036-archive-bill-history-and-copy`
- Commit per step or per logical unit. Message style: imperative,
  capitalized sentences, no conventional-commit prefix — e.g. "Stop
  filtering archived bills out of GET /api/bills" (see `git log` for more
  examples).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Stop filtering archived bills out of `GET /api/bills`

In `server/storage.ts`, change `getBills()` to return all bills, active and
archived:

```ts
  async getBills(): Promise<Bill[]> {
    return await db.select().from(bills);
  }
```

This is safe: the only two server-side callers of `storage.getBills()` are
`seedData()` in `server/routes.ts` (only checks `.length === 0`, unaffected)
and the `GET /api/bills` route handler (which now correctly serves the full
list — client code decides what to hide, same as it already does in three
other places: `upcoming.tsx:40`, `upcoming.tsx:188`, `dashboard.tsx:363`).

**Verify**: `grep -n "storage.getBills()" server/*.ts` → exactly 2 matches
(`server/routes.ts` seedData and the list route), confirming no other server
code depends on the filtered behavior.

### Step 2: Fix the two dashboard.tsx spots that relied on the server-side filter

`dashboard.tsx:463`'s category dropdown and `dashboard.tsx:626`'s empty
state both currently work only because archived bills never reached the
client. After Step 1 they will, so both need an explicit `!b.archived`
filter to keep their existing behavior.

Change `client/src/pages/dashboard.tsx:463` from:

```ts
  const allCategories = Array.from(new Set((bills ?? []).map(b => b.category))).sort();
```

to:

```ts
  const allCategories = Array.from(new Set((bills ?? []).filter(b => !b.archived).map(b => b.category))).sort();
```

Change `client/src/pages/dashboard.tsx:626` from:

```tsx
        {bills?.length === 0 ? (
```

to:

```tsx
        {bills?.filter(b => !b.archived).length === 0 ? (
```

**Verify**: `pnpm check` → exits 0, no new errors. Manual check deferred to
Step 6 (needs a live archived bill to exercise both branches).

### Step 3: Delete the dangling pending payment when a bill is archived

In `server/storage.ts`, change `deleteBill()` to also remove any not-yet-paid
payment for that bill inside the same transaction — a bill that just got
archived will never reach that payment's due date through normal use again:

```ts
  async deleteBill(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(bills).set({ archived: true }).where(eq(bills.id, id));
      await tx.delete(payments).where(and(eq(payments.billId, id), ne(payments.status, "paid")));
    });
  }
```

Only `status != "paid"` rows are deleted — any already-`"paid"` payment
(the actual historical record, including the final payoff payment that
triggered the archive) is untouched. This mirrors the existing
`and`/`ne(payments.status, "paid")` pattern already used in
`processAutoPay()` (`server/storage.ts:98-99`) and `updateBill()`
(`server/storage.ts:66`).

**Verify**: `pnpm check` → exits 0, no new errors.

### Step 4: Relabel the delete dialog as "Archive", with copy that describes what actually happens

Replace `client/src/pages/dashboard.tsx:206-229` with:

```tsx
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Archive bill" className="h-8 w-8 text-muted-foreground hover:text-destructive no-default-hover-elevate">
                          <Archive className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Archive Bill</AlertDialogTitle>
                          <AlertDialogDescription>
                            Archive "{item.bill.name}"? It'll be hidden from your dashboard and stop generating new payments, but its payment history stays intact and stays visible in History.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => onDeleteBill(item.bill.id)}
                          >
                            Archive
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
```

Note `onClick={() => onDeleteBill(item.bill.id)}` is unchanged — per Scope,
the underlying handler/hook keeps its `delete` name; only the visible copy
and icon change.

Update the import at `client/src/pages/dashboard.tsx:29` — swap `Trash2` for
`Archive` (confirmed `Trash2` has no other use in this file):

```ts
import { Archive, Edit2, RotateCcw, Undo2, AlertTriangle, X, CreditCard, FlaskConical, Bell, ChevronDown, Search } from "lucide-react";
```

**Verify**: `pnpm check` → exits 0. `grep -n "Trash2" client/src/pages/dashboard.tsx` → no matches. `grep -n "Archive" client/src/pages/dashboard.tsx` → matches the import line plus the two JSX usages above.

### Step 5: Show an "Archived" badge in History for payments whose bill is archived

In `client/src/pages/history.tsx`, the bill-name cell (lines 130-132) should
flag when the bill behind a payment has since been archived, now that
`billMap` (Step 1) actually contains archived bills instead of coming back
empty for them. Change:

```tsx
                      <TableCell className="font-medium text-foreground">
                        {bill?.name || "Unknown Bill"}
                      </TableCell>
```

to:

```tsx
                      <TableCell className="font-medium text-foreground">
                        <span className="flex items-center gap-2">
                          {bill?.name || "Unknown Bill"}
                          {bill?.archived && (
                            <Badge variant="outline" className="font-normal text-xs text-muted-foreground">
                              Archived
                            </Badge>
                          )}
                        </span>
                      </TableCell>
```

`Badge` is already imported in this file (`client/src/pages/history.tsx:16`,
used at line 134 for the category cell) — no new import needed.

**Verify**: `pnpm check` → exits 0. Live check deferred to Step 6.

### Step 6: Manual end-to-end verification against a live dev DB

No automated DB-backed tests exist in this repo (`vitest.config.ts` only
picks up `**/*.test.ts`, and the one existing test file,
`shared/date-utils.test.ts`, tests pure functions — there's no test-database
harness to write a real integration test against `server/storage.ts`
without adding one, which is out of scope here). Verify manually instead,
matching how every prior storage.ts-touching plan in this repo's history
(e.g. plans 001-005, 035) closed out:

1. `pnpm dev`, open the app.
2. Create a test monthly bill (any name/amount), mark its current pending
   payment paid (this triggers `resetPayment`, creating a next-cycle pending
   payment — confirm one exists for it via the Upcoming page or a `curl
   http://localhost:5000/api/payments`).
3. Archive the test bill (the new "Archive Bill" dialog — confirm the copy
   reads as written in Step 4, no more "remove its payment history").
4. Confirm: the bill disappears from the Dashboard active table and the
   Upcoming page. `curl http://localhost:5000/api/payments` no longer lists
   the next-cycle pending payment created in step 2 for this bill (Step 3's
   cleanup) — but the payment you marked paid in step 2 still appears.
5. Open History: the paid payment from step 2 shows the real bill name and
   category (not "Unknown Bill"/"Uncategorized"), with an "Archived" badge
   next to the name (Step 5).
6. On Dashboard, confirm the category filter dropdown no longer offers the
   archived test bill's category if no other active bill shares it (Step 2's
   `allCategories` fix) — skip this check if another active bill happens to
   share the category, note that in your report instead.
7. If the test bill was your only bill at any point during this test,
   confirm the "No bills yet" empty state rendered correctly then, not a
   broken empty active-bill table (Step 2's `bills?.length` fix) — otherwise
   note this sub-check as not applicable in your report.
8. Delete the test bill's row directly from the database if needed to leave
   the dev DB clean (`DELETE FROM bills WHERE id = <test id>`), since this
   app's `archived` mechanism doesn't hard-delete — matches the cleanup
   pattern used in plans 015 and 028.

**Verify**: all 7 observations above hold as described.

## Test plan

No new automated tests — see Step 6 for why (no DB test harness in this
repo). If a future plan adds one (e.g. via `testcontainers` or a Neon branch
database), good candidates to backfill here: `deleteBill` deletes pending
payments but preserves paid ones; `getBills()` returns archived bills.

## Done criteria

Machine-checkable, plus the manual checks from Step 6:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (unchanged 3/3 — this plan adds no test files)
- [ ] `grep -n "storage.getBills()" server/*.ts` → exactly 2 matches
- [ ] `grep -n "eq(bills.archived, false)" server/storage.ts` → no matches
- [ ] `grep -n "Trash2" client/src/pages/dashboard.tsx` → no matches
- [ ] `grep -n "This will also remove its payment history" client/src/pages/dashboard.tsx` → no matches
- [ ] `grep -n "bill?.archived" client/src/pages/history.tsx` → at least 1 match
- [ ] No files outside the 3 in-scope files modified (`git status`)
- [ ] All 7 manual observations in Step 6 confirmed live
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt above doesn't match the live code at that
  location (drift since this plan was written).
- `storage.getBills()` has gained callers beyond the 2 named in Step 1 (i.e.
  `grep -n "storage.getBills()" server/*.ts` returns more than 2 matches)
  before your edit — investigate what the new caller needs before assuming
  it's safe to stop filtering archived bills for it too.
- `pnpm check` reports new errors in an in-scope file that you can't resolve
  in one reasonable fix attempt.
- The `db.transaction` change in Step 3 fails to compile against this
  repo's Drizzle version — report the exact error rather than guessing at
  an alternate transaction API.

## Maintenance notes

- If a future plan adds an "Archived bills" view with an unarchive action
  (flip `archived` back to `false`), it should reuse the same `bills` list
  this plan already makes available unfiltered from `GET /api/bills` — no
  further server change needed, just a client screen that shows
  `bills.filter(b => b.archived)` instead of `!b.archived`.
- `client/src/lib/csv-import.ts` / `import-bills-dialog.tsx` create new
  bills with `archived: false` explicitly (`import-bills-dialog.tsx:53`) —
  unaffected by this plan, no change needed there.
- If `processAutoPay()` or `resetPayment()` are ever changed to check
  `bill.archived` before creating a next-cycle payment (closing the root
  cause of Step 3's cleanup rather than mopping up after it), Step 3's
  cleanup in `deleteBill()` becomes redundant but still harmless — leave it
  in unless a reviewer explicitly wants it removed.
