import { create } from "zustand";
import { type Bill } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useCreatePayment } from "@/hooks/use-payments";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface MarkPaidState {
  isOpen: boolean;
  bill: Bill | null;
  dueDate: Date | null;
  paymentId: number | undefined;
  openDialog: (bill: Bill, dueDate: Date, paymentId?: number) => void;
  closeDialog: () => void;
}

export const useMarkPaidDialog = create<MarkPaidState>((set) => ({
  isOpen: false,
  bill: null,
  dueDate: null,
  paymentId: undefined,
  openDialog: (bill, dueDate, paymentId) => set({ isOpen: true, bill, dueDate, paymentId }),
  closeDialog: () => set({ isOpen: false, bill: null, dueDate: null, paymentId: undefined }),
}));

export function MarkPaidDialog() {
  const { isOpen, bill, dueDate, paymentId, closeDialog } = useMarkPaidDialog();
  const createPayment = useCreatePayment();
  const { toast } = useToast();

  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (isOpen && bill) {
      setAmount(bill.defaultAmount);
      setPaidDate(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen, bill]);

  if (!bill || !dueDate) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !paidDate) return;

    if (paymentId) {
      // Update the existing pending payment record
      setIsPending(true);
      try {
        await apiRequest("PUT", `/api/payments/${paymentId}`, {
          amount,
          paidDate: new Date(paidDate),
          status: "paid",
          notes: "",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
        toast({ title: "Payment Recorded", description: "The bill has been marked as paid." });
        closeDialog();
      } catch {
        toast({ title: "Error", description: "Failed to record payment", variant: "destructive" });
      } finally {
        setIsPending(false);
      }
    } else {
      // No existing payment record — create a new one
      createPayment.mutate({
        billId: bill.id,
        amount,
        dueDate,
        paidDate: new Date(paidDate),
        status: "paid",
        notes: "",
      }, {
        onSuccess: () => closeDialog(),
      });
    }
  };

  const loading = isPending || createPayment.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={closeDialog}>
      <DialogContent className="sm:max-w-[425px] bg-white rounded-2xl shadow-2xl border-0">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Mark as Paid</DialogTitle>
          <DialogDescription>
            Confirm payment details for <strong>{bill.name}</strong> due on {format(dueDate, "MMMM do")}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount Paid</Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">$</span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                className="pl-7 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/10"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date Paid</Label>
            <Input
              id="date"
              type="date"
              className="rounded-xl border-slate-200 focus:border-primary focus:ring-primary/10"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeDialog} className="rounded-xl">Cancel</Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-600/20"
              disabled={loading}
            >
              {loading ? "Saving..." : "Confirm Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
