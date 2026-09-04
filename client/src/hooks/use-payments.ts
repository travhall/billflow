import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertPayment, type Payment } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function usePayments() {
  return useQuery({
    queryKey: [api.payments.list.path],
    queryFn: async () => {
      const res = await fetch(api.payments.list.path);
      if (!res.ok) throw new Error("Failed to fetch payments");
      return api.payments.list.responses[200].parse(await res.json());
    },
  });
}

// Raw request functions below (createPaymentRequest, updatePaymentRequest,
// markPaidAndResetRequest, resetPaymentRequest) are the single source of
// truth for hitting these endpoints. They have no standalone hook wrapper
// because their only caller (mark-paid-dialog) chains 1-2 of them together
// into one user action and fires its own single combined toast at the end —
// a wrapper hook's own per-request toast would show alongside it.
export async function createPaymentRequest(data: InsertPayment): Promise<Payment> {
  const res = await fetch(api.payments.create.path, {
    method: api.payments.create.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to record payment");
  }
  return api.payments.create.responses[201].parse(await res.json());
}

export async function updatePaymentRequest(id: number, data: Partial<InsertPayment>): Promise<Payment> {
  const res = await fetch(buildUrl(api.payments.update.path, { id }), {
    method: api.payments.update.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to update payment");
  }
  return api.payments.update.responses[200].parse(await res.json());
}

export async function markPaidAndResetRequest(
  id: number,
  data: { amount: string; paidDate: Date }
): Promise<{ paid: Payment; next: Payment }> {
  const res = await fetch(buildUrl("/api/payments/:id/mark-paid-and-reset", { id }), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to record payment");
  }
  return await res.json();
}

export async function resetPaymentRequest(paymentId: number): Promise<Payment> {
  const res = await fetch(buildUrl("/api/payments/:id/reset", { id: paymentId }), {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to reset billing cycle");
  return (await res.json()) as Payment;
}

export function useRevertPayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (paymentId: number) => {
      const res = await fetch(buildUrl("/api/payments/:id/revert", { id: paymentId }), {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to revert payment");
      return (await res.json()) as Payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.payments.list.path] });
      toast({
        title: "Reverted",
        description: "Payment has been marked as pending again.",
      });
    },
  });
}
