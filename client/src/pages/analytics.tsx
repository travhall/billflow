import { Layout } from "@/components/layout";
import { usePayments } from "@/hooks/use-payments";
import { useBills } from "@/hooks/use-bills";
import { useBudgets, useUpsertBudget, useDeleteBudget } from "@/hooks/use-budgets";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import { sumAmounts } from "@/lib/money";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { format, parseISO, subMonths, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { TrendingUp, DollarSign, Calendar, Award, Pencil, Plus, X, Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";

const CATEGORY_COLORS: Record<string, string> = {
  Utilities:     "#6366f1",
  Rent:          "#8b5cf6",
  Housing:       "#8b5cf6",
  Subscription:  "#a78bfa",
  Subscriptions: "#a78bfa",
  Insurance:     "#10b981",
  Debt:          "#f59e0b",
  Other:         "#64748b",
};

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function MonthTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-2 shadow-xl text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-primary font-display font-bold">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-2 shadow-xl text-sm">
      <p className="font-semibold text-foreground">{payload[0].name}</p>
      <p className="text-primary font-display font-bold">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

export default function Analytics() {
  const { data: payments, isLoading: paymentsLoading } = usePayments();
  const { data: bills, isLoading: billsLoading } = useBills();
  const { data: budgets, isLoading: budgetsLoading } = useBudgets();
  const upsertBudget = useUpsertBudget();
  const deleteBudget = useDeleteBudget();

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const isLoading = paymentsLoading || billsLoading || budgetsLoading;

  if (isLoading) {
    return (
      <Layout>
        <Skeleton className="h-10 w-56 mb-2" />
        <Skeleton className="h-5 w-72 mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl mt-6" />
      </Layout>
    );
  }

  const paidPayments = (payments ?? []).filter(p => p.status === "paid" && p.paidDate);
  const billMap = new Map((bills ?? []).map(b => [b.id, b]));
  const budgetMap = new Map((budgets ?? []).map(b => [b.category, b]));

  // ── Monthly spending: last 6 months ─────────────────────────────────────
  const now = new Date();
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(now, 5 - i);
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const total = sumAmounts(
      paidPayments
        .filter(p => {
          const d = parseISO(p.paidDate as unknown as string);
          return isWithinInterval(d, { start, end });
        })
        .map(p => p.amount)
    );
    return { month: format(month, "MMM"), total };
  });

  // ── Category breakdown ───────────────────────────────────────────────────
  const categoryAmounts = new Map<string, string[]>();
  paidPayments.forEach(p => {
    const category = billMap.get(p.billId)?.category ?? "Other";
    categoryAmounts.set(category, [...(categoryAmounts.get(category) ?? []), p.amount]);
  });
  const categoryData = Array.from(categoryAmounts.entries())
    .map(([name, amounts]) => ({ name, value: sumAmounts(amounts) }))
    .sort((a, b) => b.value - a.value);

  // ── Summary stats ────────────────────────────────────────────────────────
  const totalSpent = sumAmounts(paidPayments.map(p => p.amount));

  const thisYear = now.getFullYear();
  const totalThisYear = sumAmounts(
    paidPayments
      .filter(p => new Date(p.paidDate as unknown as string).getFullYear() === thisYear)
      .map(p => p.amount)
  );

  const monthsWithData = monthlyData.filter(m => m.total > 0).length || 1;
  const avgMonthly = monthlyData.reduce((sum, m) => sum + m.total, 0) / monthsWithData;

  const billAmounts = new Map<number, string[]>();
  paidPayments.forEach(p => {
    billAmounts.set(p.billId, [...(billAmounts.get(p.billId) ?? []), p.amount]);
  });
  const billTotals = new Map(
    Array.from(billAmounts.entries()).map(([billId, amounts]) => [billId, sumAmounts(amounts)])
  );
  let topBillName = "—";
  let topBillAmount = 0;
  billTotals.forEach((total, billId) => {
    if (total > topBillAmount) {
      topBillAmount = total;
      topBillName = billMap.get(billId)?.name ?? "Unknown";
    }
  });

  // ── Budget limits: this month's spending per category ───────────────────
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const thisMonthAmounts = new Map<string, string[]>();
  paidPayments.forEach(p => {
    if (!p.paidDate) return;
    const d = parseISO(p.paidDate as unknown as string);
    if (isWithinInterval(d, { start: thisMonthStart, end: thisMonthEnd })) {
      const cat = billMap.get(p.billId)?.category ?? "Other";
      thisMonthAmounts.set(cat, [...(thisMonthAmounts.get(cat) ?? []), p.amount]);
    }
  });
  const thisMonthByCategory = new Map(
    Array.from(thisMonthAmounts.entries()).map(([cat, amounts]) => [cat, sumAmounts(amounts)])
  );

  const allCategories = [...new Set((bills ?? []).map(b => b.category))].sort();

  function startEditing(category: string) {
    const budget = budgetMap.get(category);
    setEditValue(budget ? String(Number(budget.monthlyLimit)) : "");
    setEditingCategory(category);
  }

  function handleSaveLimit(e: React.FormEvent, category: string) {
    e.preventDefault();
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed) && parsed > 0) {
      upsertBudget.mutate({ category, monthlyLimit: parsed.toFixed(2) });
    }
    setEditingCategory(null);
  }

  const summaryCards = [
    { label: "Total Spent", value: formatCurrency(totalSpent), icon: DollarSign, sub: "All time", color: "text-primary", bg: "bg-primary/10" },
    { label: "This Year", value: formatCurrency(totalThisYear), icon: Calendar, sub: String(thisYear), color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Monthly Average", value: formatCurrency(avgMonthly), icon: TrendingUp, sub: "Last 6 months", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Top Bill", value: topBillName, icon: Award, sub: topBillAmount > 0 ? formatCurrency(topBillAmount) + " total" : "No data", color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-8"
      >
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Spending Analytics</h1>
          <p className="text-muted-foreground mt-1">Insights into your bill payments over time.</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summaryCards.map((card, i) => (
            <motion.div key={card.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Card className="bg-card border-border hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-0.5">{card.label}</p>
                  <p className="text-xl font-display font-bold text-foreground truncate">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly bar chart */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-2">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-foreground">Monthly Spending</CardTitle>
                <p className="text-xs text-muted-foreground">Paid bills over the last 6 months</p>
              </CardHeader>
              <CardContent>
                {monthlyData.every(m => m.total === 0) ? (
                  <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">No paid bills in the last 6 months.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={monthlyData} margin={{ top: 4, right: 0, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                      <Tooltip content={<MonthTooltip />} cursor={{ fill: "hsl(var(--muted)/0.4)" }} />
                      <Bar dataKey="total" radius={[8, 8, 0, 0]} fill="hsl(var(--primary))" maxBarSize={52} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Category donut */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-foreground">By Category</CardTitle>
                <p className="text-xs text-muted-foreground">All-time spending breakdown</p>
              </CardHeader>
              <CardContent>
                {categoryData.length === 0 ? (
                  <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">No data yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="45%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                        {categoryData.map((entry) => (
                          <Cell key={entry.name} fill={getCategoryColor(entry.name)} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => (
                          <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 11 }}>{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Category Budget Limits */}
        {allCategories.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }}>
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-semibold text-foreground">Monthly Budget Limits</CardTitle>
                    <p className="text-xs text-muted-foreground">Set per-category caps and track this month's spending</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  {allCategories.map(category => {
                    const budget = budgetMap.get(category);
                    const spent = thisMonthByCategory.get(category) ?? 0;
                    const limit = budget ? Number(budget.monthlyLimit) : null;
                    const pct = limit ? Math.min(100, (spent / limit) * 100) : 0;
                    const isOver = limit !== null && spent > limit;
                    const isNear = limit !== null && pct >= 80 && !isOver;
                    const isEditing = editingCategory === category;

                    return (
                      <div key={category} className="flex items-start gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
                          style={{ background: getCategoryColor(category) + "22", color: getCategoryColor(category) }}
                        >
                          {category.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-medium text-foreground">{category}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isEditing ? (
                                <form onSubmit={(e) => handleSaveLimit(e, category)} className="flex items-center gap-1">
                                  <span className="text-xs text-muted-foreground">$</span>
                                  <input
                                    type="number"
                                    min="1"
                                    step="any"
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    onKeyDown={e => e.key === "Escape" && setEditingCategory(null)}
                                    autoFocus
                                    className="w-20 h-6 text-xs border border-border rounded-md px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    data-testid={`input-budget-${category}`}
                                  />
                                  <button type="submit" className="p-1 rounded hover:bg-muted text-emerald-500" title="Save">
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  {budget && (
                                    <button
                                      type="button"
                                      onClick={() => { deleteBudget.mutate(budget.id); setEditingCategory(null); }}
                                      className="p-1 rounded hover:bg-muted text-rose-500"
                                      title="Remove limit"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button type="button" onClick={() => setEditingCategory(null)} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Cancel">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </form>
                              ) : (
                                <>
                                  <span className={clsx(
                                    "text-xs font-medium",
                                    isOver ? "text-rose-500" : isNear ? "text-amber-500" : "text-muted-foreground"
                                  )}>
                                    {formatCurrency(spent)}
                                    {limit !== null && (
                                      <span className="text-muted-foreground font-normal"> / {formatCurrency(limit)}</span>
                                    )}
                                  </span>
                                  <button
                                    onClick={() => startEditing(category)}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                    title={limit !== null ? "Edit limit" : "Set limit"}
                                    data-testid={`button-budget-edit-${category}`}
                                  >
                                    {limit !== null ? <Pencil className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          {limit !== null ? (
                            <>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={clsx(
                                    "h-full rounded-full transition-all duration-700",
                                    isOver ? "bg-rose-500" : isNear ? "bg-amber-500" : "bg-primary"
                                  )}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              {isOver && (
                                <p className="text-[10px] text-rose-500 mt-0.5">
                                  Over by {formatCurrency(spent - limit)} this month
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground/60">No limit set — click + to add one</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Top bills table */}
        {billTotals.size > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.52 }}>
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-foreground">Bills by Total Paid</CardTitle>
                <p className="text-xs text-muted-foreground">Cumulative payments per bill, all time</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Array.from(billTotals.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([billId, total]) => {
                      const bill = billMap.get(billId);
                      const pct = Math.round((total / topBillAmount) * 100);
                      return (
                        <div key={billId} className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ background: getCategoryColor(bill?.category ?? "Other") + "22", color: getCategoryColor(bill?.category ?? "Other") }}
                          >
                            {bill?.name?.charAt(0) ?? "?"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-sm font-medium text-foreground truncate">{bill?.name ?? "Unknown"}</span>
                              <span className="text-sm font-display font-bold text-foreground ml-2 shrink-0">{formatCurrency(total)}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, background: getCategoryColor(bill?.category ?? "Other") }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
}
