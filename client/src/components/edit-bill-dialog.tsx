import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBillSchema, type Bill } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil } from "lucide-react";

interface EditBillDialogProps {
  bill: Bill;
  trigger?: React.ReactNode;
}

export function EditBillDialog({ bill, trigger }: EditBillDialogProps) {
  const [open, setOpen] = useState(false);
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
      archived: bill.archived,
    },
  });

  const onSubmit = async (data: any) => {
    try {
      await apiRequest("PUT", `/api/bills/${bill.id}`, data);
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({
        title: "Success",
        description: "Bill updated successfully",
      });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update bill",
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
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dueDay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Day (1-31)</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" max="31" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {form.watch("frequency") === "yearly" && (
              <FormField
                control={form.control}
                name="dueMonth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Month (1-12)</FormLabel>
                    <FormControl>
                      <Input 
                      type="number" 
                      min="1" 
                      max="12" 
                      {...field} 
                      value={field.value ?? ""} 
                      onChange={e => field.onChange(e.target.value === "" ? null : parseInt(e.target.value))} 
                    />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="isVariable"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Variable Amount</FormLabel>
                  </div>
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full">Update Bill</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
