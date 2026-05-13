import { useBills } from "@/hooks/use-bills";
import { usePayments } from "@/hooks/use-payments";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { clsx } from "clsx";
import { motion } from "framer-motion";
import {
  addMonths,
  startOfMonth,
  setDate,
  setMonth,
  startOfDay,
  isBefore,
  parseISO,
  format,
  isSameMonth,
  isSameYear,
} from "date-fns";
import { type Bill, type Payment } from "@shared/schema";
import { formatCurrency } from "@/lib/utils";
import { CalendarClock } from "lucide-react";

function getMonthDueDate(bill: Bill, monthDate: Date): Date | null {
  if (bill.frequency === "monthly") {
    const day = Math.min(bill.dueDay, new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate());
    return setDate(startOfMonth(monthDate), day);
  }
  if (bill.frequency === "yearly" && bill.dueMonth) {
    if (bill.dueMonth === monthDate.getMonth() + 1) {
      const day = Math.min(bill.dueDay, new Date(monthDate.getFullYear(), bill.dueMonth, 0).getDate());
      return new Date(monthDate.getFullYear(), bill.dueMonth - 1, day);
    }
  }
  return null;
}

function getPaymentForMonth(payments: Payment[], billId: number, monthDate: Date): Payment | undefined {
  return payments.find((p) => {
    if (p.billId !== billId) return false;
    const d = parseISO(p.dueDate as unknown as string);
    return isSameMonth(d, monthDate) && isSameYear(d, monthDate);
  });
}

interface MonthColumnProps {
  monthDate: Date;
  bills: Bill[];
  payments: Payment[];
  today: Date;
  isCurrentMonth: boolean;
}

function MonthColumn({ monthDate, bills, payments, today, isCurrentMonth }: MonthColumnProps) {
  const activeBills = bills.filter((b) => !b.archived);

  const rows = activeBills
    .map((bill) => {
      const dueDate = getMonthDueDate(bill, monthDate);
      if (!dueDate) return null;

      const payment = getPaymentForMonth(payments, bill.id, monthDate);
      let status: "paid" | "overdue" | "pending" | "upcoming";
      let amount = payment?.amount ?? bill.defaultAmount;

      if (payment?.status === "paid") {
        status = "paid";
      } else if (isBefore(dueDate, today) && !payment) {
        status = isCurrentMonth ? "overdue" : "upcoming";
      } else if (isBefore(dueDate, today) && payment?.status !== "paid") {
        status = "overdue";
      } else {
        status = isCurrentMonth ? "pending" : "upcoming";
      }

      return { bill, dueDate, status, amount };
    })
    .filter(Boolean)
    .sort((a, b) => a!.dueDate.getTime() - b!.dueDate.getTime()) as {
      bill: Bill;
      dueDate: Date;
      status: "paid" | "overdue" | "pending" | "upcoming";
      amount: string;
    }[];

  const totalDue = rows.reduce((sum, r) => sum + Number(r.bill.defaultAmount), 0);
  const totalPaid = rows.filter((r) => r.status === "paid").reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div className={clsx(
      "flex flex-col rounded-2xl border overflow-hidden transition-colors",
      isCurrentMonth
        ? "border-primary/30 shadow-md shadow-primary/5"
        : "border-border"
    )}>
      {/* Month header */}
      <div className={clsx(
        "px-5 py-4 border-b",
        isCurrentMonth ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"
      )}>
        <div className="flex items-center justify-between">
          <div>
            <p className={clsx("text-xs font-semibold uppercase tracking-wider mb-0.5", isCurrentMonth ? "text-primary" : "text-muted-foreground")}>
              {isCurrentMonth ? "This Month" : format(monthDate, "MMMM")}
            </p>
            <h3 className="text-lg font-display font-bold text-foreground">
              {format(monthDate, isCurrentMonth ? "MMMM yyyy" : "MMM yyyy")}
            </h3>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-0.5">Total</p>
            <p className="text-base font-display font-bold text-foreground">{formatCurrency(totalDue)}</p>
          </div>
        </div>

        {/* Progress bar */}
        {totalDue > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{formatCurrency(totalPaid)} paid</span>
              <span>{Math.round((totalPaid / totalDue) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (totalPaid / totalDue) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bill rows */}
      <div className="flex-1 divide-y divide-border bg-card">
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No bills this month</div>
        ) : (
          rows.map(({ bill, dueDate, status, amount }) => (
            <div key={bill.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/20 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{bill.name}</p>
                  {bill.isAutoPay && (
                    <Badge variant="outline" className="h-4 text-[9px] px-1.5 bg-primary/5 text-primary border-primary/20 shrink-0">
                      Auto
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Due {format(dueDate, "MMM d")} · {bill.category}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-display font-bold text-foreground">{formatCurrency(Number(amount))}</p>
                <Badge
                  variant="outline"
                  className={clsx(
                    "mt-1 text-[10px] font-semibold capitalize h-4 px-1.5",
                    status === "paid"    && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                    status === "overdue" && "bg-rose-500/10 text-rose-500 border-rose-500/20",
                    status === "pending" && "bg-amber-500/10 text-amber-600 border-amber-500/20",
                    status === "upcoming" && "bg-muted text-muted-foreground border-border"
                  )}
                >
                  {status}
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Upcoming() {
  const { data: bills, isLoading: billsLoading } = useBills();
  const { data: payments, isLoading: paymentsLoading } = usePayments();

  if (billsLoading || paymentsLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-96 rounded-2xl" />)}
          </div>
        </div>
      </Layout>
    );
  }

  const today = startOfDay(new Date());
  const months = [today, addMonths(today, 1), addMonths(today, 2)];

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Upcoming Bills</h1>
            <p className="text-muted-foreground">Your next 3 months at a glance</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {months.map((monthDate, i) => (
            <MonthColumn
              key={i}
              monthDate={monthDate}
              bills={bills ?? []}
              payments={payments ?? []}
              today={today}
              isCurrentMonth={i === 0}
            />
          ))}
        </div>
      </motion.div>
    </Layout>
  );
}
