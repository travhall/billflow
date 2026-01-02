import { type Bill, type Payment } from "@shared/schema";
import { format, isPast, parseISO } from "date-fns";
import { Calendar, Check, AlertCircle, Clock, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clsx } from "clsx";
import { useMarkPaidDialog } from "./mark-paid-dialog";

interface BillCardProps {
  bill: Bill;
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount?: string; // If paid, showing paid amount, else default
}

export function BillCard({ bill, status, dueDate, amount }: BillCardProps) {
  const { openDialog } = useMarkPaidDialog();
  
  const isPaid = status === "paid";
  const isOverdue = status === "overdue";
  
  const displayAmount = amount || bill.defaultAmount;

  return (
    <div className={clsx(
      "group relative bg-white rounded-2xl p-5 border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
      isOverdue ? "border-red-100 shadow-red-50" : "border-slate-100 shadow-slate-200/50"
    )}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={clsx(
            "w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0",
            bill.category === "Utilities" && "bg-blue-50 text-blue-600",
            bill.category === "Rent" && "bg-indigo-50 text-indigo-600",
            bill.category === "Subscription" && "bg-purple-50 text-purple-600",
            bill.category === "Insurance" && "bg-emerald-50 text-emerald-600",
            bill.category === "Debt" && "bg-amber-50 text-amber-600",
            !["Utilities", "Rent", "Subscription", "Insurance", "Debt"].includes(bill.category) && "bg-slate-100 text-slate-600"
          )}>
            {bill.name.charAt(0)}
          </div>
          <div>
            <h3 className="font-bold text-slate-900 group-hover:text-primary transition-colors">{bill.name}</h3>
            <p className="text-xs text-slate-500 font-medium">{bill.category}</p>
          </div>
        </div>
        
        <div className="text-right">
          <div className="text-lg font-display font-bold text-slate-900">
            ${Number(displayAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          {bill.isVariable && !isPaid && (
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              Variable
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-50">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className={clsx(isOverdue && !isPaid && "text-red-600 font-medium")}>
            Due {format(dueDate, "MMM d")}
          </span>
        </div>

        {isPaid ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
            <Check className="w-3.5 h-3.5" />
            PAID
          </div>
        ) : (
          <Button 
            size="sm" 
            variant={isOverdue ? "destructive" : "default"}
            className={clsx(
              "h-8 px-4 rounded-full text-xs font-semibold shadow-md transition-all",
              isOverdue 
                ? "bg-red-500 hover:bg-red-600 shadow-red-200" 
                : "bg-slate-900 hover:bg-primary shadow-slate-200"
            )}
            onClick={() => openDialog(bill, dueDate)}
          >
            Mark Paid
          </Button>
        )}
      </div>

      {/* Status Stripe */}
      <div className={clsx(
        "absolute left-0 top-6 bottom-6 w-1 rounded-r-full transition-colors",
        isPaid ? "bg-emerald-500" : isOverdue ? "bg-red-500" : "bg-amber-400"
      )} />
    </div>
  );
}
