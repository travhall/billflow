export interface PayScheduleInput {
  anchorDate: Date;
  intervalDays: number;
}

/**
 * Computes every payday occurrence that falls within the given month
 * (0-indexed, matching `Date#getMonth`). Paydays are anchorDate + n *
 * intervalDays for any integer n, so this walks both directions from the
 * anchor rather than assuming the anchor precedes the target month.
 */
export function getPaydaysInMonth(schedule: PayScheduleInput, year: number, month: number): Date[] {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const msPerDay = 24 * 60 * 60 * 1000;
  const intervalMs = schedule.intervalDays * msPerDay;

  const anchor = new Date(schedule.anchorDate.getFullYear(), schedule.anchorDate.getMonth(), schedule.anchorDate.getDate());

  // Jump close to monthStart in one step, then walk day-by-day to land
  // exactly on the schedule's cadence (avoids drift from a naive
  // ms-based jump across DST transitions).
  const roughSteps = Math.floor((monthStart.getTime() - anchor.getTime()) / intervalMs) - 1;
  let candidate = new Date(anchor);
  candidate.setDate(candidate.getDate() + roughSteps * schedule.intervalDays);
  while (candidate.getTime() < monthStart.getTime()) {
    candidate = new Date(candidate);
    candidate.setDate(candidate.getDate() + schedule.intervalDays);
  }

  const paydays: Date[] = [];
  while (candidate.getTime() < monthEnd.getTime()) {
    paydays.push(new Date(candidate));
    candidate = new Date(candidate);
    candidate.setDate(candidate.getDate() + schedule.intervalDays);
  }

  return paydays;
}

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
