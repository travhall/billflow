# Plan 027 (direction spike): Wire budget-overage into the existing notification pipeline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- client/src/lib/notifications.ts client/src/App.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters (direction rationale)

`analytics.tsx` already computes `isOver`/`isNear` per category (spend vs.
`monthlyLimit`) — it just uses that boolean only to color a progress bar
on a page the user has to remember to open. `notifications.ts` already
has a complete, working browser-notification pipeline: permission
handling, a per-day dedup pattern via `localStorage`
(`getLastNotifiedKey`/`wasNotifiedToday`/`markNotifiedToday`), and
`checkAndSendReminders()`, called on every app load via `App.tsx`'s
`NotificationRunner`. The entire point of setting a category budget limit
is to notice overspend early — right now the only way to find out is to
open Analytics and look. This plan connects two pieces of already-working
infrastructure that were built independently and never wired together.
Grounding: HIGH confidence — both pieces exist and are read directly, this
isn't a speculative "add a notification system" ask.

## Current state

`client/src/lib/notifications.ts:65-115` — `checkAndSendReminders`, the
existing pipeline this plan extends (currently only checks bill due
dates, never budgets):
```ts
export function checkAndSendReminders(bills: Bill[], payments: Payment[]) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const today = startOfDay(new Date());
  for (const bill of bills) {
    // ... due-date / overdue notification logic, unrelated to budgets
  }
}
```
The reusable dedup helpers in the same file:
```ts
function getLastNotifiedKey(billId: number, type: "reminder" | "overdue"): string {
  return `billflow_notified_${type}_${billId}`;
}
function wasNotifiedToday(key: string): boolean { /* ... */ }
function markNotifiedToday(key: string) { /* ... */ }
function sendNotification(title: string, body: string, tag: string) { /* ... */ }
```

`client/src/App.tsx:18-29` — `NotificationRunner`, which already fetches
bills and payments and calls `checkAndSendReminders` on every app load:
```tsx
function NotificationRunner() {
  const { data: bills } = useQuery<Bill[]>({ queryKey: ["/api/bills"] });
  const { data: payments } = useQuery<Payment[]>({ queryKey: ["/api/payments"] });

  useEffect(() => {
    if (bills && payments) {
      checkAndSendReminders(bills, payments);
    }
  }, [bills, payments]);

  return null;
}
```
This component does not currently fetch budgets — this plan adds that.

`client/src/pages/analytics.tsx:150-161,297-300` — the existing spend-vs-
limit computation this plan reuses (category totals for the current
month, and the `isOver` boolean derived from them):
```ts
const thisMonthByCategory = new Map<string, number>();
paidPayments.forEach(p => {
  if (!p.paidDate) return;
  const d = parseISO(p.paidDate as unknown as string);
  if (isWithinInterval(d, { start: thisMonthStart, end: thisMonthEnd })) {
    const cat = billMap.get(p.billId)?.category ?? "Other";
    thisMonthByCategory.set(cat, (thisMonthByCategory.get(cat) ?? 0) + Number(p.amount));
  }
});
// ...
const limit = budget ? Number(budget.monthlyLimit) : null;
const isOver = limit !== null && spent > limit;
```

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

## Scope

**In scope**:
- `client/src/lib/notifications.ts` — add a `checkBudgetOverages` function
  reusing the existing dedup/send helpers.
- `client/src/App.tsx` — `NotificationRunner`, fetch budgets and call the
  new function.

**Out of scope**:
- Any change to `analytics.tsx`'s own rendering — it keeps computing
  `isOver` for its own UI purposes independently; this plan doesn't
  refactor Analytics to share code with `notifications.ts`'s
  category-total computation, since the two run in different contexts
  (Analytics only computes for the categories it renders; the
  notification check needs to run on every app load, computed
  independently, reusing the concept but not the exact code).
- Any change to how budgets are created/edited/deleted.

## Git workflow

- Branch: `advisor/027-budget-overage-notifications`
- Commit per step; message style matches repo history. Suggested message:
  `Notify when a category budget limit is exceeded`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `checkBudgetOverages` to `notifications.ts`

Add to `client/src/lib/notifications.ts`, after the existing
`checkAndSendReminders`:

```ts
import type { CategoryBudget } from "@shared/schema";
// ...
function getBudgetNotifiedKey(category: string): string {
  return `billflow_notified_budget_${category}`;
}

export function checkBudgetOverages(payments: Payment[], bills: Bill[], budgets: CategoryBudget[]) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (budgets.length === 0) return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const billMap = new Map(bills.map(b => [b.id, b]));
  const spendByCategory = new Map<string, number>();

  for (const p of payments) {
    if (p.status !== "paid" || !p.paidDate) continue;
    const paidDate = new Date(p.paidDate as unknown as string);
    if (paidDate < monthStart) continue;
    const category = billMap.get(p.billId)?.category ?? "Other";
    spendByCategory.set(category, (spendByCategory.get(category) ?? 0) + Number(p.amount));
  }

  for (const budget of budgets) {
    const spent = spendByCategory.get(budget.category) ?? 0;
    const limit = Number(budget.monthlyLimit);
    if (spent <= limit) continue;

    const key = getBudgetNotifiedKey(budget.category);
    if (wasNotifiedToday(key)) continue;

    sendNotification(
      `📊 Budget Exceeded: ${budget.category}`,
      `You've spent $${spent.toFixed(2)} this month, over your $${limit.toFixed(2)} limit.`,
      `budget-${budget.category}`
    );
    markNotifiedToday(key);
  }
}
```

Note this recomputes category spend independently from `analytics.tsx`
(intentionally — see Scope's Out-of-scope note) using the same
`Number(...)` summation pattern already present elsewhere in this
codebase; if `plans/006-cents-safe-money-summation.md` has been applied,
consider using `sumAmounts` here too for consistency, but it's not
required for this plan's correctness at typical bill amounts.

**Verify**: `pnpm check` → exit 0.

### Step 2: Call it from `NotificationRunner`

In `client/src/App.tsx`, update `NotificationRunner`:

```tsx
import { checkAndSendReminders, checkBudgetOverages } from "@/lib/notifications";
import type { Bill, Payment, CategoryBudget } from "@shared/schema";

function NotificationRunner() {
  const { data: bills } = useQuery<Bill[]>({ queryKey: ["/api/bills"] });
  const { data: payments } = useQuery<Payment[]>({ queryKey: ["/api/payments"] });
  const { data: budgets } = useQuery<CategoryBudget[]>({ queryKey: ["/api/budgets"] });

  useEffect(() => {
    if (bills && payments) {
      checkAndSendReminders(bills, payments);
    }
    if (bills && payments && budgets) {
      checkBudgetOverages(payments, bills, budgets);
    }
  }, [bills, payments, budgets]);

  return null;
}
```

**Verify**: `pnpm check` → exit 0.

### Step 3: Manually verify the notification fires

With `pnpm dev` running and notifications already granted (per this
repo's existing permission flow — enable via any bill's edit dialog if
not already granted):
1. Set a category budget limit lower than that category's current
   month-to-date spend (or mark a bill paid to push spend over an
   existing limit).
2. Reload the app.
3. Confirm a "📊 Budget Exceeded" notification appears.
4. Reload again immediately — confirm it does NOT fire a second time
   today (dedup working, matching the existing due-date reminder
   pattern's behavior).

**Verify**: notification fires once per category per day, matching the
existing dedup pattern's tested behavior for due-date reminders.

## Test plan

- No automated test framework exists (browser Notification API isn't
  easily unit-testable without mocking, and this repo has no such mocks
  set up). Verification is the manual flow in Step 3.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -n "checkBudgetOverages" client/src/lib/notifications.ts client/src/App.tsx` shows both files reference it
- [ ] Manual Step 3 confirms the notification fires once per category per day
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.
- The manual test shows duplicate notifications firing more than once per
  day per category — the dedup key logic needs to be re-checked against
  the existing `wasNotifiedToday`/`markNotifiedToday` pattern rather than
  reinvented.

## Maintenance notes

- If budget categories are ever renamed, note that `getBudgetNotifiedKey`
  keys on category name (a string), matching how `categoryBudgets.category`
  is keyed in the schema (`text("category").notNull().unique()`) — a
  rename would reset the dedup state for that category, which is harmless
  (worst case: one extra notification that day).
