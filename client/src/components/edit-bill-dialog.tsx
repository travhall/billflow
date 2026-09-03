import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBillSchema, type Bill } from "@shared/schema";
import { useUpdateBill } from "@/hooks/use-bills";
import { updatePaymentRequest } from "@/hooks/use-payments";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { getNotificationPermission } from "@/lib/notifications";
import { BillFormFields } from "@/components/bill-form-fields";

interface EditBillDialogProps {
  bill: Bill;
  trigger?: React.ReactNode;
  currentPaidPayment?: { id: number; amount: string; dueDate: Date } | null;
}

export function EditBillDialog({ bill, trigger, currentPaidPayment }: EditBillDialogProps) {
  const [open, setOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
  const [correctPaidPayment, setCorrectPaidPayment] = useState(false);
  const updateBill = useUpdateBill();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertBillSchema),
    defaultValues: {
      name: bill.name,
      category: bill.category,
      defaultAmount: bill.defaultAmount,
      isVariable: bill.isVariable,
      frequency: bill.frequency,
      dueDay: bill.dueDay,
      dueMonth: bill.dueMonth,
      isAutoPay: bill.isAutoPay,
      archived: bill.archived,
      reminderDays: bill.reminderDays ?? null,
    },
  });

  const onSubmit = async (data: any) => {
    try {
      await updateBill.mutateAsync({ id: bill.id, data });

      if (correctPaidPayment && currentPaidPayment) {
        await updatePaymentRequest(currentPaidPayment.id, { amount: data.defaultAmount });
        queryClient.invalidateQueries({ queryKey: [api.payments.list.path] });
      }

      setCorrectPaidPayment(false);
      setOpen(false);
    } catch {
      toast({
        title: "Couldn't finish saving",
        description: "The bill was updated, but correcting the paid amount failed. Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Bill</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <BillFormFields
              form={form}
              notifPermission={notifPermission}
              onNotifPermissionChange={setNotifPermission}
              currentPaidPayment={currentPaidPayment}
              correctPaidPayment={correctPaidPayment}
              onCorrectPaidPaymentChange={setCorrectPaidPayment}
            />

            <Button type="submit" className="w-full" disabled={updateBill.isPending}>
              {updateBill.isPending ? "Updating..." : "Update Bill"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
