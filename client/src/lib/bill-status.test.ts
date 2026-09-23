import { describe, it, expect } from "vitest";
import { getBillCycleStatus, isDueSoon } from "./bill-status";
import type { Bill, Payment } from "@shared/schema";

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 1,
    name: "Test Bill",
    category: "Test",
    defaultAmount: "100.00",
    isVariable: false,
    frequency: "monthly",
    dueDay: 1,
    dueMonth: null,
    isAutoPay: false,
    archived: false,
    reminderDays: null,
    ...overrides,
  };
}

// Fixture dates are local-time ISO strings (no "Z") throughout this file,
// matching how `parseISO` and the `new Date(y, m, d)` assertions below both
// resolve relative to whatever timezone the test runner happens to be in —
// so equality checks hold regardless of that timezone, instead of only
// passing on whichever machine's offset the fixture was hand-tuned for.
function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 1,
    billId: 1,
    amount: "100.00",
    dueDate: "2026-09-01T00:00:00.000" as unknown as Payment["dueDate"],
    paidDate: null,
    status: "pending",
    notes: null,
    ...overrides,
  };
}

describe("getBillCycleStatus", () => {
  it("reports paid when the current cycle is paid, even if a next-cycle payment already rolled over unpaid (the RCU: Mortgage bug)", () => {
    const b = bill({ id: 1, dueDay: 1 });
    const payments = [
      payment({ id: 2, billId: 1, dueDate: "2026-09-01T00:00:00.000" as unknown as Payment["dueDate"], paidDate: "2026-08-24T00:00:00.000" as unknown as Payment["paidDate"], status: "paid" }),
      payment({ id: 50, billId: 1, dueDate: "2026-10-01T00:00:00.000" as unknown as Payment["dueDate"], status: "pending" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 2)); // Sep 2, 2026
    expect(result.status).toBe("paid");
    expect(result.paymentId).toBe(2);
    expect(result.nextCycle?.dueDate.getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(result.nextCycle?.amount).toBe("100.00");
  });

  it("reports pending for an unpaid bill due later this cycle with no other payment rows", () => {
    const b = bill({ id: 2, dueDay: 14 });
    const payments = [payment({ id: 10, billId: 2, dueDate: "2026-09-14T00:00:00.000" as unknown as Payment["dueDate"], status: "pending" })];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 2));
    expect(result.status).toBe("pending");
  });

  it("reports overdue for a stale unpaid payment from a past cycle when no next-cycle row exists yet", () => {
    const b = bill({ id: 3, dueDay: 1 });
    const payments = [payment({ id: 20, billId: 3, dueDate: "2026-09-01T00:00:00.000" as unknown as Payment["dueDate"], status: "pending" })];
    const result = getBillCycleStatus(b, payments, new Date(2026, 9, 15)); // Oct 15, well past Sep 1
    expect(result.status).toBe("overdue");
    expect(result.dueDate.getMonth()).toBe(8); // still September, not silently reset to October
  });

  it("falls back to the bill's default amount and computed due date when no payment rows exist at all", () => {
    const b = bill({ id: 4, dueDay: 20, defaultAmount: "42.00" });
    const result = getBillCycleStatus(b, [], new Date(2026, 8, 2));
    expect(result.status).toBe("pending");
    expect(result.amount).toBe("42.00");
    expect(result.paymentId).toBeUndefined();
  });

  it("handles yearly bills the same way — paid this year despite a next-cycle row already existing", () => {
    const b = bill({ id: 5, frequency: "yearly", dueMonth: 6, dueDay: 24 });
    const payments = [
      payment({ id: 30, billId: 5, dueDate: "2026-06-24T00:00:00.000" as unknown as Payment["dueDate"], status: "paid" }),
      payment({ id: 31, billId: 5, dueDate: "2027-06-24T00:00:00.000" as unknown as Payment["dueDate"], status: "pending" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 2));
    expect(result.status).toBe("paid");
    expect(result.paymentId).toBe(30);
    expect(result.nextCycle?.dueDate.getTime()).toBe(new Date(2027, 5, 24).getTime());
    expect(result.nextCycle?.amount).toBe("100.00");
  });

  it("leaves nextCycle undefined when a bill is paid but no next-cycle row has been created", () => {
    const b = bill({ id: 6, dueDay: 1 });
    const payments = [payment({ id: 40, billId: 6, dueDate: "2026-09-01T00:00:00.000" as unknown as Payment["dueDate"], status: "paid" })];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 2));
    expect(result.status).toBe("paid");
    expect(result.nextCycle).toBeUndefined();
  });
});

describe("getBillCycleStatus — paying ahead", () => {
  const d = (iso: string) => `${iso}T00:00:00.000` as unknown as Payment["dueDate"];

  it("exposes the next unpaid payment's id so it can be paid directly", () => {
    const b = bill({ id: 7, dueDay: 1 });
    const payments = [
      payment({ id: 60, billId: 7, dueDate: d("2026-09-01"), status: "paid" }),
      payment({ id: 61, billId: 7, dueDate: d("2026-10-01"), status: "pending" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 23));
    expect(result.nextCycle?.paymentId).toBe(61);
  });

  it("after paying October early in September, the row moves on to November while still reading paid", () => {
    const b = bill({ id: 8, dueDay: 1 });
    const payments = [
      payment({ id: 70, billId: 8, dueDate: d("2026-09-01"), status: "paid" }),
      payment({ id: 71, billId: 8, dueDate: d("2026-10-01"), status: "paid" }),
      payment({ id: 72, billId: 8, dueDate: d("2026-11-01"), status: "pending" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 23));
    expect(result.status).toBe("paid");
    expect(result.paymentId).toBe(70);
    expect(result.nextCycle?.paymentId).toBe(72);
    expect(result.nextCycle?.dueDate.getTime()).toBe(new Date(2026, 10, 1).getTime());
  });

  it("when October arrives, the pre-paid October payment is the current cycle and November is next", () => {
    const b = bill({ id: 9, dueDay: 1 });
    const payments = [
      payment({ id: 80, billId: 9, dueDate: d("2026-09-01"), status: "paid" }),
      payment({ id: 81, billId: 9, dueDate: d("2026-10-01"), status: "paid" }),
      payment({ id: 82, billId: 9, dueDate: d("2026-11-01"), status: "pending" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 9, 2)); // Oct 2
    expect(result.status).toBe("paid");
    expect(result.paymentId).toBe(81);
    expect(result.nextCycle?.paymentId).toBe(82);
  });

  it("paying two months ahead keeps queueing exactly one unpaid row", () => {
    const b = bill({ id: 10, dueDay: 1 });
    const payments = [
      payment({ id: 90, billId: 10, dueDate: d("2026-09-01"), status: "paid" }),
      payment({ id: 91, billId: 10, dueDate: d("2026-10-01"), status: "paid" }),
      payment({ id: 92, billId: 10, dueDate: d("2026-11-01"), status: "paid" }),
      payment({ id: 93, billId: 10, dueDate: d("2026-12-01"), status: "pending" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 23));
    expect(result.paymentId).toBe(90);
    expect(result.nextCycle?.dueDate.getTime()).toBe(new Date(2026, 11, 1).getTime());
  });
});

describe("getBillCycleStatus — paidAhead", () => {
  const d = (iso: string) => `${iso}T00:00:00.000` as unknown as Payment["dueDate"];

  it("is empty when nothing is paid beyond the current cycle", () => {
    const b = bill({ id: 11, dueDay: 1 });
    const payments = [
      payment({ id: 100, billId: 11, dueDate: d("2026-08-01"), status: "paid" }),
      payment({ id: 101, billId: 11, dueDate: d("2026-09-01"), status: "paid" }),
      payment({ id: 102, billId: 11, dueDate: d("2026-10-01"), status: "pending" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 23));
    expect(result.paidAhead).toEqual([]); // Aug is history, not "ahead"
  });

  it("lists payments paid after the current cycle, oldest first, regardless of input order", () => {
    const b = bill({ id: 12, dueDay: 1 });
    const payments = [
      payment({ id: 113, billId: 12, dueDate: d("2026-12-01"), status: "pending" }),
      payment({ id: 112, billId: 12, dueDate: d("2026-11-01"), status: "paid" }),
      payment({ id: 111, billId: 12, dueDate: d("2026-10-01"), status: "paid" }),
      payment({ id: 110, billId: 12, dueDate: d("2026-09-01"), status: "paid" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 23));
    expect(result.paidAhead?.map(p => p.paymentId)).toEqual([111, 112]);
    expect(result.paidAhead?.[1].dueDate.getTime()).toBe(new Date(2026, 10, 1).getTime());
  });

  it("is undefined when the bill isn't paid for the current cycle", () => {
    const b = bill({ id: 13, dueDay: 25 });
    const payments = [payment({ id: 120, billId: 13, dueDate: d("2026-09-25"), status: "pending" })];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 23));
    expect(result.paidAhead).toBeUndefined();
  });

  it("tracks a yearly bill paid a year ahead", () => {
    const b = bill({ id: 14, frequency: "yearly", dueMonth: 6, dueDay: 24 });
    const payments = [
      payment({ id: 130, billId: 14, dueDate: d("2026-06-24"), status: "paid" }),
      payment({ id: 131, billId: 14, dueDate: d("2027-06-24"), status: "paid" }),
      payment({ id: 132, billId: 14, dueDate: d("2028-06-24"), status: "pending" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 23));
    expect(result.paidAhead?.map(p => p.paymentId)).toEqual([131]);
  });
});

describe("isDueSoon", () => {
  const monthly = { frequency: "monthly" } as const;
  const yearly = { frequency: "yearly" } as const;
  const today = new Date(2026, 8, 23); // Sep 23

  it("treats a due date later this month as due", () => {
    expect(isDueSoon(monthly, new Date(2026, 8, 25), today)).toBe(true);
  });

  it("treats next month's due date within 7 days as due (Oct 1 is 8 days out, Sep 30 is 7)", () => {
    expect(isDueSoon(monthly, new Date(2026, 9, 1), today)).toBe(false);
    expect(isDueSoon(monthly, new Date(2026, 8, 30), today)).toBe(true);
    expect(isDueSoon(monthly, new Date(2026, 9, 1), new Date(2026, 8, 24))).toBe(true);
  });

  it("keeps a further-out monthly due date as next cycle", () => {
    expect(isDueSoon(monthly, new Date(2026, 9, 15), today)).toBe(false);
  });

  it("treats a yearly bill due later this year as current-cycle, but next year's as not due", () => {
    expect(isDueSoon(yearly, new Date(2026, 11, 25), today)).toBe(true);
    expect(isDueSoon(yearly, new Date(2027, 5, 24), today)).toBe(false);
  });

  it("counts a past due date as due", () => {
    expect(isDueSoon(monthly, new Date(2026, 7, 20), today)).toBe(true);
  });
});
