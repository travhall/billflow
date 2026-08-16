import { useBills } from "@/hooks/use-bills";
import { usePayments } from "@/hooks/use-payments";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { clsx } from "clsx";
import { motion } from "framer-motion";
import {
  addMonths,
  startOfDay,
  isBefore,
  parseISO,
  format,
  isSameMonth,
  isSameYear,
} from "date-fns";
import { type Bill, type Payment } from "@shared/schema";
import { getDueDateForMonth } from "@shared/date-utils";
import { formatCurrency } from "@/lib/utils";
import { CalendarClock, TrendingUp } from "lucide-react";

function getMonthDueDate(bill: Bill, monthDate: Date): Date | null {
  // Yearly bills only occur in their due month; getDueDateForMonth always
  // returns a date for yearly bills (ignoring monthDate's month), so gate
  // it here to preserve per-month iteration semantics used by callers.
  if (bill.frequency === "yearly" && bill.dueMonth !== monthDate.getMonth() + 1) {
    return null;
  }
  return getDueDateForMonth(bill, monthDate);
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
                    status === "paid"     && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                    status === "overdue"  && "bg-rose-500/10 text-rose-500 border-rose-500/20",
                    status === "pending"  && "bg-amber-500/10 text-amber-600 border-amber-500/20",
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
          <Skeleton className="h-28 rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
          </div>
        </div>
      </Layout>
    );
  }

  const today = startOfDay(new Date());
  const activeBills = (bills ?? []).filter(b => !b.archived);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(today, i));

  // Compute projected spend per month for the forecast strip
  const forecastData = months.map((monthDate) => {
    const total = activeBills.reduce((sum, bill) => {
      const dueDate = getMonthDueDate(bill, monthDate);
      return dueDate ? sum + Number(bill.defaultAmount) : sum;
    }, 0);
    return { label: format(monthDate, "MMM"), total };
  });

  const maxForecast = Math.max(...forecastData.map(m => m.total), 1);
  const totalForecast = forecastData.reduce((s, m) => s + m.total, 0);
  const avgForecast = totalForecast / 6;

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Upcoming Bills</h1>
            <p className="text-muted-foreground">Your next 6 months at a glance</p>
          </div>
        </div>

        {/* 6-Month Forecast Summary */}
        {activeBills.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card border border-border rounded-2xl p-5"
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">6-Month Forecast</p>
                </div>
                <p className="text-2xl font-display font-bold text-foreground">{formatCurrency(totalForecast)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(avgForecast)} avg / month</p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-xs text-muted-foreground">Based on default bill amounts</p>
                <p className="text-xs text-muted-foreground mt-0.5">Variable bills use their default</p>
              </div>
            </div>
            {/* Mini bar chart */}
            <div className="flex items-end gap-1.5 h-16">
              {forecastData.map((m, i) => {
                const heightPct = maxForecast > 0 ? (m.total / maxForecast) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full flex flex-col justify-end" style={{ height: "48px" }}>
                      <div
                        className={clsx(
                          "w-full rounded-t-md transition-all duration-700",
                          i === 0 ? "bg-primary" : "bg-primary/30"
                        )}
                        style={{ height: `${heightPct}%`, minHeight: m.total > 0 ? "4px" : "0" }}
                        title={formatCurrency(m.total)}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Month columns — 2 rows of 3 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
