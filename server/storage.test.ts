import { describe, it, expect, beforeEach, vi } from "vitest";

// storage.ts imports `db` from ./db, which connects to DATABASE_URL (the real
// Neon database) at import time. Swap it for an in-process PGlite Postgres
// built from shared/schema.ts so these tests never touch a real database.
vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { generateDrizzleJson, generateMigration } = await import("drizzle-kit/api");
  const schema = await import("@shared/schema");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  for (const statement of statements) await client.exec(statement);

  return { db };
});

import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { bills, payments, type Bill, type Payment } from "@shared/schema";

async function createBill(overrides: Partial<typeof bills.$inferInsert> = {}): Promise<Bill> {
  const [bill] = await db.insert(bills).values({
    name: "Test Bill",
    category: "Housing",
    defaultAmount: "100.00",
    frequency: "monthly",
    dueDay: 1,
    ...overrides,
  }).returning();
  return bill;
}

async function createPayment(billId: number, dueDate: Date, status: "paid" | "pending" = "pending"): Promise<Payment> {
  const [payment] = await db.insert(payments).values({
    billId,
    amount: "100.00",
    dueDate,
    status,
    paidDate: status === "paid" ? dueDate : null,
  }).returning();
  return payment;
}

async function allPayments(billId: number): Promise<Payment[]> {
  const rows = await storage.getPaymentsByBill(billId);
  return rows.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

const summarize = (rows: Payment[]) => rows.map(p => [new Date(p.dueDate).getMonth() + 1, p.status]);

const SEP = new Date(2026, 8, 1);
const OCT = new Date(2026, 9, 1);

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE payments, bills RESTART IDENTITY`);
});

describe("markPaidAndReset", () => {
  it("marks the payment paid and queues exactly one next-cycle payment", async () => {
    const bill = await createBill();
    const sep = await createPayment(bill.id, SEP);

    const { paid, next } = await storage.markPaidAndReset(sep.id, { amount: "100.00", paidDate: new Date(2026, 8, 2) });

    expect(paid.status).toBe("paid");
    expect(new Date(next.dueDate).getTime()).toBe(OCT.getTime());
    expect(summarize(await allPayments(bill.id))).toEqual([[9, "paid"], [10, "pending"]]);
  });

  it("paying ahead queues the following month without duplicating rows", async () => {
    const bill = await createBill();
    const sep = await createPayment(bill.id, SEP);
    const { next: oct } = await storage.markPaidAndReset(sep.id, { amount: "100.00", paidDate: new Date(2026, 8, 2) });

    await storage.markPaidAndReset(oct.id, { amount: "100.00", paidDate: new Date(2026, 8, 23) });

    expect(summarize(await allPayments(bill.id))).toEqual([[9, "paid"], [10, "paid"], [11, "pending"]]);
  });

  it("resetPayment returns the existing unpaid payment instead of inserting a duplicate", async () => {
    const bill = await createBill();
    const sep = await createPayment(bill.id, SEP);
    const { next } = await storage.markPaidAndReset(sep.id, { amount: "100.00", paidDate: new Date(2026, 8, 2) });

    const again = await storage.resetPayment(sep.id);

    expect(again.id).toBe(next.id);
    expect(await allPayments(bill.id)).toHaveLength(2);
  });
});

describe("revertPayment", () => {
  it("reverts a paid payment to pending and removes its queued next-cycle row", async () => {
    const bill = await createBill();
    const sep = await createPayment(bill.id, SEP);
    await storage.markPaidAndReset(sep.id, { amount: "100.00", paidDate: new Date(2026, 8, 2) });

    const reverted = await storage.revertPayment(sep.id);

    expect(reverted.status).toBe("pending");
    expect(reverted.paidDate).toBeNull();
    expect(summarize(await allPayments(bill.id))).toEqual([[9, "pending"]]);
  });

  it("undoing a payment made ahead reverts October and removes November, leaving September paid", async () => {
    const bill = await createBill();
    const sep = await createPayment(bill.id, SEP);
    const { next: oct } = await storage.markPaidAndReset(sep.id, { amount: "100.00", paidDate: new Date(2026, 8, 2) });
    await storage.markPaidAndReset(oct.id, { amount: "100.00", paidDate: new Date(2026, 8, 23) });

    const reverted = await storage.revertPayment(oct.id);

    expect(reverted.id).toBe(oct.id);
    expect(reverted.status).toBe("pending");
    expect(summarize(await allPayments(bill.id))).toEqual([[9, "paid"], [10, "pending"]]);
    const [septemberRow] = await allPayments(bill.id);
    expect(septemberRow.paidDate).not.toBeNull();
  });

  it("peels back one payment at a time when paid two months ahead", async () => {
    const bill = await createBill();
    const sep = await createPayment(bill.id, SEP);
    const { next: oct } = await storage.markPaidAndReset(sep.id, { amount: "100.00", paidDate: new Date(2026, 8, 2) });
    const { next: nov } = await storage.markPaidAndReset(oct.id, { amount: "100.00", paidDate: new Date(2026, 8, 23) });
    await storage.markPaidAndReset(nov.id, { amount: "100.00", paidDate: new Date(2026, 8, 23) });
    expect(summarize(await allPayments(bill.id))).toEqual([[9, "paid"], [10, "paid"], [11, "paid"], [12, "pending"]]);

    await storage.revertPayment(nov.id);

    expect(summarize(await allPayments(bill.id))).toEqual([[9, "paid"], [10, "paid"], [11, "pending"]]);
  });

  it("reverting the current month while a later month is already paid leaves the later payment alone", async () => {
    const bill = await createBill();
    const sep = await createPayment(bill.id, SEP);
    const { next: oct } = await storage.markPaidAndReset(sep.id, { amount: "100.00", paidDate: new Date(2026, 8, 2) });
    await storage.markPaidAndReset(oct.id, { amount: "100.00", paidDate: new Date(2026, 8, 23) });

    await storage.revertPayment(sep.id);

    expect(summarize(await allPayments(bill.id))).toEqual([[9, "pending"], [10, "paid"], [11, "pending"]]);
  });

  it("refuses to revert an Auto Pay bill's payment and changes nothing", async () => {
    const bill = await createBill({ isAutoPay: true });
    const sep = await createPayment(bill.id, SEP);
    await storage.markPaidAndReset(sep.id, { amount: "100.00", paidDate: new Date(2026, 8, 2) });

    await expect(storage.revertPayment(sep.id)).rejects.toThrow(/Auto Pay/);

    expect(summarize(await allPayments(bill.id))).toEqual([[9, "paid"], [10, "pending"]]);
  });

  it("rolls yearly bills forward and back by a year", async () => {
    const bill = await createBill({ frequency: "yearly", dueMonth: 6, dueDay: 24 });
    const y2026 = await createPayment(bill.id, new Date(2026, 5, 24));
    const { next } = await storage.markPaidAndReset(y2026.id, { amount: "100.00", paidDate: new Date(2026, 5, 20) });
    expect(new Date(next.dueDate).getTime()).toBe(new Date(2027, 5, 24).getTime());

    await storage.revertPayment(y2026.id);

    expect(await allPayments(bill.id)).toHaveLength(1);
  });
});
