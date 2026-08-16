# Plan 001: Unify due-date calculation into one clamped, shared function

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- server/storage.ts client/src/lib/notifications.ts client/src/pages/dashboard.tsx client/src/pages/upcoming.tsx`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on
> a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

BillFlow is a bill/payment tracker; its entire value proposition is showing
the correct due date for every bill. The due date for a given billing cycle
is currently computed independently in **four places**, and only one of
them handles month-end days (29th–31st) correctly. `Date.setMonth()` and
`Date.setFullYear()` overflow into the *next* month when the target month
is shorter than the current day-of-month — e.g. `new Date(2026, 0, 31)`
(Jan 31) with `.setMonth(1)` (add one month) silently becomes March 3, not
February 28. A bill due on the 31st (this app's own seed data includes
"Rent" due on day 1, but any user-added bill on 29–31 hits this) will
report a different due date on the dashboard than in the browser
notification, and the server's own auto-pay rollover can skip or misdate a
cycle. `client/src/pages/upcoming.tsx` already contains the correct,
clamped implementation — this plan ports that logic into one shared
function and points every call site at it.

## Current state

- `server/storage.ts` — `resetPayment()` (lines 94-120) computes the next
  billing cycle's due date. This is the function invoked after every
  mark-paid action and by the server's auto-pay sweep.
  ```ts
  // server/storage.ts:101-110
  const currentDueDate = new Date(payment.dueDate);
  let nextDueDate: Date;

  if (bill.frequency === "monthly") {
    nextDueDate = new Date(currentDueDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
  } else {
    nextDueDate = new Date(currentDueDate);
    nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
  }
  ```
  No clamping — this is the buggy version.

- `client/src/lib/notifications.ts` — `getBillDueDate()` (lines 28-33),
  used by `checkAndSendReminders()` to decide whether to fire a browser
  notification:
  ```ts
  // client/src/lib/notifications.ts:28-33
  function getBillDueDate(bill: Bill, today: Date): Date {
    if (bill.frequency === "yearly" && bill.dueMonth) {
      return setMonth(setDate(new Date(today.getFullYear(), 0, 1), bill.dueDay), bill.dueMonth - 1);
    }
    return setDate(startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)), bill.dueDay);
  }
  ```
  `date-fns`'s `setDate`/`setMonth` wrap the same native `Date` methods and
  overflow identically — no clamping.

- `client/src/pages/dashboard.tsx` — inline in `processedData`'s
  `getStatus()` closure (lines 134-138), duplicating the same unclamped
  formula a third time:
  ```ts
  // client/src/pages/dashboard.tsx:135-138
  let currentPeriodDueDate = setDate(currentMonthStart, bill.dueDay);
  if (bill.frequency === "yearly" && bill.dueMonth) {
    currentPeriodDueDate = setMonth(setDate(new Date(today.getFullYear(), 0, 1), bill.dueDay), bill.dueMonth - 1);
  }
  ```

- `client/src/pages/upcoming.tsx` — `getMonthDueDate()` (lines 23-35) is
  the **only correct** version; it clamps `dueDay` to the actual number of
  days in the target month before constructing the date:
  ```ts
  // client/src/pages/upcoming.tsx:23-35
  function getMonthDueDate(bill: Bill, monthDate: Date): Date | null {
    if (bill.frequency === "monthly") {
      const day = Math.min(bill.dueDay, new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate());
      return setDate(startOfMonth(monthDate), day);
    }
    if (bill.frequency === "yearly" && bill.dueMonth) {
      if (bill.dueMonth === monthDate.getMonth() + 1) {
        const day = Math.min(bill.dueDay, new Date(monthDate.getFullYear(), bill.dueMonth, 0).getDate());
        return new Date(monthDate.getFullYear(), bill.dueMonth - 1, day);
      }
    }
    return null;
  }
  ```
  `new Date(year, month, 0).getDate()` is the standard JS idiom for "last
  day of `month - 1`" — this is the pattern to standardize on.

- Schema context: `bills.dueDay` is `integer` 1-31, `bills.dueMonth` is
  `integer` 1-12 (nullable, only used when `frequency === "yearly"`). See
  `shared/schema.ts:16-28`.

- Repo conventions: shared, framework-agnostic logic used by both
  `client/` and `server/` belongs in `shared/` per the existing pattern of
  `shared/schema.ts` and `shared/routes.ts` (both imported via the
  `@shared/*` path alias defined in `tsconfig.json:16-19`). No `shared/`
  utility module exists yet for date logic — this plan creates the first
  one.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm check`     | exit 0, no errors   |
| Dev run   | `pnpm dev`       | server logs "serving on port 5000" (or `$PORT`) |

No test runner exists in this repo (`package.json` has no `test` script).
Verification below uses a standalone script run via `tsx` and, where noted,
manual HTTP checks against the running dev server — this repo has no
automated test harness to lean on, so be exact about running the commands
as written.

## Scope

**In scope**:
- `shared/date-utils.ts` (create)
- `server/storage.ts` (replace `resetPayment`'s inline calculation)
- `client/src/lib/notifications.ts` (replace `getBillDueDate`)
- `client/src/pages/dashboard.tsx` (replace the inline `currentPeriodDueDate` calculation)
- `client/src/pages/upcoming.tsx` (replace `getMonthDueDate`'s body with a call to the shared function — keep the function name/signature so its two call sites at lines 58 and 197 don't need to change)

**Out of scope**:
- Any change to `bills`/`payments` schema or migrations.
- The auto-pay transaction/query issues in `server/storage.ts:getPayments()` — covered by `plans/002-atomic-autopay-rollover.md`.
- Any UI/styling change.

## Git workflow

- Branch: `advisor/001-unify-due-date-calculation`
- Commit per step; message style matches this repo's history (imperative,
  capitalized, no conventional-commit prefix required — e.g. `git log`
  shows messages like "Fix overdue status display for manually paid
  bills"). Suggested message: `Fix due-date drift on days 29-31 by unifying date calculation`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the shared due-date function

Create `shared/date-utils.ts`:

```ts
export interface DueDateInput {
  frequency: "monthly" | "yearly";
  dueDay: number;
  dueMonth?: number | null;
}

/**
 * Computes the due date for the billing cycle that contains (or starts
 * at) `referenceDate`. `dueDay` is clamped to the actual number of days
 * in the target month so days 29-31 never overflow into the next month.
 */
export function getDueDateForMonth(bill: DueDateInput, referenceDate: Date): Date | null {
  const year = referenceDate.getFullYear();

  if (bill.frequency === "monthly") {
    const month = referenceDate.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const day = Math.min(bill.dueDay, lastDayOfMonth);
    return new Date(year, month, day);
  }

  if (bill.frequency === "yearly" && bill.dueMonth) {
    const targetMonth = bill.dueMonth - 1; // dueMonth is 1-12
    const lastDayOfMonth = new Date(year, targetMonth + 1, 0).getDate();
    const day = Math.min(bill.dueDay, lastDayOfMonth);
    return new Date(year, targetMonth, day);
  }

  return null;
}

/**
 * Computes the next cycle's due date given the current cycle's due date
 * and the bill's frequency. Used when rolling a payment forward.
 */
export function getNextCycleDueDate(currentDueDate: Date, frequency: "monthly" | "yearly"): Date {
  if (frequency === "monthly") {
    const year = currentDueDate.getFullYear();
    const month = currentDueDate.getMonth() + 1; // next month, 0-indexed carries into getDueDateForMonth
    const nextMonthDate = new Date(year, month, 1);
    const lastDayOfNextMonth = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, 0).getDate();
    const day = Math.min(currentDueDate.getDate(), lastDayOfNextMonth);
    return new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), day);
  }
  // yearly: Feb 29 -> Feb 28/29 next year, clamped the same way
  const nextYear = currentDueDate.getFullYear() + 1;
  const lastDayOfMonth = new Date(nextYear, currentDueDate.getMonth() + 1, 0).getDate();
  const day = Math.min(currentDueDate.getDate(), lastDayOfMonth);
  return new Date(nextYear, currentDueDate.getMonth(), day);
}
```

**Verify**: `pnpm check` → exit 0 (this file has no external dependencies
beyond built-in `Date`, so it should typecheck immediately).

### Step 2: Prove the function is correct with a standalone script

Create a temporary file at the repo root, `verify-date-utils.ts` (do NOT
commit this file — delete it after Step 2 passes):

```ts
import { getDueDateForMonth, getNextCycleDueDate } from "./shared/date-utils";

const cases: [string, () => boolean][] = [
  ["Jan 31 monthly rollover clamps to Feb 28 (non-leap)", () => {
    const next = getNextCycleDueDate(new Date(2026, 0, 31), "monthly");
    return next.getFullYear() === 2026 && next.getMonth() === 1 && next.getDate() === 28;
  }],
  ["Jan 31 monthly rollover clamps to Feb 29 (leap year 2028)", () => {
    const next = getNextCycleDueDate(new Date(2028, 0, 31), "monthly");
    return next.getFullYear() === 2028 && next.getMonth() === 1 && next.getDate() === 29;
  }],
  ["dueDay 31 in a 30-day month clamps correctly", () => {
    const due = getDueDateForMonth({ frequency: "monthly", dueDay: 31 }, new Date(2026, 3, 1)); // April
    return due !== null && due.getMonth() === 3 && due.getDate() === 30;
  }],
  ["yearly bill on Feb 29 clamps in a non-leap year", () => {
    const due = getDueDateForMonth({ frequency: "yearly", dueDay: 29, dueMonth: 2 }, new Date(2027, 1, 1));
    return due !== null && due.getMonth() === 1 && due.getDate() === 28;
  }],
];

let failed = 0;
for (const [name, fn] of cases) {
  const ok = fn();
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) failed++;
}
process.exit(failed > 0 ? 1 : 0);
```

**Verify**: `pnpm tsx verify-date-utils.ts` → all 4 lines print `PASS`,
exit code 0. Delete `verify-date-utils.ts` after this passes — it must not
be committed.

### Step 3: Replace `resetPayment`'s inline calculation

In `server/storage.ts`, replace lines 101-110 (the `currentDueDate`/
`nextDueDate` block) with:

```ts
import { getNextCycleDueDate } from "@shared/date-utils";
// ... inside resetPayment():
const currentDueDate = new Date(payment.dueDate);
const nextDueDate = getNextCycleDueDate(currentDueDate, bill.frequency);
```

Add the import at the top of `server/storage.ts` alongside the existing
`@shared/schema` import.

**Verify**: `pnpm check` → exit 0.

### Step 4: Replace `notifications.ts`'s `getBillDueDate`

In `client/src/lib/notifications.ts`, replace the body of `getBillDueDate`
(lines 28-33) to call the shared function instead:

```ts
import { getDueDateForMonth } from "@shared/date-utils";
// ...
function getBillDueDate(bill: Bill, today: Date): Date {
  const due = getDueDateForMonth(bill, today);
  // Fallback: yearly bill with no dueMonth set (shouldn't happen per schema,
  // but getDueDateForMonth returns null in that case) — keep today's
  // original monthly-shaped fallback for safety.
  return due ?? setDate(startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)), bill.dueDay);
}
```

Keep the `setDate`/`startOfDay` import from `date-fns` only if still used
elsewhere in the file; otherwise remove the now-unused imports.

**Verify**: `pnpm check` → exit 0.

### Step 5: Replace `dashboard.tsx`'s inline calculation

In `client/src/pages/dashboard.tsx`, replace lines 135-138:

```ts
import { getDueDateForMonth } from "@shared/date-utils";
// ...
const currentPeriodDueDate = getDueDateForMonth(bill, today) ?? currentMonthStart;
```

Remove the now-redundant `setDate`/`setMonth` calls at this call site only
if they are not used elsewhere in the file (check before removing the
`date-fns` import — `dashboard.tsx` uses `startOfMonth`, `endOfMonth`, etc.
elsewhere, so only drop `setDate`/`setMonth` from the import list if a
`grep -n "setDate\|setMonth" client/src/pages/dashboard.tsx` after this
edit shows zero remaining uses).

**Verify**: `pnpm check` → exit 0.

### Step 6: Point `upcoming.tsx`'s `getMonthDueDate` at the shared function

In `client/src/pages/upcoming.tsx`, replace the body of `getMonthDueDate`
(lines 23-35) with a direct call to `getDueDateForMonth` from
`shared/date-utils.ts`, keeping the existing function name/signature so
its callers at lines 58 and 197 need no change:

```ts
import { getDueDateForMonth } from "@shared/date-utils";

function getMonthDueDate(bill: Bill, monthDate: Date): Date | null {
  return getDueDateForMonth(bill, monthDate);
}
```

**Verify**: `pnpm check` → exit 0. This file's own behavior should be
unchanged (it was already the correct implementation) — this step is
purely deduplication.

## Test plan

- No test framework exists in this repo. Verification for this plan relies on:
  1. The standalone script in Step 2, which directly exercises the
     day-29-31 edge cases that motivated this plan.
  2. `pnpm check` after every step (type safety across all 4 call sites).
  3. A manual smoke test: run `pnpm dev`, open the app, and confirm a bill
     with `dueDay: 31` (create one via the UI if none exists) shows the
     *same* due date on the Dashboard and the Upcoming page for a month
     where the two previously could have disagreed (e.g. February).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `verify-date-utils.ts`'s 4 cases all print `PASS` (run once, then delete the temp file — confirm with `git status` it is not tracked)
- [ ] `grep -rn "setMonth(nextDueDate.getMonth\|setFullYear(nextDueDate.getFullYear" server/storage.ts` returns no matches (confirms the old unclamped logic in `resetPayment` is gone)
- [ ] `grep -l "getDueDateForMonth\|getNextCycleDueDate" server/storage.ts client/src/lib/notifications.ts client/src/pages/dashboard.tsx client/src/pages/upcoming.tsx` lists all 4 files
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at any "Current state" excerpt above doesn't match what you find
  (the codebase has drifted since this plan was written).
- `pnpm check` fails after any step and the error isn't a straightforward
  missing-import issue.
- You discover a fifth call site computing due dates that this plan didn't
  account for — report it rather than silently including or excluding it.

## Maintenance notes

- Any future feature that needs "what's the due date for bill X in month
  Y" should call `getDueDateForMonth` from `shared/date-utils.ts` — do not
  reintroduce a fifth inline implementation.
- `plans/002-atomic-autopay-rollover.md` also touches `server/storage.ts`'s
  `resetPayment` region indirectly (it wraps the auto-pay call site in a
  transaction) — if both plans are executed, apply this one first, since
  002's excerpts assume this plan's `getNextCycleDueDate` call is already
  in place.
- A reviewer should specifically re-check the Feb 29/leap-year test case
  in Step 2, since leap-year handling is the easiest part of this fix to
  get subtly wrong.
