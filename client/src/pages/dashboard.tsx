import { useBills } from "@/hooks/use-bills";
import { usePayments } from "@/hooks/use-payments";
import { Layout } from "@/components/layout";
import { StatsCards } from "@/components/stats-cards";
import { CreateBillDialog, useCreateBillStore } from "@/components/create-bill-dialog";
import { ImportBillsDialog } from "@/components/import-bills-dialog";
import { MarkPaidDialog, useMarkPaidDialog } from "@/components/mark-paid-dialog";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { EditBillDialog } from "@/components/edit-bill-dialog";
import { BillHistorySheet } from "@/components/bill-history-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clsx } from "clsx";
import { type Bill } from "@shared/schema";
import { startOfMonth, endOfMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay, format } from "date-fns";
import { sumAmounts } from "@/lib/money";
import { getBillCycleStatus } from "@/lib/bill-status";
import { useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Archive, Edit2, RotateCcw, Undo2, AlertTriangle, X, CreditCard, FlaskConical, Bell, ChevronDown, Search } from "lucide-react";
import { sendTestNotification, getNotificationPermission, requestNotificationPermission } from "@/lib/notifications";
import { useDeleteBill } from "@/hooks/use-bills";
import { useResetPayment, useRevertPayment } from "@/hooks/use-payments";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/utils";

import { useState, useRef } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
} | null;

type BillStatusItem = {
  bill: Bill;
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
};

function SortIcon({ column, sortConfig }: { column: string; sortConfig: SortConfig }) {
  if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
  return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
}

function getUrgencyDisplay(item: BillStatusItem): { label: string; className: string } {
  if (item.status === "paid") {
    return { label: "Paid", className: "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" };
  }
  if (item.status === "overdue") {
    return { label: "Overdue", className: "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/20" };
  }
  const today = new Date();
  const isCurrentCycle = item.bill.frequency === "monthly"
    ? isSameMonth(item.dueDate, today) && isSameYear(item.dueDate, today)
    : isSameYear(item.dueDate, today);
  if (isCurrentCycle) {
    return { label: "Due", className: "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20" };
  }
  return { label: "Next Cycle", className: "text-muted-foreground bg-background border-border" };
}

interface BillTableProps {
  items: BillStatusItem[];
  title: string;
  sortConfig: SortConfig;
  onSort: (key: string) => void;
  onShowHistory: (bill: Bill) => void;
  onDeleteBill: (id: number) => void;
  onMarkPaid: (bill: Bill, dueDate: Date, paymentId?: number) => void;
  onResetCycle: (paymentId: number) => void;
  onRevertPayment: (paymentId: number) => void;
  resetPending: boolean;
  revertPending: boolean;
}

// Hoisted to module scope (not defined inside Dashboard) so it keeps a
// stable component identity across Dashboard re-renders — otherwise React
// treats it as a brand-new component type on every render (e.g. every
// search keystroke) and remounts the whole table subtree instead of
// diffing it.
function BillTable({
  items,
  title,
  sortConfig,
  onSort,
  onShowHistory,
  onDeleteBill,
  onMarkPaid,
  onResetCycle,
  onRevertPayment,
  resetPending,
  revertPending,
}: BillTableProps) {
  return (
    <div className="bg-card text-card-foreground rounded-2xl border border-border shadow-sm overflow-hidden mb-8 transition-colors">
      <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-muted/30">
        <h2 className="text-lg font-display font-bold">{title}</h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="pl-6"
              aria-sort={sortConfig?.key === 'name' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <button
                type="button"
                onClick={() => onSort('name')}
                className="flex items-center hover:text-foreground transition-colors group w-full"
              >
                Bill Name <SortIcon column="name" sortConfig={sortConfig} />
              </button>
            </TableHead>
            <TableHead
              aria-sort={sortConfig?.key === 'category' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <button
                type="button"
                onClick={() => onSort('category')}
                className="flex items-center hover:text-foreground transition-colors group w-full"
              >
                Category <SortIcon column="category" sortConfig={sortConfig} />
              </button>
            </TableHead>
            <TableHead
              aria-sort={sortConfig?.key === 'date' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <button
                type="button"
                onClick={() => onSort('date')}
                className="flex items-center hover:text-foreground transition-colors group w-full"
              >
                Due Date <SortIcon column="date" sortConfig={sortConfig} />
              </button>
            </TableHead>
            <TableHead
              aria-sort={sortConfig?.key === 'amount' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <button
                type="button"
                onClick={() => onSort('amount')}
                className="flex items-center hover:text-foreground transition-colors group w-full"
              >
                Amount <SortIcon column="amount" sortConfig={sortConfig} />
              </button>
            </TableHead>
            <TableHead
              aria-sort={sortConfig?.key === 'status' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <button
                type="button"
                onClick={() => onSort('status')}
                className="flex items-center hover:text-foreground transition-colors group w-full"
              >
                Status <SortIcon column="status" sortConfig={sortConfig} />
              </button>
            </TableHead>
            <TableHead className="text-right pr-6 min-w-[140px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                No bills found
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.bill.id} className="group hover:bg-muted/20 transition-colors border-border/50">
                <TableCell className="pl-6 font-medium text-foreground">
                  <button
                    onClick={() => onShowHistory(item.bill)}
                    className="flex items-center gap-2 hover:text-primary transition-colors text-left group/name"
                  >
                    <span className="group-hover/name:underline underline-offset-2">{item.bill.name}</span>
                    {item.bill.isAutoPay && (
                      <Badge variant="outline" className="h-5 text-[10px] bg-primary/5 text-primary border-primary/20">
                        Auto
                      </Badge>
                    )}
                  </button>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal text-muted-foreground bg-background border-border">
                    {item.bill.category}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(item.dueDate, item.bill.frequency === "yearly" ? "MMM d, yyyy" : "MMM d")}
                </TableCell>
                <TableCell className="font-display font-bold text-foreground">
                  {formatCurrency(Number(item.amount))}
                </TableCell>
                <TableCell>
                  <Badge
                    className={clsx("font-semibold", getUrgencyDisplay(item).className)}
                    variant="outline"
                  >
                    {getUrgencyDisplay(item).label}
                  </Badge>
                </TableCell>
                <TableCell className="text-right pr-6">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Archive bill" className="h-8 w-8 text-muted-foreground hover:text-destructive no-default-hover-elevate">
                          <Archive className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Archive Bill</AlertDialogTitle>
                          <AlertDialogDescription>
                            Archive "{item.bill.name}"? It'll be hidden from your dashboard and stop generating new payments, but its payment history stays intact and stays visible in History.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => onDeleteBill(item.bill.id)}
                          >
                            Archive
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <EditBillDialog bill={item.bill} />

                    {item.status === "paid" && item.paymentId && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRevertPayment(item.paymentId!)}
                          disabled={revertPending}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground no-default-hover-elevate"
                          title="Revert to Pending"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onResetCycle(item.paymentId!)}
                          disabled={resetPending}
                          className="h-8 border-primary/20 hover:bg-primary/5 text-primary gap-2"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Next Cycle
                        </Button>
                      </div>
                    )}

                    {item.status !== "paid" && (
                      <Button
                        size="sm"
                        onClick={() => onMarkPaid(item.bill, item.dueDate, item.paymentId)}
                        className="bg-primary text-primary-foreground hover-elevate shadow-sm h-8 rounded-lg text-xs font-semibold px-3"
                      >
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Dashboard() {
  const { data: bills, isLoading: billsLoading } = useBills();
  const { data: payments, isLoading: paymentsLoading } = usePayments();
  const { openDialog } = useMarkPaidDialog();
  const deleteBill = useDeleteBill();
  const resetMutation = useResetPayment();
  const revertMutation = useRevertPayment();
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [historyBill, setHistoryBill] = useState<Bill | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [demoOverdue, setDemoOverdue] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending" | "overdue">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const { openDialog: openAddBill } = useCreateBillStore();

  useKeyboardShortcuts({
    onOpenAddBill: openAddBill,
    onFocusSearch: () => searchRef.current?.focus(),
  });

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const processedData = useMemo(() => {
    if (!bills || !payments) return null;

    const today = startOfDay(new Date());

    const allBillStatuses = bills.filter(b => !b.archived).map(bill => ({
      bill,
      ...getBillCycleStatus(bill, payments, today)
    }));

    const sortData = (data: any[]) => {
      if (!sortConfig) return data;
      return [...data].sort((a, b) => {
        let valA, valB;
        switch (sortConfig.key) {
          case 'name':
            valA = a.bill.name.toLowerCase();
            valB = b.bill.name.toLowerCase();
            break;
          case 'category':
            valA = a.bill.category.toLowerCase();
            valB = b.bill.category.toLowerCase();
            break;
          case 'date':
            valA = a.dueDate.getTime();
            valB = b.dueDate.getTime();
            break;
          case 'amount':
            valA = Number(a.amount);
            valB = Number(b.amount);
            break;
          case 'status':
            valA = a.status;
            valB = b.status;
            break;
          default:
            return 0;
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    };

    const monthlyBillStatuses = allBillStatuses.filter(item =>
      item.bill.frequency === "monthly" ||
      (item.bill.frequency === "yearly" && item.bill.dueMonth === (today.getMonth() + 1))
    );

    const annualBillStatuses = allBillStatuses.filter(item =>
      item.bill.frequency === "yearly"
    );

    const totalDue = sumAmounts(monthlyBillStatuses.map(item => item.bill.defaultAmount));
    const totalPaid = sumAmounts(
      monthlyBillStatuses.filter(item => item.status === "paid").map(item => item.amount)
    );
    const totalPending = sumAmounts(
      monthlyBillStatuses.filter(item => item.status !== "paid").map(item => item.bill.defaultAmount)
    );
    const overdueCount = monthlyBillStatuses.filter(item => item.status === "overdue").length;

    // Default sorts then apply user sort
    const statusPriority: Record<BillStatusItem["status"], number> = { overdue: 0, pending: 1, paid: 2 };
    monthlyBillStatuses.sort((a, b) => {
      const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return a.dueDate.getTime() - b.dueDate.getTime();
    });
    annualBillStatuses.sort((a, b) => {
      const aMonth = a.bill.dueMonth || 0;
      const bMonth = b.bill.dueMonth || 0;
      if (aMonth !== bMonth) return aMonth - bMonth;
      return a.bill.dueDay - b.bill.dueDay;
    });

    const overdueBills = allBillStatuses.filter(item => item.status === "overdue");

    return {
      monthlyBillStatuses: sortData(monthlyBillStatuses) as BillStatusItem[],
      annualBillStatuses: sortData(annualBillStatuses) as BillStatusItem[],
      totalDue,
      totalPaid,
      totalPending,
      overdueCount,
      overdueBills,
    };
  }, [bills, payments, sortConfig]);

  // Re-show banner whenever a new bill becomes overdue
  useEffect(() => {
    if ((processedData?.overdueCount ?? 0) > 0) {
      setBannerDismissed(false);
    }
  }, [processedData?.overdueCount]);

  if (billsLoading || paymentsLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </Layout>
    );
  }

  if (!processedData) return null;

  // Derive unique categories from all bills for the filter
  const allCategories = Array.from(new Set((bills ?? []).filter(b => !b.archived).map(b => b.category))).sort();

  const applyFilters = (items: typeof processedData.monthlyBillStatuses) =>
    items.filter(item => {
      const matchesSearch = !searchQuery ||
        item.bill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.bill.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || item.bill.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });

  const filteredMonthly = applyFilters(processedData.monthlyBillStatuses);
  const filteredAnnual = applyFilters(processedData.annualBillStatuses);
  const hasActiveFilters = searchQuery || statusFilter !== "all" || categoryFilter !== "all";

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Overview of your bills for {format(new Date(), 'MMMM yyyy')}</p>
          </div>
          <div className="flex items-center gap-2">
            <ImportBillsDialog />
            <CreateBillDialog />
          </div>
        </div>

        {/* Overdue notification banner — real or demo */}
        {(processedData.overdueCount > 0 || demoOverdue) && !bannerDismissed && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                    {demoOverdue && processedData.overdueCount === 0
                      ? "1 bill is overdue (demo)"
                      : processedData.overdueCount === 1
                      ? "1 bill is overdue"
                      : `${processedData.overdueCount} bills are overdue`}
                  </p>
                  <button
                    onClick={() => { setBannerDismissed(true); setDemoOverdue(false); }}
                    className="text-rose-400 hover:text-rose-600 transition-colors shrink-0 -mt-0.5"
                    aria-label="Dismiss"
                    data-testid="button-dismiss-overdue-banner"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-rose-500/80 mt-0.5 mb-3">
                  These payments are past their due date. Mark them as paid to keep your records up to date.
                </p>
                <div className="flex flex-wrap gap-2">
                  {demoOverdue && processedData.overdueCount === 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                      <CreditCard className="w-3 h-3" />
                      Pay Demo Bill · $99.00
                    </span>
                  )}
                  {processedData.overdueBills.map((item) => (
                    <button
                      key={item.bill.id}
                      onClick={() => openDialog(item.bill, item.dueDate, item.paymentId)}
                      data-testid={`button-pay-overdue-${item.bill.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-colors"
                    >
                      <CreditCard className="w-3 h-3" />
                      Pay {item.bill.name}
                      <span className="opacity-60">· {formatCurrency(Number(item.amount))}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <StatsCards
          totalDue={processedData.totalDue}
          totalPaid={processedData.totalPaid}
          totalPending={processedData.totalPending}
          overdueCount={processedData.overdueCount}
        />

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              placeholder="Search bills…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl bg-card border-border h-10"
              data-testid="input-search-bills"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {(["all", "pending", "paid", "overdue"] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                data-testid={`filter-status-${s}`}
                className={`px-3 h-10 rounded-xl text-sm font-medium border transition-all capitalize ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {s === "all" ? "All" : s === "pending" ? "Unpaid" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {allCategories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              data-testid="select-category-filter"
              className="h-10 px-3 rounded-xl text-sm border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
            >
              <option value="all">All Categories</option>
              {allCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}
        </div>

        {hasActiveFilters && (
          <div className="flex items-center gap-2 -mt-4">
            <span className="text-xs text-muted-foreground">
              {filteredMonthly.length + filteredAnnual.length} result{filteredMonthly.length + filteredAnnual.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => { setSearchQuery(""); setStatusFilter("all"); setCategoryFilter("all"); }}
              className="text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Empty state when no bills exist at all */}
        {bills?.filter(b => !b.archived).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
              <CreditCard className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-2">No bills yet</h2>
            <p className="text-muted-foreground max-w-sm mb-8">
              Add your first recurring bill to start tracking your payments and budget.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <CreateBillDialog />
              <p className="text-xs text-muted-foreground">
                Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-xs font-mono">N</kbd> anytime to add a bill
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <BillTable
              items={filteredMonthly}
              title="Upcoming Monthly Bills"
              sortConfig={sortConfig}
              onSort={handleSort}
              onShowHistory={setHistoryBill}
              onDeleteBill={(id) => deleteBill.mutate(id)}
              onMarkPaid={openDialog}
              onResetCycle={(id) => resetMutation.mutate(id)}
              onRevertPayment={(id) => revertMutation.mutate(id)}
              resetPending={resetMutation.isPending}
              revertPending={revertMutation.isPending}
            />
            <BillTable
              items={filteredAnnual}
              title="Annual Bills Overview"
              sortConfig={sortConfig}
              onSort={handleSort}
              onShowHistory={setHistoryBill}
              onDeleteBill={(id) => deleteBill.mutate(id)}
              onMarkPaid={openDialog}
              onResetCycle={(id) => resetMutation.mutate(id)}
              onRevertPayment={(id) => revertMutation.mutate(id)}
              resetPending={resetMutation.isPending}
              revertPending={revertMutation.isPending}
            />
          </div>
        )}
      </motion.div>
      {/* Floating test panel — dev only, stripped from production builds by Vite's import.meta.env.DEV dead-code elimination */}
      {import.meta.env.DEV && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
          {demoOpen && (
            <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 w-72 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5" /> Feature Demo
              </p>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">Overdue Banner</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs border-rose-300 text-rose-600 hover:bg-rose-50"
                    onClick={() => { setDemoOverdue(true); setBannerDismissed(false); }}
                  >
                    Show Banner
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs"
                    onClick={() => { setDemoOverdue(false); setBannerDismissed(false); }}
                  >
                    Hide
                  </Button>
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-1.5">
                <p className="text-xs font-medium text-foreground">Browser Notifications</p>
                {notifPermission !== "granted" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs gap-1.5"
                    onClick={async () => {
                      const r = await requestNotificationPermission();
                      setNotifPermission(r);
                    }}
                  >
                    <Bell className="w-3 h-3" /> Enable Notifications
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
                    onClick={() => sendTestNotification()}
                  >
                    <Bell className="w-3 h-3" /> Send Test Notification
                  </Button>
                )}
                <p className="text-[10px] text-muted-foreground">
                  {notifPermission === "granted"
                    ? "Notifications enabled. Click above to fire a test."
                    : notifPermission === "denied"
                    ? "Blocked in browser settings — allow and reload."
                    : "Permission not yet requested."}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={() => setDemoOpen((o) => !o)}
            className="w-12 h-12 rounded-2xl bg-foreground text-background shadow-xl flex items-center justify-center hover:opacity-80 transition-all hover:scale-105 active:scale-95"
            title="Test Features"
            data-testid="button-demo-toggle"
          >
            <FlaskConical className="w-5 h-5" />
          </button>
        </div>
      )}

      <MarkPaidDialog />
      <BillHistorySheet
        bill={historyBill}
        payments={payments ?? []}
        open={historyBill !== null}
        onClose={() => setHistoryBill(null)}
      />
    </Layout>
  );
}
