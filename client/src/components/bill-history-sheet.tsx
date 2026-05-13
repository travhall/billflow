import { type Bill, type Payment } from "@shared/schema";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { clsx } from "clsx";
import { format, parseISO } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { CalendarCheck2, TrendingUp, Receipt, Clock } from "lucide-react";

interface BillHistorySheetProps {
  bill: Bill | null;
  payments: Payment[];
  open: boolean;
  onClose: () => void;
}

export function BillHistorySheet({ bill, payments, open, onClose }: BillHistorySheetProps) {
  if (!bill) return null;

  const billPayments = payments
    .filter((p) => p.billId === bill.id)
    .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  const paidPayments = billPayments.filter((p) => p.status === "paid");
  const totalPaid = paidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const avgAmount = paidPayments.length > 0 ? totalPaid / paidPayments.length : Number(bill.defaultAmount);
  const lastPaid = paidPayments[0];

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[420px] p-0 flex flex-col bg-background border-l border-border"
      >
        {/* Header */}
        <SheetHeader className="px-6 py-5 border-b border-border bg-muted/30 pr-12">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-xl font-display font-bold truncate">{bill.name}</SheetTitle>
              <SheetDescription className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-[10px] font-normal">
                  {bill.category}
                </Badge>
                <Badge variant="outline" className="text-[10px] font-normal capitalize">
                  {bill.frequency}
                </Badge>
                {bill.isAutoPay && (
                  <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                    Auto Pay
                  </Badge>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Stats */}
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          <div className="px-4 py-4 text-center">
            <div className="flex justify-center mb-1">
              <CalendarCheck2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-display font-bold text-foreground">{paidPayments.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Payments</p>
          </div>
          <div className="px-4 py-4 text-center">
            <div className="flex justify-center mb-1">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-display font-bold text-foreground">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Paid</p>
          </div>
          <div className="px-4 py-4 text-center">
            <div className="flex justify-center mb-1">
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-display font-bold text-foreground">{formatCurrency(avgAmount)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Avg Amount</p>
          </div>
        </div>

        {/* Last paid callout */}
        {lastPaid && lastPaid.paidDate && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Last paid on{" "}
              <span className="font-semibold">
                {format(parseISO(lastPaid.paidDate as unknown as string), "MMMM d, yyyy")}
              </span>
            </p>
          </div>
        )}

        {/* Payment history list */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment History</p>
          </div>

          {billPayments.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <Receipt className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No payment records yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border px-6">
              {billPayments.map((payment) => {
                const dueDate = parseISO(payment.dueDate as unknown as string);
                const paidDate = payment.paidDate
                  ? parseISO(payment.paidDate as unknown as string)
                  : null;

                return (
                  <div key={payment.id} className="py-3.5 flex items-center gap-4">
                    {/* Status indicator */}
                    <div className={clsx(
                      "w-2 h-2 rounded-full shrink-0",
                      payment.status === "paid" ? "bg-emerald-500" :
                      payment.status === "overdue" ? "bg-rose-500" : "bg-amber-500"
                    )} />

                    {/* Date info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {format(dueDate, "MMMM d, yyyy")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {payment.status === "paid" && paidDate
                          ? `Paid on ${format(paidDate, "MMM d, yyyy")}`
                          : payment.status === "overdue"
                          ? "Overdue"
                          : "Pending"}
                      </p>
                    </div>

                    {/* Amount + status */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-display font-bold text-foreground">
                        {formatCurrency(Number(payment.amount))}
                      </p>
                      <Badge
                        variant="outline"
                        className={clsx(
                          "mt-1 text-[10px] font-semibold capitalize h-4 px-1.5",
                          payment.status === "paid"    && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                          payment.status === "overdue" && "bg-rose-500/10 text-rose-500 border-rose-500/20",
                          payment.status === "pending" && "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        )}
                      >
                        {payment.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
