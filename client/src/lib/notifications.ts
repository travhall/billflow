import { differenceInDays, parseISO, setDate, startOfDay } from "date-fns";
import type { Bill, Payment, CategoryBudget } from "@shared/schema";
import { getDueDateForMonth } from "@shared/date-utils";

export type NotificationPermission = "granted" | "denied" | "default";

export function getNotificationPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission as NotificationPermission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  const result = await Notification.requestPermission();
  return result as NotificationPermission;
}

function sendNotification(title: string, body: string, tag: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(title, {
    body,
    tag,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
  });
}

function getBillDueDate(bill: Bill, today: Date): Date {
  const due = getDueDateForMonth(bill, today);
  return due ?? setDate(startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)), bill.dueDay);
}

function getLastNotifiedKey(billId: number, type: "reminder" | "overdue"): string {
  return `billflow_notified_${type}_${billId}`;
}

function wasNotifiedToday(key: string): boolean {
  const stored = localStorage.getItem(key);
  if (!stored) return false;
  return stored === new Date().toDateString();
}

function markNotifiedToday(key: string) {
  localStorage.setItem(key, new Date().toDateString());
}

export function sendTestNotification() {
  if (!("Notification" in window)) {
    alert("This browser does not support notifications.");
    return;
  }
  if (Notification.permission !== "granted") {
    alert("Notifications are not enabled. Open any bill's edit menu and click Enable under Payment Reminder first.");
    return;
  }
  new Notification("🔔 BillFlow Test", {
    body: "Notifications are working! You'll be reminded before bills are due.",
    tag: `billflow-test-${Date.now()}`,
    icon: "/favicon.ico",
  });
}

export function checkAndSendReminders(bills: Bill[], payments: Payment[]) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const today = startOfDay(new Date());

  for (const bill of bills) {
    if (bill.archived) continue;

    const dueDate = getBillDueDate(bill, today);

    // Check if already paid this cycle
    const isPaidThisCycle = payments.some((p) => {
      if (p.billId !== bill.id || p.status !== "paid") return false;
      const pd = startOfDay(parseISO(p.dueDate as unknown as string));
      return pd.getTime() === dueDate.getTime();
    });

    if (isPaidThisCycle) continue;

    const daysUntilDue = differenceInDays(dueDate, today);

    // --- Overdue notification ---
    if (daysUntilDue < 0) {
      const key = getLastNotifiedKey(bill.id, "overdue");
      if (!wasNotifiedToday(key)) {
        sendNotification(
          `⚠️ Overdue: ${bill.name}`,
          `This bill was due ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? "s" : ""} ago. Don't forget to mark it paid.`,
          `overdue-${bill.id}`
        );
        markNotifiedToday(key);
      }
      continue;
    }

    // --- Upcoming reminder notification ---
    if (bill.reminderDays !== null && bill.reminderDays !== undefined) {
      if (daysUntilDue <= bill.reminderDays) {
        const key = getLastNotifiedKey(bill.id, "reminder");
        if (!wasNotifiedToday(key)) {
          const msg =
            daysUntilDue === 0
              ? `${bill.name} is due today!`
              : `${bill.name} is due in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""}.`;
          sendNotification(`🔔 Bill Reminder: ${bill.name}`, msg, `reminder-${bill.id}`);
          markNotifiedToday(key);
        }
      }
    }
  }
}

function getBudgetNotifiedKey(category: string): string {
  return `billflow_notified_budget_${category}`;
}

export function checkBudgetOverages(payments: Payment[], bills: Bill[], budgets: CategoryBudget[]) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (budgets.length === 0) return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const billMap = new Map(bills.map(b => [b.id, b]));
  const spendByCategory = new Map<string, number>();

  for (const p of payments) {
    if (p.status !== "paid" || !p.paidDate) continue;
    const paidDate = new Date(p.paidDate as unknown as string);
    if (paidDate < monthStart) continue;
    const category = billMap.get(p.billId)?.category ?? "Other";
    spendByCategory.set(category, (spendByCategory.get(category) ?? 0) + Number(p.amount));
  }

  for (const budget of budgets) {
    const spent = spendByCategory.get(budget.category) ?? 0;
    const limit = Number(budget.monthlyLimit);
    if (spent <= limit) continue;

    const key = getBudgetNotifiedKey(budget.category);
    if (wasNotifiedToday(key)) continue;

    sendNotification(
      `📊 Budget Exceeded: ${budget.category}`,
      `You've spent $${spent.toFixed(2)} this month, over your $${limit.toFixed(2)} limit.`,
      `budget-${budget.category}`
    );
    markNotifiedToday(key);
  }
}
