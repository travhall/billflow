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
import { Badge } from "@/components/ui/badge";
import { clsx } from "clsx";
import { formatCurrency } from "@/lib/utils";

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

  const billMap = new Map(bills?.map(b => [b.id, b]));

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
          <h1 className="text-3xl font-display font-bold text-foreground">Payment History</h1>
          <p className="text-muted-foreground">A record of all your past payments.</p>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="font-semibold text-foreground">Bill Name</TableHead>
                <TableHead className="font-semibold text-foreground">Category</TableHead>
                <TableHead className="font-semibold text-foreground">Due Date</TableHead>
                <TableHead className="font-semibold text-foreground">Paid Date</TableHead>
                <TableHead className="font-semibold text-foreground text-right">Amount</TableHead>
                <TableHead className="font-semibold text-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No payment history found.
                  </TableCell>
                </TableRow>
              ) : (
                sortedPayments.map((payment) => {
                  const bill = billMap.get(payment.billId);
                  return (
                    <TableRow key={payment.id} className="hover:bg-muted/30 transition-colors border-border/50">
                      <TableCell className="font-medium text-foreground">
                        {bill?.name || "Unknown Bill"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal text-muted-foreground">
                          {bill?.category || "Uncategorized"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(parseISO(payment.dueDate as unknown as string), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {payment.paidDate 
                          ? format(parseISO(payment.paidDate as unknown as string), "MMM d, yyyy") 
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-display font-bold text-foreground">
                        {formatCurrency(Number(payment.amount))}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={clsx(
                            "text-xs font-semibold capitalize",
                            payment.status === "paid"    && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                            payment.status === "overdue" && "bg-rose-500/10 text-rose-500 border-rose-500/20",
                            payment.status === "pending" && "bg-amber-500/10 text-amber-600 border-amber-500/20"
                          )}
                        >
                          {payment.status}
                        </Badge>
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
