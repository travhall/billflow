import { create } from "zustand";
import { type Bill, type Payment } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [resetCycle, setResetCycle] = useState(true);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (isOpen && bill) {
      setAmount(bill.defaultAmount);
      setPaidDate(new Date().toISOString().split('T')[0]);
      setResetCycle(true);
    }
  }, [isOpen, bill]);

  if (!bill || !dueDate) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !paidDate) return;

    setIsPending(true);

    // Snapshot for rollback on error
    const previousPayments = queryClient.getQueryData<Payment[]>(["/api/payments"]);

    // Optimistic update — mark the payment as paid immediately in the cache
    if (paymentId && previousPayments) {
      queryClient.setQueryData<Payment[]>(["/api/payments"], (old) =>
        old?.map((p) =>
          p.id === paymentId
            ? { ...p, status: "paid" as const, paidDate: new Date(paidDate).toISOString() }
            : p
        ) ?? []
      );
    }

    try {
      let savedPaymentId: number;

      if (paymentId) {
        // Update the existing pending payment record
        await apiRequest("PUT", `/api/payments/${paymentId}`, {
          amount,
          paidDate: new Date(paidDate),
          status: "paid",
          notes: "",
        });
        savedPaymentId = paymentId;
      } else {
        // No existing payment record — create a new one
        const res = await apiRequest("POST", "/api/payments", {
          billId: bill.id,
          amount,
          dueDate,
          paidDate: new Date(paidDate),
          status: "paid",
          notes: "",
        });
        const created = await res.json();
        savedPaymentId = created.id;
      }

      // Optionally reset for next cycle
      if (resetCycle) {
        await apiRequest("POST", `/api/payments/${savedPaymentId}/reset`);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({
        title: "Payment Recorded",
        description: resetCycle
          ? "Bill marked as paid and reset for next cycle."
          : "The bill has been marked as paid.",
      });
      closeDialog();
    } catch {
      // Rollback optimistic update on failure
      if (previousPayments) {
        queryClient.setQueryData(["/api/payments"], previousPayments);
      }
      toast({ title: "Error", description: "Failed to record payment", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={closeDialog}>
      <DialogContent className="sm:max-w-[425px] bg-card rounded-2xl shadow-2xl border border-border">
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
              <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                className="pl-7 rounded-xl"
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
              className="rounded-xl"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
            <Checkbox
              id="reset-cycle"
              checked={resetCycle}
              onCheckedChange={(v) => setResetCycle(!!v)}
            />
            <div>
              <label htmlFor="reset-cycle" className="text-sm font-medium text-foreground cursor-pointer">
                Reset for next cycle
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically queue the next {bill.frequency === "yearly" ? "annual" : "monthly"} payment
              </p>
            </div>
          </div>

          <div className="pt-1 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeDialog} className="rounded-xl">Cancel</Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-600/20"
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Confirm Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
