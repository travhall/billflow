import { describe, it, expect } from "vitest";
import { getBillCycleStatus } from "./bill-status";
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

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 1,
    billId: 1,
    amount: "100.00",
    dueDate: "2026-09-01T00:00:00.000Z" as unknown as Payment["dueDate"],
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
      payment({ id: 2, billId: 1, dueDate: "2026-09-01T05:00:00.000Z" as unknown as Payment["dueDate"], paidDate: "2026-08-24T00:00:00.000Z" as unknown as Payment["paidDate"], status: "paid" }),
      payment({ id: 50, billId: 1, dueDate: "2026-10-01T05:00:00.000Z" as unknown as Payment["dueDate"], status: "pending" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 2)); // Sep 2, 2026
    expect(result.status).toBe("paid");
    expect(result.paymentId).toBe(2);
  });

  it("reports pending for an unpaid bill due later this cycle with no other payment rows", () => {
    const b = bill({ id: 2, dueDay: 14 });
    const payments = [payment({ id: 10, billId: 2, dueDate: "2026-09-14T00:00:00.000Z" as unknown as Payment["dueDate"], status: "pending" })];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 2));
    expect(result.status).toBe("pending");
  });

  it("reports overdue for a stale unpaid payment from a past cycle when no next-cycle row exists yet", () => {
    const b = bill({ id: 3, dueDay: 1 });
    const payments = [payment({ id: 20, billId: 3, dueDate: "2026-09-01T05:00:00.000Z" as unknown as Payment["dueDate"], status: "pending" })];
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
      payment({ id: 30, billId: 5, dueDate: "2026-06-24T00:00:00.000Z" as unknown as Payment["dueDate"], status: "paid" }),
      payment({ id: 31, billId: 5, dueDate: "2027-06-24T00:00:00.000Z" as unknown as Payment["dueDate"], status: "pending" }),
    ];
    const result = getBillCycleStatus(b, payments, new Date(2026, 8, 2));
    expect(result.status).toBe("paid");
    expect(result.paymentId).toBe(30);
  });
});
