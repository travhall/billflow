import { isBefore, isSameMonth, isSameYear, parseISO, startOfMonth } from "date-fns";
import { getDueDateForMonth } from "@shared/date-utils";
import type { Bill, Payment } from "@shared/schema";

export type BillCycleStatus = {
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
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
    return {
      status: "paid",
      dueDate: parseISO(paidForCurrentCycle.dueDate as unknown as string),
      amount: paidForCurrentCycle.amount,
      paymentId: paidForCurrentCycle.id,
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
