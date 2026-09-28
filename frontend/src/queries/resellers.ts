import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { Reseller } from "../types/entities";

export function useResellers() {
  return useQuery({
    queryKey: ["resellers"],
    queryFn: async () => (await api.get<Reseller[]>("/api/resellers")).data,
  });
}

export function useReseller(id: string | undefined) {
  return useQuery({
    queryKey: ["resellers", id],
    queryFn: async () => (await api.get<Reseller>(`/api/resellers/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateReseller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Reseller>) =>
      (await api.post<Reseller>("/api/resellers", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resellers"] }),
  });
}

export function useUpdateReseller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Reseller> }) =>
      (await api.patch<Reseller>(`/api/resellers/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resellers"] }),
  });
}

export function useArchiveReseller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<Reseller>(`/api/resellers/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resellers"] }),
  });
}

export function useUnarchiveReseller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<Reseller>(`/api/resellers/${id}/unarchive`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resellers"] }),
  });
}

export function useDeleteReseller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/resellers/${id}/permanent`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resellers"] }),
  });
}
