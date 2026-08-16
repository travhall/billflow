import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBillSchema, type CreateBillRequest } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useCreateBill } from "@/hooks/use-bills";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { getNotificationPermission } from "@/lib/notifications";
import { create } from "zustand";
import { BillFormFields } from "@/components/bill-form-fields";

interface CreateBillStore {
  isOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

export const useCreateBillStore = create<CreateBillStore>((set) => ({
  isOpen: false,
  openDialog: () => set({ isOpen: true }),
  closeDialog: () => set({ isOpen: false }),
}));

// Enhance schema for form validation
const formSchema = insertBillSchema.extend({
  defaultAmount: z.string().min(1, "Amount is required"),
  dueDay: z.coerce.number().min(1).max(31),
  dueMonth: z.coerce.number().min(1).max(12).optional(),
  reminderDays: z.number().nullable().optional(),
});

export function CreateBillDialog() {
  const { isOpen, openDialog, closeDialog } = useCreateBillStore();
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
  const createBill = useCreateBill();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      category: "",
      defaultAmount: "",
      isVariable: false,
      frequency: "monthly",
      dueDay: 1,
      isAutoPay: false,
      archived: false,
      reminderDays: null,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createBill.mutate(values, {
      onSuccess: () => {
        closeDialog();
        form.reset();
      },
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => o ? openDialog() : closeDialog()}>
      <DialogTrigger asChild>
        <Button className="rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 text-white gap-2 pl-4 pr-5 transition-all hover:scale-105 active:scale-95">
          <Plus className="w-5 h-5" />
          Add Bill
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card p-0 overflow-hidden border border-border shadow-2xl rounded-2xl">
        <div className="bg-muted/40 p-6 border-b border-border">
          <DialogTitle className="text-xl font-display font-bold text-foreground">Add New Bill</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">Set up a recurring bill to track.</p>
        </div>

        <div className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <BillFormFields form={form} notifPermission={notifPermission} onNotifPermissionChange={setNotifPermission} />

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full rounded-xl py-6 font-semibold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                  disabled={createBill.isPending}
                >
                  {createBill.isPending ? "Creating..." : "Create Bill"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
