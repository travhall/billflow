export type PayScheduleInput =
  | { type: "interval"; anchorDate: Date; intervalDays: number }
  | { type: "monthly"; daysOfMonth: number[] };

/**
 * Computes every payday occurrence that falls within the given month
 * (0-indexed, matching `Date#getMonth`).
 *
 * "interval" schedules recur every N days from a confirmed anchor date
 * (e.g. every-other-Friday) — paydays are anchorDate + n * intervalDays
 * for any integer n, so this walks both directions from the anchor
 * rather than assuming the anchor precedes the target month.
 *
 * "monthly" schedules recur on fixed day(s) of every month (e.g. 1st and
 * 15th) — each day is clamped to the month's actual length, same as bill
 * due dates in `getDueDateForMonth`.
 */
export function getPaydaysInMonth(schedule: PayScheduleInput, year: number, month: number): Date[] {
  if (schedule.type === "monthly") {
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    return schedule.daysOfMonth
      .map((day) => new Date(year, month, Math.min(day, lastDayOfMonth)))
      .sort((a, b) => a.getTime() - b.getTime());
  }

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
  intervalYears?: number | null; // yearly only: recur every N years (null/1 = every year)
  anchorYear?: number | null; // yearly only: first occurrence year, paired with intervalYears
}

/**
 * True when `year` is one of the bill's occurrence years. Always true for
 * monthly/every-year bills; for a multi-year interval, only years landing
 * exactly on anchorYear + k*intervalYears (k >= 0) count.
 */
function isOccurrenceYear(bill: DueDateInput, year: number): boolean {
  const interval = bill.intervalYears ?? 1;
  if (interval <= 1) return true;
  const anchor = bill.anchorYear ?? year;
  return year >= anchor && (year - anchor) % interval === 0;
}

/**
 * Computes the due date for the billing cycle that contains (or starts
 * at) `referenceDate`. `dueDay` is clamped to the actual number of days
 * in the target month so days 29-31 never overflow into the next month.
 * For a multi-year yearly bill, returns null when `referenceDate`'s year
 * isn't one of the bill's occurrence years.
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
    if (!isOccurrenceYear(bill, year)) return null;
    const targetMonth = bill.dueMonth - 1; // dueMonth is 1-12
    const lastDayOfMonth = new Date(year, targetMonth + 1, 0).getDate();
    const day = Math.min(bill.dueDay, lastDayOfMonth);
    return new Date(year, targetMonth, day);
  }

  return null;
}

/**
 * Like `getDueDateForMonth`, but for a multi-year yearly bill whose
 * `referenceDate` year isn't an occurrence year, walks forward to the
 * bill's next actual occurrence instead of returning null. Used where a
 * "what's the upcoming due date" fallback is needed (e.g. a brand-new
 * bill with no payments yet).
 */
export function getNextOccurrenceDueDate(bill: DueDateInput, referenceDate: Date): Date | null {
  const direct = getDueDateForMonth(bill, referenceDate);
  if (direct) return direct;
  if (bill.frequency !== "yearly" || !bill.dueMonth) return null;

  const interval = bill.intervalYears ?? 1;
  const referenceYear = referenceDate.getFullYear();
  const anchor = bill.anchorYear ?? referenceYear;
  const nextOccurrenceYear = referenceYear < anchor
    ? anchor
    : anchor + Math.ceil((referenceYear - anchor) / interval) * interval;

  return getDueDateForMonth(bill, new Date(nextOccurrenceYear, 0, 1));
}

/**
 * Computes the next cycle's due date given the current cycle's due date,
 * the bill's frequency, and (for yearly) its interval-years. Used when
 * rolling a payment forward.
 */
export function getNextCycleDueDate(currentDueDate: Date, frequency: "monthly" | "yearly", intervalYears?: number | null): Date {
  if (frequency === "monthly") {
    const year = currentDueDate.getFullYear();
    const month = currentDueDate.getMonth() + 1; // next month, 0-indexed carries into getDueDateForMonth
    const nextMonthDate = new Date(year, month, 1);
    const lastDayOfNextMonth = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, 0).getDate();
    const day = Math.min(currentDueDate.getDate(), lastDayOfNextMonth);
    return new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), day);
  }
  // yearly: Feb 29 -> Feb 28/29 next occurrence year, clamped the same way
  const nextYear = currentDueDate.getFullYear() + (intervalYears && intervalYears > 0 ? intervalYears : 1);
  const lastDayOfMonth = new Date(nextYear, currentDueDate.getMonth() + 1, 0).getDate();
  const day = Math.min(currentDueDate.getDate(), lastDayOfMonth);
  return new Date(nextYear, currentDueDate.getMonth(), day);
}
