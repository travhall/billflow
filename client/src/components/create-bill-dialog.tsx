import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBillSchema, type CreateBillRequest } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useCreateBill } from "@/hooks/use-bills";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { Checkbox } from "@/components/ui/checkbox";

// Enhance schema for form validation
const formSchema = insertBillSchema.extend({
  defaultAmount: z.string().min(1, "Amount is required"),
  dueDay: z.coerce.number().min(1).max(31),
  dueMonth: z.coerce.number().min(1).max(12).optional(),
});

export function CreateBillDialog() {
  const [open, setOpen] = useState(false);
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
    },
  });

  const frequency = form.watch("frequency");

  function onSubmit(values: z.infer<typeof formSchema>) {
    createBill.mutate(values, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 text-white gap-2 pl-4 pr-5 transition-all hover:scale-105 active:scale-95">
          <Plus className="w-5 h-5" />
          Add Bill
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-white p-0 overflow-hidden border-0 shadow-2xl rounded-2xl">
        <div className="bg-slate-50 p-6 border-b border-slate-100">
          <DialogTitle className="text-xl font-display font-bold text-slate-900">Add New Bill</DialogTitle>
          <p className="text-sm text-slate-500 mt-1">Set up a recurring bill to track.</p>
        </div>
        
        <div className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bill Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Netflix, Rent" className="rounded-lg border-slate-200 focus:border-primary focus:ring-primary/20" {...field} />
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
                        <Input placeholder="e.g. Utilities" className="rounded-lg border-slate-200" {...field} />
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
                      <FormLabel>Default Amount ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0.00" className="rounded-lg border-slate-200" {...field} />
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
                          <SelectTrigger className="rounded-lg border-slate-200">
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
                      <FormLabel>Due Day</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={31} className="rounded-lg border-slate-200" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {frequency === "yearly" && (
                <FormField
                  control={form.control}
                  name="dueMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Month</FormLabel>
                      <Select onValueChange={(val) => field.onChange(parseInt(val))} defaultValue={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger className="rounded-lg border-slate-200">
                            <SelectValue placeholder="Select month" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => (
                            <SelectItem key={i + 1} value={(i + 1).toString()}>
                              {new Date(0, i).toLocaleString('default', { month: 'long' })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="isAutoPay"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Auto Pay</FormLabel>
                      <div className="text-xs text-slate-500">
                        Automatically reset cycle when due date passes
                      </div>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isVariable"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Variable Amount</FormLabel>
                      <div className="text-xs text-slate-500">
                        Does the amount change each bill?
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

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
