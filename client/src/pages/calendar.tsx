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
import { type Bill, type Payment, type PaySchedule } from "@shared/schema";
import { getDueDateForMonth, getPaydaysInMonth, type PayScheduleInput } from "@shared/date-utils";
import { getCategoryColor } from "@/lib/category-colors";
import { formatCurrency } from "@/lib/utils";
import { ChevronLeft, ChevronRight, DollarSign, Pencil } from "lucide-react";

function getMonthDueDate(bill: Bill, monthDate: Date): Date | null {
  if (bill.frequency === "yearly" && bill.dueMonth !== monthDate.getMonth() + 1) {
    return null;
  }
  return getDueDateForMonth(bill, monthDate);
}

function toScheduleInput(schedule: PaySchedule): PayScheduleInput {
  if (schedule.type === "monthly") {
    return { type: "monthly", daysOfMonth: schedule.daysOfMonth ?? [] };
  }
  return {
    type: "interval",
    anchorDate: parseISO(schedule.anchorDate as unknown as string),
    intervalDays: schedule.intervalDays ?? 14,
  };
}

function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"][n % 10 > 3 || [11, 12, 13].includes(n % 100) ? 0 : n % 10];
  return `${n}${suffix}`;
}

function describeSchedule(schedule: PaySchedule): string {
  if (schedule.type === "monthly") {
    return `Every ${(schedule.daysOfMonth ?? []).map(ordinal).join(" and ")} of the month`;
  }
  const anchor = format(parseISO(schedule.anchorDate as unknown as string), "MMM d");
  return `Every ${schedule.intervalDays} days, starting ${anchor}`;
}

type DayBill = { bill: Bill; amount: string; status: "paid" | "overdue" | "pending" };

function PayScheduleForm({
  initial,
  onCancel,
}: {
  initial?: PaySchedule;
  onCancel?: () => void;
}) {
  const [type, setType] = useState<"interval" | "monthly">(initial?.type ?? "interval");
  const [anchorDate, setAnchorDate] = useState(
    initial?.type === "interval" && initial.anchorDate
      ? format(parseISO(initial.anchorDate as unknown as string), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd")
  );
  const [intervalDays, setIntervalDays] = useState(String(initial?.type === "interval" ? initial.intervalDays ?? 14 : 14));
  const [daysOfMonth, setDaysOfMonth] = useState(
    initial?.type === "monthly" ? (initial.daysOfMonth ?? []).join(", ") : "1, 15"
  );
  const upsert = useUpsertPaySchedule();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === "interval") {
      const interval = Number(intervalDays);
      if (!anchorDate || !Number.isFinite(interval) || interval <= 0) return;
      upsert.mutate(
        { type: "interval", anchorDate: new Date(`${anchorDate}T00:00:00`), intervalDays: Math.round(interval) },
        { onSuccess: () => onCancel?.() }
      );
    } else {
      const days = daysOfMonth
        .split(",")
        .map((d) => Number(d.trim()))
        .filter((d) => Number.isFinite(d) && d >= 1 && d <= 31);
      if (days.length === 0) return;
      upsert.mutate({ type: "monthly", daysOfMonth: days }, { onSuccess: () => onCancel?.() });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-1.5">
        <Button type="button" size="sm" variant={type === "interval" ? "default" : "outline"} onClick={() => setType("interval")}>
          Every N days
        </Button>
        <Button type="button" size="sm" variant={type === "monthly" ? "default" : "outline"} onClick={() => setType("monthly")}>
          Fixed day(s) of month
        </Button>
      </div>

      {type === "interval" ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="anchor-date" className="text-xs">A confirmed payday</Label>
            <Input id="anchor-date" type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} className="w-40 h-8" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="interval-days" className="text-xs">Days between paydays</Label>
            <Input id="interval-days" type="number" min={1} step={1} value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} className="w-28 h-8" required />
          </div>
          <Button type="submit" size="sm" disabled={upsert.isPending}>{upsert.isPending ? "Saving…" : "Save"}</Button>
          {onCancel && <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="days-of-month" className="text-xs">Day(s) of the month (comma-separated)</Label>
            <Input id="days-of-month" type="text" placeholder="1, 15" value={daysOfMonth} onChange={(e) => setDaysOfMonth(e.target.value)} className="w-40 h-8" required />
          </div>
          <Button type="submit" size="sm" disabled={upsert.isPending}>{upsert.isPending ? "Saving…" : "Save"}</Button>
          {onCancel && <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>}
        </div>
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
    return getPaydaysInMonth(toScheduleInput(schedule), monthDate.getFullYear(), monthDate.getMonth());
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
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-display font-bold text-foreground">Calendar</h1>
        </div>

        {!schedule && !editingSchedule ? (
          <div className="bg-card border border-border rounded-xl p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Set your pay schedule to see paydays on the calendar.
            </p>
            <PayScheduleForm />
          </div>
        ) : editingSchedule ? (
          <div className="bg-card border border-border rounded-xl p-3">
            <PayScheduleForm initial={schedule ?? undefined} onCancel={() => setEditingSchedule(false)} />
          </div>
        ) : null}

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setMonthDate((d) => subMonths(d, 1))} aria-label="Previous month">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <h2 className="text-sm font-display font-bold text-foreground w-32 text-center">
                {format(monthDate, "MMMM yyyy")}
              </h2>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setMonthDate((d) => addMonths(d, 1))} aria-label="Next month">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            {schedule && !editingSchedule && (
              <button
                onClick={() => setEditingSchedule(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <DollarSign className="h-3 w-3 text-emerald-600" />
                {describeSchedule(schedule)}
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-7 border-b border-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                    "min-h-16 border-b border-r border-border p-1.5 text-left flex flex-col gap-1 transition-colors hover:bg-muted/30",
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
                    {isPayday && <DollarSign className="h-3 w-3 text-emerald-600 shrink-0" />}
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
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-bold text-foreground">
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
      </div>
    </Layout>
  );
}
