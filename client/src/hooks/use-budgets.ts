import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CategoryBudget } from "@shared/schema";

export function useBudgets() {
  return useQuery<CategoryBudget[]>({ queryKey: ["/api/budgets"] });
}

export function useUpsertBudget() {
  return useMutation({
    mutationFn: ({ category, monthlyLimit }: { category: string; monthlyLimit: string }) =>
      apiRequest("POST", "/api/budgets", { category, monthlyLimit }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/budgets"] }),
  });
}

export function useDeleteBudget() {
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/budgets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/budgets"] }),
  });
}
