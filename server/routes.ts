import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

async function seedData() {
  const existingBills = await storage.getBills();
  if (existingBills.length === 0) {
    console.log("Seeding data...");
    const bills = [
      { name: "Rent", category: "Housing", defaultAmount: "1200", isVariable: false, frequency: "monthly", dueDay: 1 },
      { name: "Electricity", category: "Utilities", defaultAmount: "100", isVariable: true, frequency: "monthly", dueDay: 15 },
      { name: "Internet", category: "Utilities", defaultAmount: "60", isVariable: false, frequency: "monthly", dueDay: 20 },
      { name: "Car Insurance", category: "Insurance", defaultAmount: "600", isVariable: false, frequency: "yearly", dueMonth: 6, dueDay: 15 },
      { name: "Netflix", category: "Subscriptions", defaultAmount: "15", isVariable: false, frequency: "monthly", dueDay: 5 },
    ];

    for (const b of bills) {
      await storage.createBill(b as any);
    }
    console.log("Seeding complete.");
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedData();
  await storage.processAutoPay();

  // Bills
  app.get(api.bills.list.path, async (req, res) => {
    const bills = await storage.getBills();
    res.json(bills);
  });

  app.post(api.bills.create.path, async (req, res) => {
    try {
      const input = api.bills.create.input.parse(req.body);
      const bill = await storage.createBill(input);
      res.status(201).json(bill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.issues[0].message,
          field: err.issues[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.bills.update.path, async (req, res) => {
    try {
      const input = api.bills.update.input.parse(req.body);
      const bill = await storage.updateBill(Number(req.params.id), input);
      res.json(bill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.issues[0].message,
          field: err.issues[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.bills.delete.path, async (req, res) => {
    await storage.deleteBill(Number(req.params.id));
    res.status(204).send();
  });

  // Payments
  app.get(api.payments.list.path, async (req, res) => {
    await storage.processAutoPay();
    const payments = await storage.getPayments();
    res.json(payments);
  });

  app.post(api.payments.create.path, async (req, res) => {
    try {
      const input = api.payments.create.input.parse(req.body);
      const payment = await storage.createPayment(input);
      res.status(201).json(payment);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.issues[0].message,
          field: err.issues[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.payments.update.path, async (req, res) => {
    try {
      const input = api.payments.update.input.parse(req.body);
      const payment = await storage.updatePayment(Number(req.params.id), input);
      res.json(payment);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.issues[0].message,
          field: err.issues[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.payments.delete.path, async (req, res) => {
    await storage.deletePayment(Number(req.params.id));
    res.status(204).send();
  });

  app.post("/api/payments/:id/reset", async (req, res) => {
    try {
      const payment = await storage.resetPayment(Number(req.params.id));
      res.json(payment);
    } catch (err) {
      res.status(404).json({ message: err instanceof Error ? err.message : "Unknown error" });
    }
  });

  app.post("/api/payments/:id/revert", async (req, res) => {
    try {
      const payment = await storage.revertPayment(Number(req.params.id));
      res.json(payment);
    } catch (err) {
      res.status(404).json({ message: err instanceof Error ? err.message : "Unknown error" });
    }
  });

  app.post("/api/payments/:id/mark-paid-and-reset", async (req, res) => {
    try {
      const input = z.object({
        amount: z.string(),
        paidDate: z.coerce.date(),
      }).parse(req.body);
      const result = await storage.markPaidAndReset(Number(req.params.id), input);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.issues[0].message });
      }
      if (err instanceof Error && err.message === "Payment not found") {
        return res.status(404).json({ message: err.message });
      }
      throw err;
    }
  });

  // Category budgets
  app.get("/api/budgets", async (_req, res) => {
    const budgets = await storage.getBudgets();
    res.json(budgets);
  });

  app.post("/api/budgets", async (req, res) => {
    try {
      const { category, monthlyLimit } = z.object({
        category: z.string().min(1),
        monthlyLimit: z.string().min(1),
      }).parse(req.body);
      const budget = await storage.upsertBudget(category, monthlyLimit);
      res.status(201).json(budget);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.issues[0].message });
      }
      throw err;
    }
  });

  app.delete("/api/budgets/:id", async (req, res) => {
    await storage.deleteBudget(Number(req.params.id));
    res.status(204).send();
  });

  return httpServer;
}
