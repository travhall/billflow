# Plan 050: Deduplicate the oldest-unpaid-payment lookup in `getBillCycleStatus`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e4429a5..HEAD -- client/src/lib/bill-status.ts client/src/lib/bill-status.test.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `e4429a5`, 2026-09-04

## Why this matters

`getBillCycleStatus` (`client/src/lib/bill-status.ts`) computes "the
oldest unpaid payment for this bill" in two separate places with
identical logic: once inside the `"paid"` branch (to populate the
`nextCycle` preview added by plan 046), and once again in the fallback
branch a few lines below (the original `oldestUnpaid` lookup this
function has had since plan 040). Both are the exact same
`.filter(p => p.status !== "paid").sort((a, b) => ...)[0]` expression,
just assigned to differently-named locals. Harmless today, but it's the
kind of duplication that silently drifts the next time either copy gets
a tweak (e.g. a future change to how ties are broken) and nobody
remembers to update the other one. A five-line extraction removes the
duplication with no behavior change.

## Current state

Relevant files: `client/src/lib/bill-status.ts` (the function being
refactored) and `client/src/lib/bill-status.test.ts` (existing tests,
unchanged assertions, used as the regression check).

`client/src/lib/bill-status.ts` (today, full file):

```ts
import { isBefore, isSameMonth, isSameYear, parseISO, startOfMonth } from "date-fns";
import { getDueDateForMonth } from "@shared/date-utils";
import type { Bill, Payment } from "@shared/schema";

export type BillCycleStatus = {
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
  /**
   * When `status` is `"paid"`, this bill's next (already-created, still
   * unpaid) cycle payment — undefined only if none has been generated
   * yet, which shouldn't normally happen for a paid bill (see plan 044)
   * but is handled gracefully rather than assumed. Purely a display hint
   * for callers that want to show "what's next" instead of the stale
   * paid row — `status`/`dueDate`/`amount`/`paymentId` above always
   * describe the real, current-cycle paid payment regardless of this
   * field, and callers that need the true paid state (stats totals,
   * filters, the auto-pay-revert guard) must keep reading those, not this.
   */
  nextCycle?: { dueDate: Date; amount: string };
};

/**
 * Determines a bill's status for the current billing cycle.
 *
 * `resetPayment` auto-creates a next-cycle payment the moment a payment is
 * marked paid, so a fully-current bill always has a newer, still-unpaid
 * row sitting alongside its already-paid current-cycle row. Naively
 * picking "whichever payment has the latest due date" (the bug this
 * function replaces) always prefers that newer unpaid row, so a bill can
 * never report as paid once it's completed one rollover — it's
 * permanently one cycle behind. This function instead checks explicitly:
 * is there a paid payment covering the CURRENT cycle? If so, that's the
 * status, regardless of any newer unpaid row already sitting ahead of it.
 * Only if the current cycle has no paid payment does it fall through to
 * finding the oldest outstanding (unpaid) obligation — which correctly
 * surfaces a genuinely stale, still-overdue prior-cycle payment even if
 * no next-cycle row has been generated yet.
 */
export function getBillCycleStatus(bill: Bill, payments: Payment[], today: Date): BillCycleStatus {
  const billPayments = payments.filter(p => p.billId === bill.id);
  const isCurrentCycle = (dueDate: Date) =>
    bill.frequency === "monthly"
      ? isSameMonth(dueDate, today) && isSameYear(dueDate, today)
      : isSameYear(dueDate, today);

  const paidForCurrentCycle = billPayments.find(
    p => p.status === "paid" && isCurrentCycle(parseISO(p.dueDate as unknown as string))
  );
  if (paidForCurrentCycle) {
    const nextUnpaid = billPayments
      .filter(p => p.status !== "paid")
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    return {
      status: "paid",
      dueDate: parseISO(paidForCurrentCycle.dueDate as unknown as string),
      amount: paidForCurrentCycle.amount,
      paymentId: paidForCurrentCycle.id,
      nextCycle: nextUnpaid
        ? { dueDate: parseISO(nextUnpaid.dueDate as unknown as string), amount: nextUnpaid.amount }
        : undefined,
    };
  }

  const oldestUnpaid = billPayments
    .filter(p => p.status !== "paid")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  if (oldestUnpaid) {
    const dueDate = parseISO(oldestUnpaid.dueDate as unknown as string);
    return {
      status: isBefore(dueDate, today) ? "overdue" : "pending",
      dueDate,
      amount: oldestUnpaid.amount,
      paymentId: oldestUnpaid.id,
    };
  }

  const currentPeriodDueDate = getDueDateForMonth(bill, today) ?? startOfMonth(today);
  return {
    status: isBefore(currentPeriodDueDate, today) ? "overdue" : "pending",
    dueDate: currentPeriodDueDate,
    amount: bill.defaultAmount,
    paymentId: undefined,
  };
}
```

Note the two identical blocks: `nextUnpaid` (inside the `if
(paidForCurrentCycle)` branch) and `oldestUnpaid` (the fallback branch a
few lines later) — both `billPayments.filter(p => p.status !==
"paid").sort((a, b) => new Date(a.dueDate).getTime() - new
Date(b.dueDate).getTime())[0]`, byte-for-byte.

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exits 0 |
| Tests     | `pnpm test`   | all pass, same count as before (this is a pure refactor, no new test cases needed — the existing 9 already exercise both branches) |

## Scope

**In scope**:
- `client/src/lib/bill-status.ts`

**Out of scope** (do NOT touch, even though related):
- `client/src/lib/bill-status.test.ts` — no test changes needed; this is
  a behavior-preserving refactor, and the existing test suite (plans 040,
  046) already covers both the `"paid"`-with-`nextCycle` case and the
  fallback `oldestUnpaid` case. If any existing test fails after this
  refactor, that's a real regression — fix the refactor, don't touch the
  test to make it pass.
- `client/src/pages/dashboard.tsx` — consumes `BillCycleStatus` but this
  plan doesn't change its shape or field names, only the internal
  implementation of how one of its fields gets computed. No caller-side
  change needed.
- The function's exported name, signature, or return type — unchanged;
  this is purely an internal extraction.

## Git workflow

- Branch: `advisor/050-dedupe-oldest-unpaid-lookup`
- Commit message style: imperative, capitalized sentence, no
  conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract the shared lookup into a small helper, use it in both places

Replace the full `getBillCycleStatus` function body (the block shown in
"Current state" above, from `export function getBillCycleStatus(...)  {`
through its closing `}`) with:

```ts
function getOldestUnpaid(payments: Payment[]): Payment | undefined {
  return payments
    .filter(p => p.status !== "paid")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
}

export function getBillCycleStatus(bill: Bill, payments: Payment[], today: Date): BillCycleStatus {
  const billPayments = payments.filter(p => p.billId === bill.id);
  const isCurrentCycle = (dueDate: Date) =>
    bill.frequency === "monthly"
      ? isSameMonth(dueDate, today) && isSameYear(dueDate, today)
      : isSameYear(dueDate, today);

  const paidForCurrentCycle = billPayments.find(
    p => p.status === "paid" && isCurrentCycle(parseISO(p.dueDate as unknown as string))
  );
  if (paidForCurrentCycle) {
    const nextUnpaid = getOldestUnpaid(billPayments);
    return {
      status: "paid",
      dueDate: parseISO(paidForCurrentCycle.dueDate as unknown as string),
      amount: paidForCurrentCycle.amount,
      paymentId: paidForCurrentCycle.id,
      nextCycle: nextUnpaid
        ? { dueDate: parseISO(nextUnpaid.dueDate as unknown as string), amount: nextUnpaid.amount }
        : undefined,
    };
  }

  const oldestUnpaid = getOldestUnpaid(billPayments);
  if (oldestUnpaid) {
    const dueDate = parseISO(oldestUnpaid.dueDate as unknown as string);
    return {
      status: isBefore(dueDate, today) ? "overdue" : "pending",
      dueDate,
      amount: oldestUnpaid.amount,
      paymentId: oldestUnpaid.id,
    };
  }

  const currentPeriodDueDate = getDueDateForMonth(bill, today) ?? startOfMonth(today);
  return {
    status: isBefore(currentPeriodDueDate, today) ? "overdue" : "pending",
    dueDate: currentPeriodDueDate,
    amount: bill.defaultAmount,
    paymentId: undefined,
  };
}
```

`getOldestUnpaid` is a small, unexported (module-private) helper — no
new export from this file, no change to what other files can import from
it. The docstring above `getBillCycleStatus` and the `BillCycleStatus`
type itself are both unchanged; only omit them from this replacement if
your editor requires re-stating them — the safest approach is to replace
the entire file's content from the `export type BillCycleStatus` line
through the end, inserting `getOldestUnpaid` between the docstring and
`export function getBillCycleStatus`.

**Verify**: `pnpm check` → exits 0. `grep -n "function getOldestUnpaid" client/src/lib/bill-status.ts` → 1 match. `grep -c "sort((a, b) => new Date(a.dueDate).getTime()" client/src/lib/bill-status.ts` → exactly 1 match (was 2 before this plan, confirming the duplication is gone, not just aliased).

## Test plan

No new tests — this is a pure refactor with identical externally-observable
behavior, and the existing 9 tests in `bill-status.test.ts` already
exercise every branch this touches (the RCU-bug and yearly-bill tests
exercise the `nextCycle`-populated path via `nextUnpaid`; the
stale-overdue and pending tests exercise the fallback `oldestUnpaid`
path). Run the existing suite as the regression check.

**Verify**: `pnpm test` → all 9 tests in `bill-status.test.ts` still
pass, byte-identical assertions to before this plan, with no test file
changes.

## Done criteria

Machine-checkable:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, same pass count as before this plan (no test file changed)
- [ ] `grep -n "function getOldestUnpaid" client/src/lib/bill-status.ts` → 1 match
- [ ] `grep -c "sort((a, b) => new Date(a.dueDate).getTime()" client/src/lib/bill-status.ts` → 1 (was 2)
- [ ] No files outside `client/src/lib/bill-status.ts` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpt above doesn't match the live code (drift
  since this plan was written).
- Any existing test in `bill-status.test.ts` fails after this refactor —
  that means the extraction changed behavior, which it shouldn't; don't
  adjust the test to match, find and fix the discrepancy in the
  refactored function.
- `pnpm check` reports new errors you can't resolve in one reasonable fix
  attempt.

## Maintenance notes

- `getOldestUnpaid` is now the one place "what's the next thing this
  bill owes" gets computed — if that definition ever needs to change
  (e.g. a tie-breaking rule for same-due-date payments), it only needs
  updating here.
