# Plan 037: Tier the "Pending" status badge by due-date proximity

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dd6f3d3..HEAD -- client/src/pages/dashboard.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UX / information hierarchy)
- **Planned at**: commit `dd6f3d3`, 2026-09-01

## Why this matters

The Dashboard's bill tables ("Upcoming Monthly Bills" and "Annual Bills
Overview") render every not-yet-due, not-yet-paid bill with the identical
amber "Pending" badge — whether it's due in 2 days or, for annual bills,
due in 9+ months (e.g. a bill due Jun 2027 gets the exact same badge as one
due next week). The owner flagged this directly: it reads as flat, nothing
signals priority, and a bill "out by one month" looks exactly as urgent as
one due tomorrow. Since both bill tables render through one shared
`BillTable` component, this is a single, surgical fix: derive the badge's
label and color from days-until-due instead of the flat `"pending"` string,
without touching the underlying data model, filters, or counts that
correctly rely on the existing 3-value `status` field.

## Current state

Relevant file: `client/src/pages/dashboard.tsx` — contains `BillTable`
(the shared table component both "Upcoming Monthly Bills" and "Annual
Bills Overview" render through, per `dashboard.tsx:644,657`), the `getStatus`
status-derivation logic, and the status filter pills.

`client/src/pages/dashboard.tsx:45-51` (the type driving the badge — do not
change; the underlying 3-value `status` stays correct and load-bearing for
filtering/counting/auto-pay-adjacent logic elsewhere in this file):

```ts
type BillStatusItem = {
  bill: Bill;
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
};
```

`client/src/pages/dashboard.tsx:53-56` (existing module-scope helper — the
new `getUrgencyDisplay` function added by this plan follows the same
hoisting pattern: defined outside `Dashboard()` so it doesn't get
re-created every render):

```tsx
function SortIcon({ column, sortConfig }: { column: string; sortConfig: SortConfig }) {
  if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
  return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
}
```

`client/src/pages/dashboard.tsx:191-203` (today — the one and only badge
render site, inside `BillTable`, used by both tables):

```tsx
                <TableCell>
                  <Badge
                    className={clsx(
                      "capitalize font-semibold",
                      item.status === "paid" ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" :
                      item.status === "overdue" ? "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/20" :
                      "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20"
                    )}
                    variant="outline"
                  >
                    {item.status}
                  </Badge>
                </TableCell>
```

`client/src/pages/dashboard.tsx:16` (existing `date-fns` import — this plan
adds `differenceInCalendarDays` to it):

```ts
import { startOfMonth, endOfMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay, format } from "date-fns";
```

`client/src/pages/dashboard.tsx:470` (the status filter — reads `item.status`
directly, must keep working unchanged since this plan does not add a new
`status` value, only a new display label derived from it):

```ts
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
```

`client/src/pages/dashboard.tsx:181-183` (existing muted/theme-safe badge
pattern to match for the new "Scheduled" tier — reuse this exact class
combination rather than inventing a new color, since it's already proven
dark-mode-safe by plan 034's contrast fix):

```tsx
                  <Badge variant="outline" className="font-normal text-muted-foreground bg-background border-border">
                    {item.bill.category}
                  </Badge>
```

Conventions to match: badge color classes in this file follow the
`bg-{color}-500/10 text-{color}-500 hover:bg-{color}-500/20 border-{color}-500/20`
pattern for the 3 existing statuses (emerald/paid, rose/overdue,
amber/pending) — the new "Upcoming" tier should follow the same pattern
with a 4th color so it reads as visually distinct at a glance, not just a
duller amber.

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
- `BillStatusItem.status` and everywhere it's read for filtering/counting/
  sorting (`statusFilter`/`matchesStatus` at line 470, `overdueCount` at
  line 418, `totalPaid`/`totalPending` at lines 412-417, the `status` case
  in `sortData` at lines 389-392, the "All/Pending/Paid/Overdue" filter
  pills). All of these keep working exactly as today, unchanged — this
  plan only changes what text/color renders in the badge cell for items
  whose `status` is `"pending"`. Do not add a 4th value to the `status`
  filter pills or the `statusFilter` state type.
- `getStatus()` (lines 318-361) — the paid/pending/overdue derivation
  itself is correct and unrelated to this plan's display-only fix. Do not
  change what counts as overdue vs. pending.
- `client/src/pages/upcoming.tsx` — has its own separate status badges
  (`"paid" | "overdue" | "pending" | "upcoming"`, already 4 values, see
  `upcoming.tsx:59-70`) for its month-grid view. Out of scope; this plan is
  Dashboard-only, per the owner's screenshot and complaint.
- `Mark Paid` button visibility (`item.status !== "paid"` at line 258) —
  unaffected by this plan, still correctly shows for both near-term and
  far-out pending bills.

## Git workflow

- Branch: `advisor/037-tier-pending-badge-by-due-date`
- Commit per step or per logical unit. Message style: imperative,
  capitalized sentences, no conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `differenceInCalendarDays` to the existing date-fns import

Change `client/src/pages/dashboard.tsx:16` from:

```ts
import { startOfMonth, endOfMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay, format } from "date-fns";
```

to:

```ts
import { startOfMonth, endOfMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay, format, differenceInCalendarDays } from "date-fns";
```

**Verify**: `pnpm check` → exits 0.

### Step 2: Add the `getUrgencyDisplay` helper, hoisted to module scope

Insert this new function directly after `SortIcon` (after line 56, before
`interface BillTableProps` at line 58) in `client/src/pages/dashboard.tsx`:

```tsx
function getUrgencyDisplay(item: BillStatusItem): { label: string; className: string } {
  if (item.status === "paid") {
    return { label: "Paid", className: "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" };
  }
  if (item.status === "overdue") {
    return { label: "Overdue", className: "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/20" };
  }
  const daysUntil = differenceInCalendarDays(item.dueDate, startOfDay(new Date()));
  if (daysUntil <= 3) {
    return {
      label: daysUntil <= 0 ? "Due Today" : `Due in ${daysUntil}d`,
      className: "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20",
    };
  }
  if (daysUntil <= 14) {
    return { label: "Upcoming", className: "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20" };
  }
  return { label: "Scheduled", className: "text-muted-foreground bg-background border-border" };
}
```

Tiers, for reference (all thresholds measured from `item.dueDate`, which
for a `"pending"` item is always today or later — `getStatus` already
routes anything past-due to `"overdue"` before this function ever sees it):

- `paid` → "Paid" (unchanged color)
- `overdue` → "Overdue" (unchanged color)
- 0-3 days out → "Due Today" / "Due in Nd" (amber — same color pending
  used before, now reserved for what's actually near-term)
- 4-14 days out → "Upcoming" (new blue tier)
- 15+ days out → "Scheduled" (new muted/outline tier, reusing the
  dark-mode-safe `text-muted-foreground bg-background border-border`
  combination already used for the category badge at line 181)

**Verify**: `pnpm check` → exits 0. `grep -n "function getUrgencyDisplay" client/src/pages/dashboard.tsx` → 1 match.

### Step 3: Wire the badge cell to use it

Replace `client/src/pages/dashboard.tsx:191-203` (inside `BillTable`'s row
map) from:

```tsx
                <TableCell>
                  <Badge
                    className={clsx(
                      "capitalize font-semibold",
                      item.status === "paid" ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" :
                      item.status === "overdue" ? "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/20" :
                      "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20"
                    )}
                    variant="outline"
                  >
                    {item.status}
                  </Badge>
                </TableCell>
```

to:

```tsx
                <TableCell>
                  <Badge
                    className={clsx("font-semibold", getUrgencyDisplay(item).className)}
                    variant="outline"
                  >
                    {getUrgencyDisplay(item).label}
                  </Badge>
                </TableCell>
```

Note `"capitalize"` is dropped — the new labels ("Due Today", "Upcoming",
etc.) are already properly cased, unlike the old raw lowercase `status`
string that needed CSS capitalization.

**Verify**: `pnpm check` → exits 0. `grep -n "capitalize font-semibold" client/src/pages/dashboard.tsx` → no matches (confirms the old inline ternary is gone, not just shadowed).

## Test plan

No new automated tests — this repo's Vitest harness
(`shared/date-utils.test.ts`) only covers pure date-math functions with no
React rendering setup, and adding one is out of scope for a single-file
display tweak. If a future plan adds React Testing Library to this repo,
`getUrgencyDisplay` is a good candidate to backfill: it's a pure function
taking a `BillStatusItem` and returning `{ label, className }`, easy to
unit test directly (e.g. a `pending` item due in 0/2/10/40 days each
produce the expected tier).

Verify manually instead, against a live `pnpm dev`:

1. Confirm at least one bill with a due date in the next 0-3 days shows
   "Due Today" or "Due in Nd" with the amber badge (create a test monthly
   bill with `dueDay` set to make this true if none currently exist).
2. Confirm a bill due 4-14 days out shows "Upcoming" with a blue badge.
3. Confirm an annual bill due more than 15 days out (most of them, per the
   owner's screenshot — e.g. "Mint Mobile: Travis" due Jun 2027) shows
   "Scheduled" with the muted outline badge, clearly visually quieter than
   the amber/blue tiers.
4. Confirm a paid bill still shows "Paid" in emerald, and an overdue bill
   still shows "Overdue" in rose — both unchanged from before this plan.
5. Confirm the "All / Pending / Paid / Overdue" filter pills still work
   exactly as before — clicking "Pending" still shows every unpaid,
   not-yet-due bill regardless of its new "Due Today"/"Upcoming"/
   "Scheduled" badge tier (the filter still reads the underlying `status`
   field, untouched by this plan).
6. Confirm the "Overdue" banner/count at the top of the Dashboard is
   unchanged (still counts by the underlying `status`, not the new tiers).
7. If you created a test bill for step 1, delete it afterward to leave the
   DB clean, matching the cleanup pattern used in prior plans (e.g. 015,
   028, 036).

**Verify**: all 7 observations above hold as described.

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (unchanged pass count — this plan adds no test files)
- [ ] `grep -n "function getUrgencyDisplay" client/src/pages/dashboard.tsx` → 1 match
- [ ] `grep -n "capitalize font-semibold" client/src/pages/dashboard.tsx` → no matches
- [ ] `grep -n '"Due Today"' client/src/pages/dashboard.tsx` → 1 match
- [ ] `grep -n 'statusFilter === "all" || item.status === statusFilter'` (unchanged, confirms filter logic untouched) → 1 match in `client/src/pages/dashboard.tsx`
- [ ] No files outside `client/src/pages/dashboard.tsx` modified (`git status`)
- [ ] All 7 manual observations confirmed live
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt above doesn't match the live code at that
  location (drift since this plan was written).
- `BillStatusItem` or `getStatus()` have changed shape since this plan was
  written in a way that changes what `item.dueDate` means for a `"pending"`
  item (e.g. if it's no longer guaranteed to be today-or-later) — the tier
  thresholds in Step 2 assume that invariant.
- `pnpm check` reports new errors you can't resolve in one reasonable fix
  attempt.
- You find a second badge-rendering site for bill status elsewhere in
  `dashboard.tsx` beyond `BillTable` (lines 191-203) — this plan assumes
  exactly one, confirmed via `grep -n "item.status" client/src/pages/dashboard.tsx`
  returning matches only inside `BillTable` and the two `useMemo`/filter
  blocks named in Scope.

## Maintenance notes

- If `upcoming.tsx`'s separate 4-value status model (`paid`/`overdue`/
  `pending`/`upcoming`, see `upcoming.tsx:59-70`) and this plan's tiering
  ever need to be unified into one shared concept, that's a bigger
  follow-up plan — don't attempt it here, the two views have different
  granularity needs (month-grid vs. flat table).
- The 3/14-day thresholds in `getUrgencyDisplay` are a starting judgment
  call, not derived from any existing repo convention — if the owner wants
  them tuned after using it for a while, it's a one-function, two-constant
  change.
- If a `status` value other than `"paid" | "pending" | "overdue"` is ever
  added to `BillStatusItem` (see the out-of-scope note above), `getUrgencyDisplay`'s
  three `if` branches need a 4th case or its final `return` (currently
  reached only by `"pending"` beyond 14 days) will incorrectly also catch
  the new value.
