import { db } from "./db";
import {
  bills, payments, categoryBudgets,
  type Bill, type InsertBill, type Payment, type InsertPayment,
  type UpdateBillRequest, type UpdatePaymentRequest,
  type CategoryBudget,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { getNextCycleDueDate } from "@shared/date-utils";

export interface IStorage {
  getBills(): Promise<Bill[]>;
  getBill(id: number): Promise<Bill | undefined>;
  createBill(bill: InsertBill): Promise<Bill>;
  updateBill(id: number, updates: UpdateBillRequest): Promise<Bill>;
  deleteBill(id: number): Promise<void>;

  getPayments(): Promise<Payment[]>;
  getPaymentsByBill(billId: number): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: number, updates: UpdatePaymentRequest): Promise<Payment>;
  deletePayment(id: number): Promise<void>;
  resetPayment(id: number): Promise<Payment>;
  revertPayment(id: number): Promise<Payment>;

  getBudgets(): Promise<CategoryBudget[]>;
  upsertBudget(category: string, monthlyLimit: string): Promise<CategoryBudget>;
  deleteBudget(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getBills(): Promise<Bill[]> {
    return await db.select().from(bills).where(eq(bills.archived, false));
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
    return updated;
  }

  async deleteBill(id: number): Promise<void> {
    await db.update(bills).set({ archived: true }).where(eq(bills.id, id));
  }

  async getPayments(): Promise<Payment[]> {
    const allPayments = await db.select().from(payments).orderBy(desc(payments.dueDate));
    
    // Auto-pay logic: check if any pending/overdue payments for auto-pay bills have passed their due date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const payment of allPayments) {
      if (payment.status !== "paid" && new Date(payment.dueDate) < today) {
        const [bill] = await db.select().from(bills).where(eq(bills.id, payment.billId));
        if (bill && bill.isAutoPay) {
          await db.update(payments)
            .set({ status: "paid", paidDate: new Date() })
            .where(eq(payments.id, payment.id));
          await this.resetPayment(payment.id);
        }
      }
    }

    return await db.select().from(payments).orderBy(desc(payments.dueDate));
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
    return updated;
  }

  async deletePayment(id: number): Promise<void> {
    await db.delete(payments).where(eq(payments.id, id));
  }

  async resetPayment(id: number): Promise<Payment> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    if (!payment) throw new Error("Payment not found");

    const [bill] = await db.select().from(bills).where(eq(bills.id, payment.billId));
    if (!bill) throw new Error("Bill not found");

    const currentDueDate = new Date(payment.dueDate);
    const nextDueDate = getNextCycleDueDate(currentDueDate, bill.frequency);

    const [newPayment] = await db.insert(payments).values({
      billId: payment.billId,
      amount: bill.defaultAmount,
      dueDate: nextDueDate,
      status: "pending",
    }).returning();

    return newPayment;
  }

  async revertPayment(id: number): Promise<Payment> {
    const [updated] = await db.update(payments)
      .set({ status: "pending", paidDate: null })
      .where(eq(payments.id, id))
      .returning();
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
