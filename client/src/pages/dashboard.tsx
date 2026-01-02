import { useBills } from "@/hooks/use-bills";
import { usePayments } from "@/hooks/use-payments";
import { Layout } from "@/components/layout";
import { BillCard } from "@/components/bill-card";
import { StatsCards } from "@/components/stats-cards";
import { CreateBillDialog } from "@/components/create-bill-dialog";
import { MarkPaidDialog } from "@/components/mark-paid-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { type Bill, type Payment } from "@shared/schema";
import { startOfMonth, endOfMonth, setDate, setMonth, isSameMonth, isSameYear, parseISO, isBefore, startOfDay } from "date-fns";
import { useMemo } from "react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: bills, isLoading: billsLoading } = useBills();
  const { data: payments, isLoading: paymentsLoading } = usePayments();

  // Process data for dashboard
  const processedData = useMemo(() => {
    if (!bills || !payments) return null;

    const today = startOfDay(new Date());
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);

    // 1. Identify bills due this month
    const monthlyBills = bills.filter(bill => {
      if (bill.archived) return false;
      if (bill.frequency === "monthly") return true;
      if (bill.frequency === "yearly" && bill.dueMonth) {
        // Only show yearly bills if they fall in current month
        return bill.dueMonth === (today.getMonth() + 1);
      }
      return false;
    });

    // 2. Map bills to their status for the current period
    const billStatuses = monthlyBills.map(bill => {
      // Calculate due date for this specific bill in the current month
      let dueDate = setDate(currentMonthStart, bill.dueDay);
      if (bill.frequency === "yearly") {
        dueDate = setMonth(setDate(new Date(today.getFullYear(), 0, 1), bill.dueDay), (bill.dueMonth || 1) - 1);
      }

      // Find payment for this bill within reasonable range of this month
      // Simple logic: Is there a payment for this billId with a dueDate in this month?
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

      return {
        bill,
        status,
        dueDate,
        amount
      };
    });

    // 3. Calculate Aggregates
    const totalDue = billStatuses.reduce((acc, item) => acc + Number(item.bill.defaultAmount), 0);
    const totalPaid = billStatuses
      .filter(item => item.status === "paid")
      .reduce((acc, item) => acc + Number(item.amount), 0);
    
    // Total pending is what is LEFT to pay (from default amounts)
    const totalPending = billStatuses
      .filter(item => item.status !== "paid")
      .reduce((acc, item) => acc + Number(item.bill.defaultAmount), 0);

    const overdueCount = billStatuses.filter(item => item.status === "overdue").length;

    // Sort by due date
    billStatuses.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    return {
      billStatuses,
      totalDue,
      totalPaid,
      totalPending,
      overdueCount
    };

  }, [bills, payments]);

  if (billsLoading || paymentsLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!processedData) return null;

  return (
    <Layout>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500">Overview of your bills for {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
          </div>
          <CreateBillDialog />
        </div>

        <StatsCards 
          totalDue={processedData.totalDue}
          totalPaid={processedData.totalPaid}
          totalPending={processedData.totalPending}
          overdueCount={processedData.overdueCount}
        />

        <div>
          <h2 className="text-xl font-display font-bold text-slate-900 mb-4">Upcoming Bills</h2>
          
          {processedData.billStatuses.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🎉</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900">No bills due this month</h3>
              <p className="text-slate-500 max-w-sm mx-auto mt-1">You're all clear! Add a new bill to start tracking your expenses.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {processedData.billStatuses.map((item) => (
                <BillCard 
                  key={item.bill.id} 
                  bill={item.bill} 
                  status={item.status} 
                  dueDate={item.dueDate}
                  amount={item.amount}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
      <MarkPaidDialog />
    </Layout>
  );
}
