import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { Company } from "../types/entities";

export function useCompanies(resellerId?: string) {
  return useQuery({
    queryKey: ["companies", { resellerId }],
    queryFn: async () =>
      (
        await api.get<Company[]>("/api/companies", {
          params: resellerId ? { reseller_id: resellerId } : {},
        })
      ).data,
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: ["companies", id],
    queryFn: async () => (await api.get<Company>(`/api/companies/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Company>) =>
      (await api.post<Company>("/api/companies", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Company> }) =>
      (await api.patch<Company>(`/api/companies/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });
}

export function useArchiveCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<Company>(`/api/companies/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });
}
