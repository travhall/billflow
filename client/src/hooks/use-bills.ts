import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertBill, type CreateBillRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useBills() {
  return useQuery({
    queryKey: [api.bills.list.path],
    queryFn: async () => {
      const res = await fetch(api.bills.list.path);
      if (!res.ok) throw new Error("Failed to fetch bills");
      return api.bills.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateBill() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateBillRequest) => {
      const res = await fetch(api.bills.create.path, {
        method: api.bills.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create bill");
      }
      
      return api.bills.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bills.list.path] });
      toast({
        title: "Bill Created",
        description: "Your new bill has been successfully added.",
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

export function useUpdateBill() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertBill> }) => {
      const url = buildUrl(api.bills.update.path, { id });
      const res = await fetch(url, {
        method: api.bills.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("Failed to update bill");
      return api.bills.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bills.list.path] });
      toast({ title: "Bill Updated", description: "Changes have been saved." });
    },
  });
}

export function useDeleteBill() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.bills.delete.path, { id });
      const res = await fetch(url, { method: api.bills.delete.method });
      if (!res.ok) throw new Error("Failed to delete bill");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bills.list.path] });
      toast({ title: "Bill Deleted", description: "The bill has been removed." });
    },
  });
}
