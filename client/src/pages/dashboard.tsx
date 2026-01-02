import { useBills } from "@/hooks/use-bills";
import { usePayments } from "@/hooks/use-payments";
import { Layout } from "@/components/layout";
import { StatsCards } from "@/components/stats-cards";
import { CreateBillDialog } from "@/components/create-bill-dialog";
import { MarkPaidDialog, useMarkPaidDialog } from "@/components/mark-paid-dialog";
import { EditBillDialog } from "@/components/edit-bill-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clsx } from "clsx";
import { type Bill } from "@shared/schema";
import { startOfMonth, endOfMonth, setDate, setMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay, format } from "date-fns";
import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Edit2 } from "lucide-react";
import { useDeleteBill } from "@/hooks/use-bills";
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
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

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
      let dueDate = setDate(currentMonthStart, bill.dueDay);
      if (bill.frequency === "yearly" && bill.dueMonth) {
        dueDate = setMonth(setDate(new Date(today.getFullYear(), 0, 1), bill.dueDay), bill.dueMonth - 1);
      }

      const payment = payments.find(p => 
        p.billId === bill.id && 
        isSameMonth(parseISO(p.dueDate as unknown as string), dueDate) && 
        isSameYear(parseISO(p.dueDate as unknown as string), dueDate)
      );

      let status: "paid" | "pending" | "overdue" = "pending";
      let amount = bill.defaultAmount;

      if (payment) {
        status = "paid";
        amount = payment.amount;
      } else if (isBefore(dueDate, today)) {
        status = "overdue";
      }

      return { status, dueDate, amount };
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

    return {
      monthlyBillStatuses: sortData(monthlyBillStatuses),
      annualBillStatuses: sortData(annualBillStatuses),
      totalDue,
      totalPaid,
      totalPending,
      overdueCount
    };
  }, [bills, payments, sortConfig]);

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
                  {item.bill.name}
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

                    {item.status !== "paid" && (
                      <Button 
                        size="sm"
                        onClick={() => openDialog(item.bill, item.dueDate)}
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
      <MarkPaidDialog />
    </Layout>
  );
}
