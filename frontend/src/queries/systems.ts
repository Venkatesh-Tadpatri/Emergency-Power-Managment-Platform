import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { ATS, Generator, Panel, System } from "../types/entities";

export function useSystems(companyId?: string) {
  return useQuery({
    queryKey: ["systems", { companyId }],
    queryFn: async () =>
      (
        await api.get<System[]>("/api/systems", {
          params: companyId ? { company_id: companyId } : {},
        })
      ).data,
  });
}

export function useSystem(id: string | undefined) {
  return useQuery({
    queryKey: ["systems", id],
    queryFn: async () => (await api.get<System>(`/api/systems/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateSystem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<System>) =>
      (await api.post<System>("/api/systems", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["systems"] }),
  });
}

export function useUpdateSystem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<System> }) =>
      (await api.patch<System>(`/api/systems/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["systems"] }),
  });
}

export function useArchiveSystem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<System>(`/api/systems/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["systems"] }),
  });
}

export function usePanels(systemId: string | undefined) {
  return useQuery({
    queryKey: ["panels", { systemId }],
    queryFn: async () =>
      (await api.get<Panel[]>("/api/panels", { params: { system_id: systemId } })).data,
    enabled: !!systemId,
  });
}

export function useCreatePanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Panel>) => (await api.post<Panel>("/api/panels", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["panels"] }),
  });
}

export function useAts(panelId: string | undefined) {
  return useQuery({
    queryKey: ["ats", { panelId }],
    queryFn: async () => (await api.get<ATS[]>("/api/ats", { params: { panel_id: panelId } })).data,
    enabled: !!panelId,
  });
}

export function useCreateAts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<ATS>) => (await api.post<ATS>("/api/ats", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ats"] }),
  });
}

export function useUpdateAts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ATS> }) =>
      (await api.patch<ATS>(`/api/ats/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ats"] }),
  });
}

export function useDeleteAts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/api/ats/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ats"] }),
  });
}

export function useGenerators(panelId: string | undefined) {
  return useQuery({
    queryKey: ["generators", { panelId }],
    queryFn: async () =>
      (await api.get<Generator[]>("/api/generators", { params: { panel_id: panelId } })).data,
    enabled: !!panelId,
  });
}

export function useCreateGenerator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Generator>) => (await api.post<Generator>("/api/generators", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["generators"] }),
  });
}

export function useUpdateGenerator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Generator> }) =>
      (await api.patch<Generator>(`/api/generators/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["generators"] }),
  });
}

export function useDeleteGenerator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/api/generators/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["generators"] }),
  });
}
