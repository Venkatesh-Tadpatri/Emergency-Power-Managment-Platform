import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { ATS, Generator, Panel, Site, System } from "../types/entities";

export function useSystems(companyId?: string, siteId?: string) {
  return useQuery({
    queryKey: ["systems", { companyId, siteId }],
    queryFn: async () =>
      (
        await api.get<System[]>("/api/systems", {
          params: { ...(companyId ? { company_id: companyId } : {}), ...(siteId ? { site_id: siteId } : {}) },
        })
      ).data,
  });
}

export function useSites(customerId?: string) {
  return useQuery({
    queryKey: ["sites", { customerId }],
    queryFn: async () => (await api.get<Site[]>("/api/sites", { params: customerId ? { customer_id: customerId } : {} })).data,
  });
}

export function useSite(id?: string) {
  return useQuery({
    queryKey: ["sites", id],
    queryFn: async () => (await api.get<Site>(`/api/sites/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Site>) => (await api.post<Site>("/api/sites", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
}

export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Site> }) => (await api.patch<Site>(`/api/sites/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
}

export function useArchiveSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<Site>(`/api/sites/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
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

/** Portfolio-level equipment lookup for dashboards. The API still applies role scope. */
export function useAllPanels(enabled = true) {
  return useQuery({
    queryKey: ["panels", "all"],
    queryFn: async () => (await api.get<Panel[]>("/api/panels")).data,
    enabled,
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

/** Portfolio-level ATS lookup for dashboard and system-list summaries. */
export function useAllAts(enabled = true) {
  return useQuery({
    queryKey: ["ats", "all"],
    queryFn: async () => (await api.get<ATS[]>("/api/ats")).data,
    enabled,
  });
}

export function useAtsDevice(id: string | undefined) {
  return useQuery({
    queryKey: ["ats", id],
    queryFn: async () => (await api.get<ATS>(`/api/ats/${id}`)).data,
    enabled: !!id,
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

/** Portfolio-level generator lookup for dashboards. The API still applies role scope. */
export function useAllGenerators(enabled = true) {
  return useQuery({
    queryKey: ["generators", "all"],
    queryFn: async () => (await api.get<Generator[]>("/api/generators")).data,
    enabled,
  });
}

export function useGenerator(id: string | undefined) {
  return useQuery({
    queryKey: ["generators", id],
    queryFn: async () => (await api.get<Generator>(`/api/generators/${id}`)).data,
    enabled: !!id,
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
