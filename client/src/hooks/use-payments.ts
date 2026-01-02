import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertPayment } from "@shared/routes";
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

export function useCreatePayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertPayment) => {
      // Ensure numeric fields are numbers if schema requires, or strings if using drizzle decimal
      const payload = {
        ...data,
        // Drizzle numeric types expect strings usually, but zod schema might coerce
        // Schema says numeric, but check if we need to coerce on client side
      };

      const res = await fetch(api.payments.create.path, {
        method: api.payments.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to record payment");
      }

      return api.payments.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.payments.list.path] });
      // Also invalidate bills since they might show updated status
      queryClient.invalidateQueries({ queryKey: [api.bills.list.path] });
      
      toast({
        title: "Payment Recorded",
        description: "The bill has been marked as paid.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
