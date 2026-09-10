import { useMemo, useState } from "react";
import { useBills } from "@/hooks/use-bills";
import { usePayments } from "@/hooks/use-payments";
import { usePaySchedule, useUpsertPaySchedule } from "@/hooks/use-pay-schedule";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clsx } from "clsx";
import { motion } from "framer-motion";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isBefore,
  isToday,
  startOfDay,
  parseISO,
  format,
} from "date-fns";
import { type Bill, type Payment } from "@shared/schema";
import { getDueDateForMonth, getPaydaysInMonth } from "@shared/date-utils";
import { getCategoryColor } from "@/lib/category-colors";
import { formatCurrency } from "@/lib/utils";
import { CalendarDays, ChevronLeft, ChevronRight, DollarSign, Pencil } from "lucide-react";

function getMonthDueDate(bill: Bill, monthDate: Date): Date | null {
  if (bill.frequency === "yearly" && bill.dueMonth !== monthDate.getMonth() + 1) {
    return null;
  }
  return getDueDateForMonth(bill, monthDate);
}

type DayBill = { bill: Bill; amount: string; status: "paid" | "overdue" | "pending" };

function PayScheduleForm({
  initial,
  onCancel,
}: {
  initial?: { anchorDate: string; intervalDays: number };
  onCancel?: () => void;
}) {
  const [anchorDate, setAnchorDate] = useState(initial?.anchorDate ?? format(new Date(), "yyyy-MM-dd"));
  const [intervalDays, setIntervalDays] = useState(String(initial?.intervalDays ?? 14));
  const upsert = useUpsertPaySchedule();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const interval = Number(intervalDays);
    if (!anchorDate || !Number.isFinite(interval) || interval <= 0) return;
    upsert.mutate(
      { anchorDate: new Date(`${anchorDate}T00:00:00`), intervalDays: Math.round(interval) },
      { onSuccess: () => onCancel?.() }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="anchor-date">A confirmed payday</Label>
        <Input
          id="anchor-date"
          type="date"
          value={anchorDate}
          onChange={(e) => setAnchorDate(e.target.value)}
          className="w-44"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="interval-days">Days between paydays</Label>
        <Input
          id="interval-days"
          type="number"
          min={1}
          step={1}
          value={intervalDays}
          onChange={(e) => setIntervalDays(e.target.value)}
          className="w-32"
          required
        />
      </div>
      <Button type="submit" disabled={upsert.isPending}>
        {upsert.isPending ? "Saving…" : "Save schedule"}
      </Button>
      {onCancel && (
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </form>
  );
}

export default function CalendarPage() {
  const { data: bills, isLoading: billsLoading } = useBills();
  const { data: payments, isLoading: paymentsLoading } = usePayments();
  const { data: schedule, isLoading: scheduleLoading } = usePaySchedule();

  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editingSchedule, setEditingSchedule] = useState(false);

  const paymentsByBillAndMonth = useMemo(() => {
    const map = new Map<string, Payment>();
    for (const p of payments ?? []) {
      const d = parseISO(p.dueDate as unknown as string);
      const key = `${p.billId}-${d.getFullYear()}-${d.getMonth()}`;
      map.set(key, p);
    }
    return map;
  }, [payments]);

  const today = startOfDay(new Date());

  const billsByDay = useMemo(() => {
    const map = new Map<string, DayBill[]>();
    const activeBills = (bills ?? []).filter((b) => !b.archived);

    for (const bill of activeBills) {
      const dueDate = getMonthDueDate(bill, monthDate);
      if (!dueDate) continue;

      const key = `${bill.id}-${monthDate.getFullYear()}-${monthDate.getMonth()}`;
      const payment = paymentsByBillAndMonth.get(key);
      const amount = payment?.amount ?? bill.defaultAmount;

      let status: "paid" | "overdue" | "pending";
      if (payment?.status === "paid") {
        status = "paid";
      } else if (isBefore(dueDate, today)) {
        status = "overdue";
      } else {
        status = "pending";
      }

      const dayKey = format(dueDate, "yyyy-MM-dd");
      const entry = map.get(dayKey) ?? [];
      entry.push({ bill, amount, status });
      map.set(dayKey, entry);
    }

    return map;
  }, [bills, monthDate, paymentsByBillAndMonth, today]);

  const paydays = useMemo(() => {
    if (!schedule) return [];
    return getPaydaysInMonth(
      { anchorDate: parseISO(schedule.anchorDate as unknown as string), intervalDays: schedule.intervalDays },
      monthDate.getFullYear(),
      monthDate.getMonth()
    );
  }, [schedule, monthDate]);

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthDate));
    const end = endOfWeek(endOfMonth(monthDate));
    return eachDayOfInterval({ start, end });
  }, [monthDate]);

  const selectedDayBills = selectedDate ? billsByDay.get(format(selectedDate, "yyyy-MM-dd")) ?? [] : [];

  if (billsLoading || paymentsLoading || scheduleLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Calendar</h1>
            <p className="text-muted-foreground">Bills and paydays, month by month</p>
          </div>
        </div>

        {!schedule && !editingSchedule ? (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <p className="text-sm font-medium text-foreground">Set up your pay schedule</p>
            <p className="text-sm text-muted-foreground">
              Pick one confirmed payday and how many days apart they recur (14 for every-other-Friday). We'll compute every other occurrence from there.
            </p>
            <PayScheduleForm />
          </div>
        ) : editingSchedule ? (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <p className="text-sm font-medium text-foreground">Edit pay schedule</p>
            <PayScheduleForm
              initial={
                schedule
                  ? { anchorDate: format(parseISO(schedule.anchorDate as unknown as string), "yyyy-MM-dd"), intervalDays: schedule.intervalDays }
                  : undefined
              }
              onCancel={() => setEditingSchedule(false)}
            />
          </div>
        ) : null}

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthDate((d) => subMonths(d, 1))} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-display font-bold text-foreground w-40 text-center">
                {format(monthDate, "MMMM yyyy")}
              </h2>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthDate((d) => addMonths(d, 1))} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {schedule && !editingSchedule && (
              <Button variant="ghost" size="sm" onClick={() => setEditingSchedule(true)} className="text-muted-foreground">
                <Pencil className="h-3.5 w-3.5" />
                Edit schedule
              </Button>
            )}
          </div>

          <div className="grid grid-cols-7 border-b border-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {gridDays.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd");
              const dayBills = billsByDay.get(dayKey) ?? [];
              const isPayday = paydays.some((p) => isSameDay(p, day));
              const inMonth = isSameMonth(day, monthDate);
              const selected = selectedDate ? isSameDay(day, selectedDate) : false;

              return (
                <button
                  key={dayKey}
                  onClick={() => setSelectedDate(day)}
                  className={clsx(
                    "min-h-24 border-b border-r border-border p-2 text-left flex flex-col gap-1 transition-colors hover:bg-muted/30",
                    !inMonth && "bg-muted/10 text-muted-foreground/50",
                    selected && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                    isPayday && !selected && "bg-emerald-500/5"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={clsx(
                        "text-xs font-semibold h-5 w-5 flex items-center justify-center rounded-full",
                        isToday(day) && "bg-primary text-primary-foreground"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {isPayday && <DollarSign className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {dayBills.slice(0, 4).map(({ bill }) => (
                      <span
                        key={bill.id}
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: getCategoryColor(bill.category) }}
                        title={bill.name}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedDate && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-display font-bold text-foreground">
                {format(selectedDate, "EEEE, MMMM d")}
                {paydays.some((p) => isSameDay(p, selectedDate)) && (
                  <Badge variant="outline" className="ml-2 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    Payday
                  </Badge>
                )}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
                Close
              </Button>
            </div>
            {selectedDayBills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bills due this day.</p>
            ) : (
              <div className="divide-y divide-border">
                {selectedDayBills.map(({ bill, amount, status }) => (
                  <div key={bill.id} className="flex items-center gap-3 py-3">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: getCategoryColor(bill.category) }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{bill.name}</p>
                      <p className="text-xs text-muted-foreground">{bill.category}</p>
                    </div>
                    <p className="text-sm font-display font-bold text-foreground">{formatCurrency(Number(amount))}</p>
                    <Badge
                      variant="outline"
                      className={clsx(
                        "text-[10px] font-semibold capitalize h-4 px-1.5",
                        status === "paid" && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                        status === "overdue" && "bg-rose-500/10 text-rose-500 border-rose-500/20",
                        status === "pending" && "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      )}
                    >
                      {status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </Layout>
  );
}
