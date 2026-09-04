import { db } from "./db";
import {
  bills, payments, categoryBudgets,
  type Bill, type InsertBill, type Payment, type InsertPayment,
  type UpdateBillRequest, type UpdatePaymentRequest,
  type CategoryBudget,
} from "@shared/schema";
import { eq, desc, inArray, and, ne } from "drizzle-orm";
import { getNextCycleDueDate, getDueDateForMonth } from "@shared/date-utils";

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export interface IStorage {
  getBills(): Promise<Bill[]>;
  getBill(id: number): Promise<Bill | undefined>;
  createBill(bill: InsertBill): Promise<Bill>;
  updateBill(id: number, updates: UpdateBillRequest): Promise<Bill>;
  deleteBill(id: number): Promise<void>;

  getPayments(): Promise<Payment[]>;
  getPaymentsByBill(billId: number): Promise<Payment[]>;
  processAutoPay(): Promise<void>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: number, updates: UpdatePaymentRequest): Promise<Payment>;
  deletePayment(id: number): Promise<void>;
  resetPayment(id: number): Promise<Payment>;
  revertPayment(id: number): Promise<Payment>;
  markPaidAndReset(id: number, updates: { amount: string; paidDate: Date }): Promise<{ paid: Payment; next: Payment }>;

  getBudgets(): Promise<CategoryBudget[]>;
  upsertBudget(category: string, monthlyLimit: string): Promise<CategoryBudget>;
  deleteBudget(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getBills(): Promise<Bill[]> {
    return await db.select().from(bills);
  }

  async getBill(id: number): Promise<Bill | undefined> {
    const [bill] = await db.select().from(bills).where(eq(bills.id, id));
    return bill;
  }

  async createBill(bill: InsertBill): Promise<Bill> {
    const [newBill] = await db.insert(bills).values(bill).returning();
    return newBill;
  }

  async updateBill(id: number, updates: UpdateBillRequest): Promise<Bill> {
    const [updated] = await db.update(bills).set(updates).where(eq(bills.id, id)).returning();
    if (!updated) throw new Error("Bill not found");

    const amountChanged = updates.defaultAmount !== undefined;
    const scheduleChanged = updates.dueDay !== undefined || updates.dueMonth !== undefined || updates.frequency !== undefined;

    // A not-yet-paid payment is just a preview generated from the bill's
    // amount/schedule — nothing has actually happened for that cycle yet,
    // so it should track corrections. Paid payments are a locked
    // historical record and are never touched here. When the schedule
    // changes, each pending payment's own due date is used as the
    // reference so it stays in the same cycle (month/year) it already
    // represents, just recomputed with the corrected day/month.
    if (amountChanged || scheduleChanged) {
      const pending = await db.select().from(payments)
        .where(and(eq(payments.billId, id), ne(payments.status, "paid")));

      for (const payment of pending) {
        const patch: { amount?: string; dueDate?: Date } = {};
        if (amountChanged) patch.amount = updated.defaultAmount;
        if (scheduleChanged) {
          const correctedDueDate = getDueDateForMonth(updated, new Date(payment.dueDate));
          if (correctedDueDate) patch.dueDate = correctedDueDate;
        }
        if (Object.keys(patch).length > 0) {
          await db.update(payments).set(patch).where(eq(payments.id, payment.id));
        }
      }
    }

    return updated;
  }

  async deleteBill(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(bills).set({ archived: true }).where(eq(bills.id, id));
      await tx.delete(payments).where(and(eq(payments.billId, id), ne(payments.status, "paid")));
    });
  }

  async getPayments(): Promise<Payment[]> {
    return await db.select().from(payments).orderBy(desc(payments.dueDate));
  }

  async processAutoPay(): Promise<void> {
    const allPayments = await db.select().from(payments);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overduePending = allPayments.filter(
      (p) => p.status !== "paid" && new Date(p.dueDate) < today
    );

    if (overduePending.length === 0) return;

    // Batch-fetch the bills for every overdue payment in one query instead
    // of one query per payment.
    const billIds = Array.from(new Set(overduePending.map((p) => p.billId)));
    const relevantBills = await db.select().from(bills).where(inArray(bills.id, billIds));
    const billsById = new Map(relevantBills.map((b) => [b.id, b]));

    const autoPayPayments = overduePending.filter((p) => billsById.get(p.billId)?.isAutoPay);

    if (autoPayPayments.length === 0) return;

    await db.transaction(async (tx) => {
      for (const payment of autoPayPayments) {
        const updated = await tx.update(payments)
          .set({ status: "paid", paidDate: new Date() })
          .where(and(eq(payments.id, payment.id), ne(payments.status, "paid")))
          .returning();
        if (updated.length === 0) continue; // another concurrent request already claimed it
        await this.resetPayment(payment.id, tx);
      }
    });
  }

  async getPaymentsByBill(billId: number): Promise<Payment[]> {
    return await db.select().from(payments).where(eq(payments.billId, billId)).orderBy(desc(payments.dueDate));
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async updatePayment(id: number, updates: UpdatePaymentRequest): Promise<Payment> {
    const [updated] = await db.update(payments).set(updates).where(eq(payments.id, id)).returning();
    if (!updated) throw new Error("Payment not found");
    return updated;
  }

  async deletePayment(id: number): Promise<void> {
    await db.delete(payments).where(eq(payments.id, id));
  }

  async resetPayment(id: number, executor: Executor = db): Promise<Payment> {
    const [payment] = await executor.select().from(payments).where(eq(payments.id, id));
    if (!payment) throw new Error("Payment not found");

    const [existingUnpaid] = await executor.select().from(payments)
      .where(and(eq(payments.billId, payment.billId), ne(payments.status, "paid"), ne(payments.id, id)));
    if (existingUnpaid) {
      return existingUnpaid;
    }

    const [bill] = await executor.select().from(bills).where(eq(bills.id, payment.billId));
    if (!bill) throw new Error("Bill not found");

    const currentDueDate = new Date(payment.dueDate);
    const nextDueDate = getNextCycleDueDate(currentDueDate, bill.frequency);

    const [newPayment] = await executor.insert(payments).values({
      billId: payment.billId,
      amount: bill.defaultAmount,
      dueDate: nextDueDate,
      status: "pending",
    }).returning();

    return newPayment;
  }

  async markPaidAndReset(id: number, updates: { amount: string; paidDate: Date }): Promise<{ paid: Payment; next: Payment }> {
    return await db.transaction(async (tx) => {
      const [paid] = await tx.update(payments)
        .set({ amount: updates.amount, paidDate: updates.paidDate, status: "paid", notes: "" })
        .where(eq(payments.id, id))
        .returning();
      if (!paid) throw new Error("Payment not found");

      const next = await this.resetPayment(id, tx);
      return { paid, next };
    });
  }

  async revertPayment(id: number): Promise<Payment> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    if (!payment) throw new Error("Payment not found");

    const [bill] = await db.select().from(bills).where(eq(bills.id, payment.billId));
    if (!bill) throw new Error("Bill not found");

    if (bill.isAutoPay) {
      throw new Error("Can't revert an Auto Pay bill's payment — turn off Auto Pay for this bill first, or it will be marked paid again automatically.");
    }

    // If this payment was previously marked paid with "reset for next
    // cycle", resetPayment() inserted a fresh pending payment for the same
    // bill dated at the next cycle's due date. There is no direct link
    // between the two rows, so find it by matching billId + status +
    // the expected next due date, and remove it — mirroring what
    // TEST_PLAN.md:55 documents as the expected Undo behavior.
    const currentDueDate = new Date(payment.dueDate);
    const expectedNextDueDate = getNextCycleDueDate(currentDueDate, bill.frequency);

    const candidateNextPayments = await db.select().from(payments).where(
      and(
        eq(payments.billId, payment.billId),
        eq(payments.status, "pending"),
      )
    );
    const nextCyclePayment = candidateNextPayments.find(
      (p) => new Date(p.dueDate).getTime() === expectedNextDueDate.getTime()
    );

    const [updated] = await db.update(payments)
      .set({ status: "pending", paidDate: null })
      .where(eq(payments.id, id))
      .returning();

    if (nextCyclePayment) {
      await db.delete(payments).where(eq(payments.id, nextCyclePayment.id));
    }

    return updated;
  }

  async getBudgets(): Promise<CategoryBudget[]> {
    return await db.select().from(categoryBudgets);
  }

  async upsertBudget(category: string, monthlyLimit: string): Promise<CategoryBudget> {
    const [result] = await db
      .insert(categoryBudgets)
      .values({ category, monthlyLimit })
      .onConflictDoUpdate({
        target: categoryBudgets.category,
        set: { monthlyLimit },
      })
      .returning();
    return result;
  }

  async deleteBudget(id: number): Promise<void> {
    await db.delete(categoryBudgets).where(eq(categoryBudgets.id, id));
  }
}

export const storage = new DatabaseStorage();
