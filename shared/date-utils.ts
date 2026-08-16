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
