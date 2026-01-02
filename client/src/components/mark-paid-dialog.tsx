import { create } from "zustand";
import { type Bill } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useCreatePayment } from "@/hooks/use-payments";
import { format } from "date-fns";

// Simple state management for the dialog
interface MarkPaidState {
  isOpen: boolean;
  bill: Bill | null;
  dueDate: Date | null;
  openDialog: (bill: Bill, dueDate: Date) => void;
  closeDialog: () => void;
}

export const useMarkPaidDialog = create<MarkPaidState>((set) => ({
  isOpen: false,
  bill: null,
  dueDate: null,
  openDialog: (bill, dueDate) => set({ isOpen: true, bill, dueDate }),
  closeDialog: () => set({ isOpen: false, bill: null, dueDate: null }),
}));

export function MarkPaidDialog() {
  const { isOpen, bill, dueDate, closeDialog } = useMarkPaidDialog();
  const createPayment = useCreatePayment();
  
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState("");

  useEffect(() => {
    if (isOpen && bill) {
      setAmount(bill.defaultAmount);
      setPaidDate(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen, bill]);

  if (!bill || !dueDate) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !paidDate) return;

    createPayment.mutate({
      billId: bill.id,
      amount: amount,
      dueDate: dueDate, // The original due date of the bill instance
      paidDate: new Date(paidDate),
      status: "paid",
      notes: "",
    }, {
      onSuccess: () => closeDialog(),
    });
  };

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
                readOnly={!bill.isVariable} // Only editable if variable? Actually users might want to edit always for partials, but let's stick to prompt logic mostly
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
              disabled={createPayment.isPending}
            >
              {createPayment.isPending ? "Saving..." : "Confirm Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
