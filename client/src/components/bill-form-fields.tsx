import type { UseFormReturn } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { requestNotificationPermission, type NotificationPermission } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";

interface BillFormFieldsProps {
  form: UseFormReturn<any>;
  notifPermission: NotificationPermission;
  onNotifPermissionChange: (p: NotificationPermission) => void;
}

export function BillFormFields({ form, notifPermission, onNotifPermissionChange }: BillFormFieldsProps) {
  const frequency = form.watch("frequency");
  const { toast } = useToast();

  async function enableReminders() {
    const result = await requestNotificationPermission();
    onNotifPermissionChange(result);
    if (result === "granted" && !form.getValues("reminderDays")) {
      form.setValue("reminderDays", 3);
    }
    if (result === "denied") {
      toast({ title: "Notifications blocked", description: "Enable notifications in your browser settings.", variant: "destructive" });
    }
  }

  return (
    <>
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem>
          <FormLabel>Bill Name</FormLabel>
          <FormControl><Input placeholder="e.g. Netflix, Rent" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <div className="grid grid-cols-2 gap-4">
        <FormField control={form.control} name="category" render={({ field }) => (
          <FormItem>
            <FormLabel>Category</FormLabel>
            <FormControl><Input placeholder="e.g. Utilities" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="defaultAmount" render={({ field }) => (
          <FormItem>
            <FormLabel>Default Amount ($)</FormLabel>
            <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField control={form.control} name="frequency" render={({ field }) => (
          <FormItem>
            <FormLabel>Frequency</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl><SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="dueDay" render={({ field }) => (
          <FormItem>
            <FormLabel>Due Day</FormLabel>
            <FormControl><Input type="number" min={1} max={31} {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>

      {frequency === "yearly" && (
        <FormField control={form.control} name="dueMonth" render={({ field }) => (
          <FormItem>
            <FormLabel>Due Month</FormLabel>
            <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString() ?? ""}>
              <FormControl><SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger></FormControl>
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
        )} />
      )}

      <FormField control={form.control} name="isAutoPay" render={({ field }) => (
        <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border p-4 bg-muted/30">
          <div className="space-y-0.5">
            <FormLabel className="text-base">Auto Pay</FormLabel>
            <div className="text-xs text-muted-foreground">Automatically reset cycle when due date passes</div>
          </div>
          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
        </FormItem>
      )} />

      <FormField control={form.control} name="isVariable" render={({ field }) => (
        <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border p-4 bg-muted/30">
          <div className="space-y-0.5">
            <FormLabel className="text-base">Variable Amount</FormLabel>
            <div className="text-xs text-muted-foreground">Does the amount change each bill?</div>
          </div>
          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
        </FormItem>
      )} />

      <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Payment Reminder</span>
          </div>
          {notifPermission !== "granted" && (
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={enableReminders}>
              <Bell className="w-3 h-3" /> Enable
            </Button>
          )}
        </div>
        {notifPermission === "granted" ? (
          <FormField control={form.control} name="reminderDays" render={({ field }) => (
            <FormItem>
              <Select
                onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))}
                value={field.value === null || field.value === undefined ? "none" : String(field.value)}
              >
                <FormControl><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="No reminder" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="none">No reminder</SelectItem>
                  <SelectItem value="0">On the due date</SelectItem>
                  <SelectItem value="1">1 day before</SelectItem>
                  <SelectItem value="3">3 days before</SelectItem>
                  <SelectItem value="5">5 days before</SelectItem>
                  <SelectItem value="7">1 week before</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {notifPermission === "denied"
              ? "Notifications are blocked. Allow them in your browser settings."
              : "Get notified before bills are due. Click Enable to allow notifications."}
          </p>
        )}
      </div>
    </>
  );
}
