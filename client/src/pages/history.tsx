import { usePayments } from "@/hooks/use-payments";
import { useBills } from "@/hooks/use-bills";
import { Layout } from "@/components/layout";
import { format, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { motion } from "framer-motion";

export default function History() {
  const { data: payments, isLoading: paymentsLoading } = usePayments();
  const { data: bills, isLoading: billsLoading } = useBills();

  if (paymentsLoading || billsLoading) {
    return (
      <Layout>
        <Skeleton className="h-12 w-48 mb-8" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </Layout>
    );
  }

  // Create a map of bill IDs to names for easy lookup
  const billMap = new Map(bills?.map(b => [b.id, b]));

  // Sort payments by paid date descending
  const sortedPayments = [...(payments || [])].sort((a, b) => {
    const dateA = a.paidDate ? new Date(a.paidDate).getTime() : 0;
    const dateB = b.paidDate ? new Date(b.paidDate).getTime() : 0;
    return dateB - dateA;
  });

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Payment History</h1>
          <p className="text-slate-500">A record of all your past payments.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-semibold text-slate-900">Bill Name</TableHead>
                <TableHead className="font-semibold text-slate-900">Category</TableHead>
                <TableHead className="font-semibold text-slate-900">Due Date</TableHead>
                <TableHead className="font-semibold text-slate-900">Paid Date</TableHead>
                <TableHead className="font-semibold text-slate-900 text-right">Amount</TableHead>
                <TableHead className="font-semibold text-slate-900">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                    No payment history found.
                  </TableCell>
                </TableRow>
              ) : (
                sortedPayments.map((payment) => {
                  const bill = billMap.get(payment.billId);
                  return (
                    <TableRow key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-medium text-slate-900">
                        {bill?.name || "Unknown Bill"}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                          {bill?.category || "Uncategorized"}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {format(parseISO(payment.dueDate as unknown as string), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {payment.paidDate 
                          ? format(parseISO(payment.paidDate as unknown as string), "MMM d, yyyy") 
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${Number(payment.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          PAID
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </motion.div>
    </Layout>
  );
}
