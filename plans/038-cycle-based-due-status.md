# Plan 038: Replace day-count status tiers with billing-cycle membership

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 696beec..HEAD -- client/src/pages/dashboard.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (supersedes plan 037's `getUrgencyDisplay`, already merged to `main`)
- **Category**: bug (UX / information accuracy)
- **Planned at**: commit `696beec`, 2026-09-01

## Why this matters

Plan 037 replaced the flat "Pending" badge with day-count tiers (0-3 days
"Due Today"/"Due in Nd", 4-14 days "Upcoming", 15+ days "Scheduled"). The
owner tried it live and found it recreates the exact same flatness one
threshold later: within the *same* monthly-bills table, bills due Oct 1,
Oct 8, Oct 11, and Oct 17 (all 30-47 days out, while today is September)
all show "Scheduled" — no differentiation. Same problem in the annual
table, where bills due anywhere from Nov 2026 to Jun 2027 all show
"Scheduled".

The real issue isn't visual weight or day-count granularity — it's that
day-count is the wrong axis entirely. The owner's actual mental model,
confirmed directly: BillFlow already separates bills into a monthly-cycle
table and a yearly-cycle table. What's actually useful to know at a glance
is **whether a given bill still owes something in the *current* cycle
(this calendar month for monthly bills, this calendar year for yearly
bills), or whether it's already settled for this cycle and the next charge
is in a future one**. Concretely: `RCU: Mortgage` showing "Oct 1" as its
next unpaid due date means September's mortgage payment is already paid —
the bill has nothing outstanding *this* cycle. That's a meaningfully
different, more accurate fact than "it's somewhere in the pending bucket,"
and it's exactly what a bill tracker should surface.

This plan throws out the day-count tiers from 037 and replaces them with a
cycle-membership check: is the item's due date in the bill's *current*
billing period, or a future one.

## Current state

Relevant file: `client/src/pages/dashboard.tsx` — same file plan 037
touched. This plan replaces 037's `getUrgencyDisplay` function body and
prunes its now-unused import; the badge render site itself
(`BillTable`'s `<Badge>` JSX) already calls `getUrgencyDisplay(item)`
generically and needs no change.

`client/src/pages/dashboard.tsx:16` (today — `differenceInCalendarDays`
was added by plan 037 for the day-count math this plan removes; `isSameMonth`/`isSameYear`
are already imported here and currently unused anywhere in the file —
confirmed via `grep -n "isSameMonth\|isSameYear" client/src/pages/dashboard.tsx`
matching only this import line):

```ts
import { startOfMonth, endOfMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay, format, differenceInCalendarDays } from "date-fns";
```

`client/src/pages/dashboard.tsx:58-76` (today — plan 037's function, being
replaced by this plan):

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

`client/src/pages/dashboard.tsx:45-51` (the type — unchanged by this plan,
same as it was for 037; `bill.frequency` is what this plan's cycle check
keys on, already present on every `Bill`):

```ts
type BillStatusItem = {
  bill: Bill;
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
};
```

`client/src/pages/dashboard.tsx:200-206` (today — the badge render site
inside `BillTable`, unchanged by this plan, shown for reference only —
already calls `getUrgencyDisplay(item)` and needs no edit):

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

`client/src/pages/dashboard.tsx:470` (the status filter — reads
`item.status` directly, not the display label; unaffected by this plan,
same as it was unaffected by 037):

```ts
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
```

Owner-confirmed wording for this plan (from conversation, not to be
re-litigated by the executor): current-cycle unpaid items should read
**"Due"** (not "Due This Month"/"Due This Year" — the owner explicitly
said no dates or cycle names in the label, since the Due Date column
already shows the exact date); future-cycle unpaid items should read
**"Next Cycle"**.

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exits 0 |
| Tests     | `pnpm test`   | all pass (this plan adds no test files) |
| Dev server | `pnpm dev`   | boots without error; used for manual verification |

## Scope

**In scope** (the only file you should modify):
- `client/src/pages/dashboard.tsx`

**Out of scope** (do NOT touch, even though related):
- Everything named out-of-scope in plan 037 still applies here unchanged:
  `BillStatusItem.status` and every place that reads it for
  filtering/counting/sorting (`statusFilter`/`matchesStatus` at line 470,
  `overdueCount`, `totalPaid`/`totalPending`, the `status` case in
  `sortData`, the "All/Pending/Paid/Overdue" filter pills) — all keep
  reading the same 3-value `status` field, untouched. Do not add a new
  `status` value or filter pill for "next cycle."
- `getStatus()` (the paid/pending/overdue derivation itself, and what
  `item.dueDate` resolves to) — unrelated to this plan, which only changes
  what label/color renders for `"pending"` items.
- `client/src/pages/upcoming.tsx` — has its own separate status model for
  its month-grid view, out of scope, same as it was for 037.
- The badge render JSX itself (lines 200-206) — already generic, calls
  `getUrgencyDisplay(item)`, needs no edit.

## Git workflow

- Branch: `advisor/038-cycle-based-due-status`
- Commit per step or per logical unit. Message style: imperative,
  capitalized sentences, no conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Drop the now-unused `differenceInCalendarDays` import

Change `client/src/pages/dashboard.tsx:16` from:

```ts
import { startOfMonth, endOfMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay, format, differenceInCalendarDays } from "date-fns";
```

to:

```ts
import { startOfMonth, endOfMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay, format } from "date-fns";
```

(`isSameMonth`/`isSameYear` were already present in this import before
this plan and were unused — Step 2 puts them to use. `startOfDay` stays;
it's used elsewhere in this file beyond `getUrgencyDisplay`.)

**Verify**: `pnpm check` → exits 0.

### Step 2: Rewrite `getUrgencyDisplay` to key on billing-cycle membership instead of day-count

Replace `client/src/pages/dashboard.tsx:58-76` (the full function body
shown in "Current state" above) with:

```tsx
function getUrgencyDisplay(item: BillStatusItem): { label: string; className: string } {
  if (item.status === "paid") {
    return { label: "Paid", className: "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" };
  }
  if (item.status === "overdue") {
    return { label: "Overdue", className: "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/20" };
  }
  const today = new Date();
  const isCurrentCycle = item.bill.frequency === "monthly"
    ? isSameMonth(item.dueDate, today) && isSameYear(item.dueDate, today)
    : isSameYear(item.dueDate, today);
  if (isCurrentCycle) {
    return { label: "Due", className: "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20" };
  }
  return { label: "Next Cycle", className: "text-muted-foreground bg-background border-border" };
}
```

Notes on the logic, for the executor's own sanity-check before moving on:

- `paid`/`overdue` branches are byte-for-byte unchanged from 037 — same
  labels, same colors. This plan only changes the `"pending"` case.
- Monthly bills: current cycle means the due date falls in the current
  calendar month *and* year (`isSameMonth` alone doesn't check year —
  both are needed so a monthly bill due next September in a future year
  isn't mistaken for "this cycle").
- Yearly bills: current cycle means the due date falls in the current
  calendar year — matches the owner's framing ("annual items not due until
  2027" vs. items still due within 2026).
- The amber color for "Due" and the muted `text-muted-foreground
  bg-background border-border` combination for "Next Cycle" are both reused
  verbatim from 037 (037's near-term amber tier and its far-tier muted
  style respectively) — no new colors introduced.

**Verify**: `pnpm check` → exits 0. `grep -n '"Due"' client/src/pages/dashboard.tsx` → at least 1 match. `grep -n '"Next Cycle"' client/src/pages/dashboard.tsx` → 1 match. `grep -n "differenceInCalendarDays" client/src/pages/dashboard.tsx` → no matches (confirms Step 1's import prune and this step's rewrite are both fully applied, no leftover references).

## Test plan

No new automated tests — same rationale as plan 037: this repo's Vitest
harness (`shared/date-utils.test.ts`) covers pure date-math functions only,
with no React rendering setup. `getUrgencyDisplay` remains a good future
candidate to backfill if React Testing Library is ever added — it's a pure
function taking a `BillStatusItem` and returning `{ label, className }`;
worthwhile cases would include a monthly bill due later this month, one
due next month, one due next month *next year* (to confirm the
`isSameYear` check matters), a yearly bill due later this year, and one
due next year.

Verify manually instead, against a live `pnpm dev`:

1. Confirm a monthly bill due later in the current calendar month shows
   "Due" with the amber badge.
2. Confirm a monthly bill whose next unpaid due date has already rolled
   into next month (e.g. this session's `RCU: Mortgage`, due Oct 1 while
   today is in September) shows "Next Cycle" with the muted badge, not
   amber.
3. Confirm a yearly bill due later in the current calendar year (e.g. this
   session's `Integrity: Home Insurance`, due Dec 2026) shows "Due".
4. Confirm a yearly bill due in a future calendar year (e.g. this
   session's `Mint Mobile: Travis`/`Mint Mobile: Erin`, due Jun 2027) shows
   "Next Cycle".
5. Confirm a paid bill still shows "Paid" in emerald, and an overdue bill
   still shows "Overdue" in rose — both unchanged.
6. Confirm the "All / Pending / Paid / Overdue" filter pills still work
   exactly as before — clicking "Pending" still shows every unpaid,
   not-yet-due bill regardless of its "Due"/"Next Cycle" tier.
7. Confirm the Dashboard's overdue count/banner is unchanged (still counts
   by the underlying `status`, not the new labels).
8. No test bill needs to be created/cleaned up for this plan — the owner's
   existing real bills already cover every case above, per this session's
   screenshots.

**Verify**: all 8 observations above hold as described.

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (unchanged pass count — this plan adds no test files)
- [ ] `grep -n "differenceInCalendarDays" client/src/pages/dashboard.tsx` → no matches
- [ ] `grep -n '"Due Today"' client/src/pages/dashboard.tsx` → no matches (confirms plan 037's day-count labels are fully gone, not left dead in the file)
- [ ] `grep -n '"Scheduled"' client/src/pages/dashboard.tsx` → no matches
- [ ] `grep -n '"Next Cycle"' client/src/pages/dashboard.tsx` → 1 match
- [ ] `grep -n 'statusFilter === "all" || item.status === statusFilter'` → 1 match in `client/src/pages/dashboard.tsx` (unchanged, confirms filter logic untouched)
- [ ] No files outside `client/src/pages/dashboard.tsx` modified (`git status`)
- [ ] All 8 manual observations confirmed live
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt above doesn't match the live code at that
  location (drift since this plan was written).
- `BillStatusItem` or `getStatus()` have changed shape since this plan was
  written such that `item.dueDate` for a `"pending"` item no longer
  reliably reflects "the next unpaid occurrence's due date" — the cycle
  check in Step 2 assumes that invariant (same one plan 037 relied on).
- `pnpm check` reports new errors you can't resolve in one reasonable fix
  attempt.
- You find a second badge-rendering site for bill status elsewhere in
  `dashboard.tsx` beyond `BillTable` — this plan assumes exactly one, same
  as plan 037 confirmed.

## Maintenance notes

- This plan intentionally supersedes plan 037's tiering logic rather than
  extending it — 037's file/entry in `plans/README.md` stays as a DONE
  historical record of what shipped and was then revised; do not edit
  037's plan file itself.
- If the owner later wants finer granularity *within* "Due" (e.g.
  distinguishing "due this week" from "due later this month"), that's a
  legitimate future refinement, but per this session's explicit direction
  keep it out of this plan — the owner asked for exactly two pending-state
  labels, "Due" and "Next Cycle," no dates or cycle names embedded in the
  text.
- If a bill's frequency ever gains a third value beyond `"monthly"` /
  `"yearly"` (see `shared/schema.ts`'s `bills.frequency` enum), the
  ternary in Step 2 needs a third branch — it currently assumes exhaustive
  binary frequency, matching the rest of this codebase's assumption (e.g.
  `dashboard.tsx`'s existing `item.bill.frequency === "yearly"` checks
  elsewhere in `BillTable`).
