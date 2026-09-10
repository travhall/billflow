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

// Singleton row for now (single-user app), but shaped with its own id so a
// future multi-schedule case wouldn't need a schema migration.
// "interval" recurs every intervalDays from anchorDate (e.g. every-other-
// Friday); "monthly" recurs on fixed day(s) of the month (e.g. 1st and
// 15th), which an interval count can't represent exactly.
export const paySchedules = pgTable("pay_schedules", {
  id: serial("id").primaryKey(),
  type: text("type", { enum: ["interval", "monthly"] }).notNull(),
  anchorDate: timestamp("anchor_date"), // "interval" only: one confirmed payday
  intervalDays: integer("interval_days"), // "interval" only: 14 for biweekly
  daysOfMonth: integer("days_of_month").array(), // "monthly" only: e.g. [1, 15]
});

export const insertPayScheduleSchema = createInsertSchema(paySchedules, {
  anchorDate: z.coerce.date().nullish(),
})
  .omit({ id: true })
  .superRefine((data, ctx) => {
    if (data.type === "interval") {
      if (!data.anchorDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anchorDate"], message: "anchorDate is required for interval schedules" });
      if (!data.intervalDays || data.intervalDays < 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["intervalDays"], message: "intervalDays must be a positive number" });
    } else if (data.type === "monthly") {
      if (!data.daysOfMonth || data.daysOfMonth.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["daysOfMonth"], message: "daysOfMonth must have at least one day" });
      if (data.daysOfMonth?.some((d) => d < 1 || d > 31)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["daysOfMonth"], message: "each day must be between 1 and 31" });
    }
  });
export type PaySchedule = typeof paySchedules.$inferSelect;
export type InsertPaySchedule = z.infer<typeof insertPayScheduleSchema>;

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
