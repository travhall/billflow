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
});

describe("getDueDateForMonth", () => {
  it("clamps dueDay 31 to the last day of a 30-day month", () => {
    const due = getDueDateForMonth({ frequency: "monthly", dueDay: 31 }, new Date(2026, 3, 1));
    expect(due?.getDate()).toBe(30);
  });
});
