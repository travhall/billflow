import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { InsertPaySchedule } from "@shared/schema";

export function usePaySchedule() {
  return useQuery({
    queryKey: [api.paySchedule.get.path],
    queryFn: async () => {
      const res = await fetch(api.paySchedule.get.path);
      if (!res.ok) throw new Error("Failed to fetch pay schedule");
      return api.paySchedule.get.responses[200].parse(await res.json());
    },
  });
}

export function useUpsertPaySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertPaySchedule) => {
      const res = await fetch(api.paySchedule.upsert.path, {
        method: api.paySchedule.upsert.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to save pay schedule");
      }
      return api.paySchedule.upsert.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.paySchedule.get.path] }),
  });
}
