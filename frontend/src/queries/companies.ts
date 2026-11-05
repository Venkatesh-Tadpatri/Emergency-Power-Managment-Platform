import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { Company } from "../types/entities";

export function useCompanies(resellerId?: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["companies", { resellerId }],
    queryFn: async () =>
      (
        await api.get<Company[]>("/api/companies", {
          params: resellerId ? { reseller_id: resellerId } : {},
        })
      ).data,
    initialData: () => {
      if (!resellerId) return undefined;
      const allCompanies = qc.getQueryData<Company[]>(["companies", { resellerId: undefined }]);
      return allCompanies?.filter((company) => company.reseller_id === resellerId);
    },
    initialDataUpdatedAt: () => resellerId ? qc.getQueryState(["companies", { resellerId: undefined }])?.dataUpdatedAt : undefined,
  });
}

export function useCompany(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["companies", id],
    queryFn: async () => (await api.get<Company>(`/api/companies/${id}`)).data,
    enabled: !!id,
    staleTime: 0,
    initialData: () => {
      // The "companies" prefix also matches detail queries such as
      // ["companies", "CMP-0001"], whose cached value is a Company object.
      // Only list-query cache entries can be searched with Array.find().
      for (const [, companies] of qc.getQueriesData<unknown>({ queryKey: ["companies"] })) {
        if (!Array.isArray(companies)) continue;
        const company = (companies as Company[]).find((item) => item.id === id);
        if (company) return company;
      }
      return undefined;
    },
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

export function useUnarchiveCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.patch<Company>(`/api/companies/${id}`, { status: "active" })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });
}

export function useUploadCompanyLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append("logo", file);
      return (await api.post<Company>(`/api/companies/${id}/logo`, form)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });
}
