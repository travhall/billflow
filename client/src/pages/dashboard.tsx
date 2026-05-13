import { useBills } from "@/hooks/use-bills";
import { usePayments } from "@/hooks/use-payments";
import { Layout } from "@/components/layout";
import { StatsCards } from "@/components/stats-cards";
import { CreateBillDialog } from "@/components/create-bill-dialog";
import { MarkPaidDialog, useMarkPaidDialog } from "@/components/mark-paid-dialog";
import { EditBillDialog } from "@/components/edit-bill-dialog";
import { BillHistorySheet } from "@/components/bill-history-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clsx } from "clsx";
import { type Bill } from "@shared/schema";
import { startOfMonth, endOfMonth, setDate, setMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay, format } from "date-fns";
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
import { Trash2, Edit2, RotateCcw, Undo2, AlertTriangle, X, CreditCard, FlaskConical, Bell, ChevronDown } from "lucide-react";
import { sendTestNotification, getNotificationPermission, requestNotificationPermission } from "@/lib/notifications";
import { useDeleteBill } from "@/hooks/use-bills";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/utils";

import { useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
} | null;

export default function Dashboard() {
  const { data: bills, isLoading: billsLoading } = useBills();
  const { data: payments, isLoading: paymentsLoading } = usePayments();
  const { openDialog } = useMarkPaidDialog();
  const deleteBill = useDeleteBill();
  const { toast } = useToast();
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [historyBill, setHistoryBill] = useState<Bill | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [demoOverdue, setDemoOverdue] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());

  const resetMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      await apiRequest("POST", `/api/payments/${paymentId}/reset`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({
        title: "Success",
        description: "Billing cycle reset for the next period.",
      });
    },
  });

  const revertMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      await apiRequest("POST", `/api/payments/${paymentId}/revert`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({
        title: "Reverted",
        description: "Payment has been marked as pending again.",
      });
    },
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
    const currentMonthStart = startOfMonth(today);

    const getStatus = (bill: Bill) => {
      // Find the most recent payment for this bill
      const billPayments = payments
        .filter(p => p.billId === bill.id)
        .sort((a, b) => {
          const dateDiff = new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
          if (dateDiff !== 0) return dateDiff;
          // Tiebreak: paid before pending, then newest id first
          if (a.status === "paid" && b.status !== "paid") return -1;
          if (b.status === "paid" && a.status !== "paid") return 1;
          return b.id - a.id;
        });

      const latestPayment = billPayments[0];
      
      // If latest payment exists and is paid, we show it as paid regardless of due date
      if (latestPayment && latestPayment.status === "paid") {
        return { 
          status: "paid" as const, 
          dueDate: parseISO(latestPayment.dueDate as unknown as string), 
          amount: latestPayment.amount, 
          paymentId: latestPayment.id 
        };
      }

      // Calculate current period's expected due date
      let currentPeriodDueDate = setDate(currentMonthStart, bill.dueDay);
      if (bill.frequency === "yearly" && bill.dueMonth) {
        currentPeriodDueDate = setMonth(setDate(new Date(today.getFullYear(), 0, 1), bill.dueDay), bill.dueMonth - 1);
      }

      // If no payment exists at all, use current period's due date
      if (!latestPayment) {
        const status = isBefore(currentPeriodDueDate, today) ? "overdue" : "pending";
        return { status, dueDate: currentPeriodDueDate, amount: bill.defaultAmount, paymentId: undefined };
      }

      // If it's pending/overdue
      const latestDueDate = parseISO(latestPayment.dueDate as unknown as string);
      const status = isBefore(latestDueDate, today) ? "overdue" : "pending";
      return { 
        status, 
        dueDate: latestDueDate, 
        amount: latestPayment.amount, 
        paymentId: latestPayment.id 
      };
    };

    const allBillStatuses = bills.filter(b => !b.archived).map(bill => ({
      bill,
      ...getStatus(bill)
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

    const totalDue = monthlyBillStatuses.reduce((acc, item) => acc + Number(item.bill.defaultAmount), 0);
    const totalPaid = monthlyBillStatuses
      .filter(item => item.status === "paid")
      .reduce((acc, item) => acc + Number(item.amount), 0);
    const totalPending = monthlyBillStatuses
      .filter(item => item.status !== "paid")
      .reduce((acc, item) => acc + Number(item.bill.defaultAmount), 0);
    const overdueCount = monthlyBillStatuses.filter(item => item.status === "overdue").length;

    // Default sorts then apply user sort
    monthlyBillStatuses.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    annualBillStatuses.sort((a, b) => {
      const aMonth = a.bill.dueMonth || 0;
      const bMonth = b.bill.dueMonth || 0;
      if (aMonth !== bMonth) return aMonth - bMonth;
      return a.bill.dueDay - b.bill.dueDay;
    });

    const overdueBills = allBillStatuses.filter(item => item.status === "overdue");

    return {
      monthlyBillStatuses: sortData(monthlyBillStatuses),
      annualBillStatuses: sortData(annualBillStatuses),
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

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const BillTable = ({ items, title }: { items: any[], title: string }) => (
    <div className="bg-card text-card-foreground rounded-2xl border border-border shadow-sm overflow-hidden mb-8 transition-colors">
      <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-muted/30">
        <h2 className="text-lg font-display font-bold">{title}</h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6 cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => handleSort('name')}>
              <div className="flex items-center">
                Bill Name <SortIcon column="name" />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => handleSort('category')}>
              <div className="flex items-center">
                Category <SortIcon column="category" />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => handleSort('date')}>
              <div className="flex items-center">
                Due Date <SortIcon column="date" />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => handleSort('amount')}>
              <div className="flex items-center">
                Amount <SortIcon column="amount" />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => handleSort('status')}>
              <div className="flex items-center">
                Status <SortIcon column="status" />
              </div>
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
                    onClick={() => setHistoryBill(item.bill)}
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
                    className={clsx(
                      "capitalize font-semibold",
                      item.status === "paid" ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" :
                      item.status === "overdue" ? "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/20" :
                      "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20"
                    )}
                    variant="outline"
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right pr-6">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive no-default-hover-elevate">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Bill</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{item.bill.name}"? This will also remove its payment history.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-background border-border">Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteBill.mutate(item.bill.id)}
                          >
                            Delete
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
                          onClick={() => revertMutation.mutate(item.paymentId!)}
                          disabled={revertMutation.isPending}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground no-default-hover-elevate"
                          title="Revert to Pending"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resetMutation.mutate(item.paymentId!)}
                          disabled={resetMutation.isPending}
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
                        onClick={() => openDialog(item.bill, item.dueDate, item.paymentId)}
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
          <CreateBillDialog />
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
                      onClick={() => openDialog(item.bill, item.paymentId)}
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

        <div className="space-y-8">
          <BillTable items={processedData.monthlyBillStatuses} title="Upcoming Monthly Bills" />
          <BillTable items={processedData.annualBillStatuses} title="Annual Bills Overview" />
        </div>
      </motion.div>
      {/* Floating test panel */}
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
          className="w-12 h-12 rounded-2xl bg-slate-800 dark:bg-slate-700 text-white shadow-xl flex items-center justify-center hover:bg-slate-700 transition-all hover:scale-105 active:scale-95"
          title="Test Features"
          data-testid="button-demo-toggle"
        >
          <FlaskConical className="w-5 h-5" />
        </button>
      </div>

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
