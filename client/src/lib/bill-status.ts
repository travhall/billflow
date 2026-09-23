import { differenceInCalendarDays, isBefore, isSameMonth, isSameYear, parseISO, startOfMonth } from "date-fns";
import { getDueDateForMonth, getNextOccurrenceDueDate } from "@shared/date-utils";
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
  nextCycle?: { dueDate: Date; amount: string; paymentId: number };
  /**
   * When `status` is `"paid"`, payments already marked paid for cycles
   * AFTER the current one (the owner paying a month or two out ahead),
   * oldest first. Lets callers offer "undo" on the most recent one instead
   * of only on the current-cycle payment. Empty when nothing is paid ahead.
   */
  paidAhead?: { dueDate: Date; paymentId: number }[];
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
function getOldestUnpaid(payments: Payment[]): Payment | undefined {
  return payments
    .filter(p => p.status !== "paid")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
}

export function getBillCycleStatus(bill: Bill, payments: Payment[], today: Date): BillCycleStatus {
  const billPayments = payments.filter(p => p.billId === bill.id);
  const isCurrentCycle = (dueDate: Date) => {
    if (bill.frequency === "monthly") return isSameMonth(dueDate, today) && isSameYear(dueDate, today);
    const interval = bill.intervalYears ?? 1;
    if (interval <= 1) return isSameYear(dueDate, today);
    // Multi-year bill: "current cycle" is the occurrence year covering
    // today (the most recent anchor-aligned year <= today), since no new
    // cycle starts until the next occurrence years later.
    const anchor = bill.anchorYear ?? dueDate.getFullYear();
    const currentOccurrenceYear = anchor + Math.floor((today.getFullYear() - anchor) / interval) * interval;
    return dueDate.getFullYear() === currentOccurrenceYear;
  };

  const paidForCurrentCycle = billPayments.find(
    p => p.status === "paid" && isCurrentCycle(parseISO(p.dueDate as unknown as string))
  );
  if (paidForCurrentCycle) {
    const nextUnpaid = getOldestUnpaid(billPayments);
    const currentDueDate = parseISO(paidForCurrentCycle.dueDate as unknown as string);
    const paidAhead = billPayments
      .filter(p => p.status === "paid" && parseISO(p.dueDate as unknown as string).getTime() > currentDueDate.getTime())
      .map(p => ({ dueDate: parseISO(p.dueDate as unknown as string), paymentId: p.id }))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    return {
      status: "paid",
      dueDate: currentDueDate,
      amount: paidForCurrentCycle.amount,
      paymentId: paidForCurrentCycle.id,
      nextCycle: nextUnpaid
        ? { dueDate: parseISO(nextUnpaid.dueDate as unknown as string), amount: nextUnpaid.amount, paymentId: nextUnpaid.id }
        : undefined,
      paidAhead,
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

  const currentPeriodDueDate = getNextOccurrenceDueDate(bill, today) ?? startOfMonth(today);
  return {
    status: isBefore(currentPeriodDueDate, today) ? "overdue" : "pending",
    dueDate: currentPeriodDueDate,
    amount: bill.defaultAmount,
    paymentId: undefined,
  };
}

/** How many days ahead of a due date a bill starts reading as "Due" rather than "Next Cycle". */
export const DUE_SOON_DAYS = 7;

/**
 * Whether a payment's due date is close enough to show as "Due" instead of
 * "Next Cycle": it falls in the current billing cycle (this month for
 * monthly bills, this year for yearly ones), or is at most `DUE_SOON_DAYS`
 * away — so a bill due Oct 1 starts reading "Due" in late September
 * instead of waiting for the calendar month to flip.
 */
export function isDueSoon(bill: Pick<Bill, "frequency">, dueDate: Date, today: Date): boolean {
  const inCurrentCycle = bill.frequency === "monthly"
    ? isSameMonth(dueDate, today) && isSameYear(dueDate, today)
    : isSameYear(dueDate, today);
  return inCurrentCycle || differenceInCalendarDays(dueDate, today) <= DUE_SOON_DAYS;
}
