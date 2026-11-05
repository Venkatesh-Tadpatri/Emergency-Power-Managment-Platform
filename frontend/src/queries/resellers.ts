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
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["resellers", id],
    queryFn: async () => (await api.get<Reseller>(`/api/resellers/${id}`)).data,
    enabled: !!id,
    staleTime: 0,
    initialData: () => qc.getQueryData<Reseller[]>(["resellers"])?.find((reseller) => reseller.id === id),
    initialDataUpdatedAt: () => qc.getQueryState(["resellers"])?.dataUpdatedAt,
  });
}

export function useCreateReseller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Reseller>) =>
      (await api.post<Reseller>("/api/resellers", data)).data,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["resellers"] }); },
  });
}

export function useUpdateReseller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Reseller> }) =>
      (await api.patch<Reseller>(`/api/resellers/${id}`, data)).data,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["resellers"] }); },
  });
}

export async function uploadResellerLogo(id: string, logo: File) {
  const body = new FormData();
  body.append("logo", logo);
  return (await api.post<Reseller>(`/api/resellers/${id}/logo`, body)).data;
}

export async function removeResellerLogo(id: string) {
  return (await api.delete<Reseller>(`/api/resellers/${id}/logo`)).data;
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
