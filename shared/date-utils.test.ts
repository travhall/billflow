import { describe, it, expect } from "vitest";
import { getDueDateForMonth, getNextCycleDueDate } from "./date-utils";

describe("getNextCycleDueDate", () => {
  it("clamps Jan 31 monthly rollover to Feb 28 in a non-leap year", () => {
    const next = getNextCycleDueDate(new Date(2026, 0, 31), "monthly");
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });

  it("clamps Jan 31 monthly rollover to Feb 29 in a leap year", () => {
    const next = getNextCycleDueDate(new Date(2028, 0, 31), "monthly");
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(29);
  });

  it("rolls a multi-year yearly bill forward by intervalYears, not 1", () => {
    const next = getNextCycleDueDate(new Date(2028, 0, 15), "yearly", 5);
    expect(next.getFullYear()).toBe(2033);
    expect(next.getMonth()).toBe(0);
    expect(next.getDate()).toBe(15);
  });

  it("defaults to +1 year when intervalYears is null/undefined", () => {
    const next = getNextCycleDueDate(new Date(2028, 0, 15), "yearly", null);
    expect(next.getFullYear()).toBe(2029);
  });
});

describe("getDueDateForMonth", () => {
  it("clamps dueDay 31 to the last day of a 30-day month", () => {
    const due = getDueDateForMonth({ frequency: "monthly", dueDay: 31 }, new Date(2026, 3, 1));
    expect(due?.getDate()).toBe(30);
  });

  it("returns the due date in a multi-year bill's occurrence year", () => {
    const bill = { frequency: "yearly" as const, dueDay: 15, dueMonth: 1, intervalYears: 5, anchorYear: 2028 };
    const due = getDueDateForMonth(bill, new Date(2028, 0, 1));
    expect(due?.getFullYear()).toBe(2028);
    expect(due?.getMonth()).toBe(0);
    expect(due?.getDate()).toBe(15);
  });

  it("returns null for a non-occurrence year of a multi-year bill", () => {
    const bill = { frequency: "yearly" as const, dueDay: 15, dueMonth: 1, intervalYears: 5, anchorYear: 2028 };
    expect(getDueDateForMonth(bill, new Date(2030, 0, 1))).toBeNull();
    expect(getDueDateForMonth(bill, new Date(2033, 0, 1))).not.toBeNull();
  });
});
