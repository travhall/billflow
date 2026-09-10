# 053 — Calendar view with payday marker

**Priority:** P2 (new feature, user-requested)
**Effort:** M
**Risk:** LOW
**Depends on:** —
**Status:** TODO

## Problem

Dashboard's "Total Monthly Budget" card has no value for a single-user
personal tracker — there's no target to compare against, just a sum of
this month's bills. User wants it replaced with something that actually
helps: a calendar view. The existing table views (Dashboard, Upcoming,
History) are good for status/sorting but bad for "what's hitting this
week" — a spatial/temporal question a table can't answer well.

Scope, per user: **simple only**. One month-grid calendar showing bill
due dates, plus a marker for payday (recurring every-other-Friday, but
must support future schedule changes). No pay-period clustering/bucketing
of bills against paychecks — that's a possible future iteration, not this
one.

## Design

### Data model

Add a `paySchedules` table (singleton row for now, but shaped to not
preclude multiple in the future — irrelevant for a single-user app, just
avoids a schema migration if that ever changes):

```ts
export const paySchedules = pgTable("pay_schedules", {
  id: serial("id").primaryKey(),
  anchorDate: timestamp("anchor_date").notNull(), // one confirmed payday
  intervalDays: integer("interval_days").notNull(), // 14 for biweekly
});
```

Payday occurrences are derived, not stored: `anchorDate + n * intervalDays`
for any `n`, both directions from anchor. This lets the user redefine
their schedule later (new job, different cadence) by editing the one row
— old paydays before the edit aren't retroactively wrong since nothing
else references them.

No new table for bill due dates — those already come from `bills` +
`payments` (`payments.dueDate`), same source Dashboard/Upcoming use.

### API

- `GET /api/pay-schedule` — returns the current row or `null` if unset.
- `PUT /api/pay-schedule` — upserts `{ anchorDate, intervalDays }`.
- Add both to `shared/routes.ts`'s typed contract (don't repeat the
  budgets/reset precedent of leaving new endpoints uncontracted — see
  `plans/014-unify-api-contract.md`).

### Client

- New page `client/src/pages/calendar.tsx`, route `/calendar`, nav link
  added alongside Dashboard/Upcoming/History/Analytics.
- Month-grid (reuse whatever date-grid approach `upcoming.tsx` already
  uses for its month view — check before introducing a second pattern or
  a new date-grid dependency).
- Each day cell: small marker per bill due that day (dot or label,
  color/icon by category consistent with existing badges), plus a
  distinct payday marker (e.g. `$` icon or highlighted border) on
  computed payday occurrences within the visible month.
- Click a day → popover/panel listing that day's bills (name, amount,
  status) — reuse existing status badge component.
- First-run empty state when no pay schedule is set: inline form (date
  picker + interval, default 14) rather than a separate settings page —
  this is a single field, doesn't warrant new navigation.
- New hook `client/src/hooks/use-pay-schedule.ts`, TanStack Query,
  mirroring `use-budgets.ts`'s shape.

### Out of scope (explicitly, per user)

- Pay-period bucketing/clustering of bills ("this paycheck covers X, Y, Z
  totaling $N").
- Removing/replacing the Dashboard budget card — that's a separate
  decision the user hasn't made yet; this plan only adds the calendar as
  a new page. (Flag to user once this ships: now that a calendar exists,
  is the budget card still worth removing, and if so with what replacing
  it there, if anything.)
- Multiple pay schedules, variable per-paycheck amounts, income tracking.

## Steps

1. Schema: add `paySchedules` table + Zod schema to `shared/schema.ts`.
   `pnpm db:push`.
2. Server: `server/storage.ts` — `getPaySchedule` / `upsertPaySchedule`.
   `server/routes.ts` — GET/PUT handlers.
3. Shared contract: add `api.paySchedule.*` to `shared/routes.ts`.
4. Client hook: `use-pay-schedule.ts`.
5. Date math: pure helper (e.g. `shared/date-utils.ts` if that's still
   the shared home per plan 001, else `client/src/lib/`) —
   `getPaydaysInMonth(schedule, year, month): Date[]`.
6. Page: `calendar.tsx` — month grid, bill markers, payday markers, day
   click panel, empty-state schedule form.
7. Route + nav link in `client/src/App.tsx` and wherever the sidebar nav
   list lives.
8. `pnpm check` — no new errors vs. baseline.
9. Manual verification in browser: bills render on correct due dates
   across a month boundary, payday markers land on the right Fridays,
   editing the schedule updates future markers, day-click panel shows
   correct bills.

## Notes

- `intervalDays` as a raw integer (not an enum like "biweekly") is
  deliberate — it's the simplest thing that supports "every other Friday"
  today and any other fixed cadence later without a schema change.
- No `dayOfWeek` field: the anchor date's own weekday is the schedule's
  weekday, so it doesn't need to be stored separately.
