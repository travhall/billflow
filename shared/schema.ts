import { pgTable, text, serial, integer, boolean, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const categoryBudgets = pgTable("category_budgets", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().unique(),
  monthlyLimit: numeric("monthly_limit").notNull(),
});

export const insertCategoryBudgetSchema = createInsertSchema(categoryBudgets).omit({ id: true });
export type CategoryBudget = typeof categoryBudgets.$inferSelect;
export type InsertCategoryBudget = z.infer<typeof insertCategoryBudgetSchema>;

export const bills = pgTable("bills", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  defaultAmount: numeric("default_amount").notNull(), // Use string for decimals
  isVariable: boolean("is_variable").default(false).notNull(),
  frequency: text("frequency", { enum: ["monthly", "yearly"] }).notNull(),
  dueDay: integer("due_day").notNull(), // 1-31
  dueMonth: integer("due_month"), // 1-12, used for yearly along with dueDay
  isAutoPay: boolean("is_auto_pay").default(false).notNull(),
  archived: boolean("archived").default(false).notNull(),
  reminderDays: integer("reminder_days"), // days before due date to send notification; null = no reminder
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull(),
  amount: numeric("amount").notNull(),
  dueDate: timestamp("due_date").notNull(),
  paidDate: timestamp("paid_date"),
  status: text("status", { enum: ["paid", "pending", "overdue"] }).default("pending").notNull(),
  notes: text("notes"),
}, (table) => ({
  dueDateIdx: index("payments_due_date_idx").on(table.dueDate),
}));

export const billsRelations = relations(bills, ({ many }) => ({
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  bill: one(bills, {
    fields: [payments.billId],
    references: [bills.id],
  }),
}));

export const insertBillSchema = createInsertSchema(bills).omit({ id: true });
export const insertPaymentSchema = createInsertSchema(payments, {
  dueDate: z.coerce.date(),
  paidDate: z.coerce.date(),
}).omit({ id: true });

export type Bill = typeof bills.$inferSelect;
export type InsertBill = z.infer<typeof insertBillSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

// Request types
export type CreateBillRequest = InsertBill;
export type UpdateBillRequest = Partial<InsertBill>;
export type CreatePaymentRequest = InsertPayment;
export type UpdatePaymentRequest = Partial<InsertPayment>;
