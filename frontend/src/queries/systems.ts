import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { AlarmDisableStatus, AssetAlarmDisableList, AssetAlarmDisableStatus, ATS, Generator, Panel, Site, System, SystemEvent } from "../types/entities";

export function useSystems(companyId?: string, siteId?: string, includeArchived = false, enabled = true) {
  const qc = useQueryClient();
  const cachedSystems = () => {
    if (!companyId && !siteId) return undefined;
    for (const [key, systems] of qc.getQueriesData<System[]>({ queryKey: ["systems"] })) {
      if (!Array.isArray(systems)) continue;
      const scope = (key as [string, { companyId?: string; siteId?: string; includeArchived?: boolean }?])[1];
      if (!scope || typeof scope !== "object") continue;
      if (includeArchived && !scope.includeArchived) continue;
      // Only seed from an equal or broader cached scope. A company-wide list can safely
      // populate one of its sites; a different site's list cannot.
      const companyCovers = !scope.companyId || scope.companyId === companyId;
      const siteCovers = !scope.siteId || scope.siteId === siteId;
      if (companyCovers && siteCovers) {
        return { key, systems: systems.filter((system) => (!companyId || system.company_id === companyId) && (!siteId || system.site_id === siteId) && (includeArchived || !system.archived)) };
      }
    }
    return undefined;
  };
  return useQuery({
    queryKey: ["systems", { companyId, siteId, includeArchived }],
    enabled,
    queryFn: async () =>
      (
        await api.get<System[]>("/api/systems", {
          params: { ...(companyId ? { company_id: companyId } : {}), ...(siteId ? { site_id: siteId } : {}), ...(includeArchived ? { include_archived: true } : {}) },
        })
      ).data,
    staleTime: 30_000,
    initialData: () => cachedSystems()?.systems,
    initialDataUpdatedAt: () => {
      const cached = cachedSystems();
      return cached ? qc.getQueryState(cached.key)?.dataUpdatedAt : undefined;
    },
  });
}

export function useSites(customerId?: string, options: { enabled?: boolean } = {}) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["sites", { customerId }],
    enabled: options.enabled ?? true,
    queryFn: async () => (await api.get<Site[]>("/api/sites", { params: customerId ? { customer_id: customerId } : {} })).data,
    initialData: () => {
      if (!customerId) return undefined;
      const allSites = qc.getQueryData<Site[]>(["sites", { customerId: undefined }]);
      return allSites?.filter((site) => site.customer_id === customerId);
    },
  });
}

export function useSite(id?: string) {
  const qc = useQueryClient();
  const cachedSite = () => {
    for (const [key, sites] of qc.getQueriesData<Site[]>({ queryKey: ["sites"] })) {
      if (!Array.isArray(sites)) continue;
      const site = sites.find((item) => item.id === id);
      if (site) return { key, site };
    }
    return undefined;
  };
  return useQuery({
    queryKey: ["sites", id],
    queryFn: async () => (await api.get<Site>(`/api/sites/${id}`)).data,
    enabled: !!id,
    staleTime: 30_000,
    initialData: () => cachedSite()?.site,
    initialDataUpdatedAt: () => {
      const cached = cachedSite();
      return cached ? qc.getQueryState(cached.key)?.dataUpdatedAt : undefined;
    },
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Site created successfully.", error: "Could not create the site." },
    mutationFn: async (data: Partial<Site>) => (await api.post<Site>("/api/sites", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
}

export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Site details saved.", error: "Could not save the site." },
    mutationFn: async ({ id, data }: { id: string; data: Partial<Site> }) => (await api.patch<Site>(`/api/sites/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
}

export function useArchiveSite() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Site archived.", error: "Could not archive the site." },
    mutationFn: async (id: string) => (await api.delete<Site>(`/api/sites/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
}

export function useUnarchiveSite() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Site restored to active sites.", error: "Could not unarchive the site." },
    mutationFn: async (id: string) => (await api.patch<Site>(`/api/sites/${id}`, { status: "active" })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
}

export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Site deleted permanently.", error: "Could not delete the site." },
    mutationFn: async (id: string) => api.delete(`/api/sites/${id}/permanent`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites"] });
      qc.invalidateQueries({ queryKey: ["systems"] });
    },
  });
}

export function useSystem(id: string | undefined) {
  const qc = useQueryClient();
  const cachedSystem = () => {
    for (const [key, systems] of qc.getQueriesData<System[]>({ queryKey: ["systems"] })) {
      if (!Array.isArray(systems)) continue;
      const system = systems.find((item) => item.id === id);
      if (system) return { key, system };
    }
    return undefined;
  };
  return useQuery({
    queryKey: ["systems", id],
    queryFn: async () => (await api.get<System>(`/api/systems/${id}`)).data,
    enabled: !!id,
    staleTime: 30_000,
    initialData: () => cachedSystem()?.system,
    initialDataUpdatedAt: () => {
      const cached = cachedSystem();
      return cached ? qc.getQueryState(cached.key)?.dataUpdatedAt : undefined;
    },
  });
}

export function useAlarmDisableStatus(systemId?: string) {
  return useQuery({
    queryKey: ["systems", systemId, "alarm-disable"],
    queryFn: async () => (await api.get<AlarmDisableStatus>(`/api/systems/${systemId}/alarm-disable`)).data,
    enabled: !!systemId,
    refetchInterval: 30_000,
  });
}

export function useSystemEvents(systemId?: string) {
  return useQuery({
    queryKey: ["systems", systemId, "events"],
    queryFn: async () => (await api.get<SystemEvent[]>(`/api/systems/${systemId}/events`)).data,
    enabled: !!systemId,
    refetchInterval: 30_000,
  });
}

export function useDisableSystemAlarms(systemId: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Alarms disabled for this system.", error: "Could not disable alarms." },
    mutationFn: async (data: { duration: "1h" | "4h" | "8h" | "24h" | "indefinite"; reason: string }) =>
      (await api.post<AlarmDisableStatus>(`/api/systems/${systemId}/alarm-disable`, data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["systems", systemId, "alarm-disable"] });
      qc.invalidateQueries({ queryKey: ["systems", systemId, "events"] });
    },
  });
}

export function useEnableSystemAlarms(systemId: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Alarms re-enabled for this system.", error: "Could not re-enable alarms." },
    mutationFn: async () => (await api.delete<AlarmDisableStatus>(`/api/systems/${systemId}/alarm-disable`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["systems", systemId, "alarm-disable"] });
      qc.invalidateQueries({ queryKey: ["systems", systemId, "events"] });
    },
  });
}

export type AlarmDisableDuration = "1h" | "4h" | "8h" | "24h" | "indefinite";

/** Per-asset alarm suppressions for one system (polled, so an automatic re-enable clears the badge). */
export function useAssetAlarmDisables(systemId?: string) {
  return useQuery({
    queryKey: ["systems", systemId, "asset-alarm-disables"],
    queryFn: async () => (await api.get<AssetAlarmDisableList>(`/api/systems/${systemId}/asset-alarm-disables`)).data,
    enabled: !!systemId,
    refetchInterval: 30_000,
  });
}

function invalidateAssetAlarmDisable(qc: ReturnType<typeof useQueryClient>, systemId: string | undefined, recordKey: string) {
  qc.invalidateQueries({ queryKey: ["systems", systemId, "asset-alarm-disables"] });
  qc.invalidateQueries({ queryKey: ["systems", systemId, "events"] });
  // The disable/re-enable is also written to the asset's Notes.
  qc.invalidateQueries({ queryKey: ["equipment-notes", systemId || "", recordKey] });
}

export function useDisableAssetAlarms(systemId: string | undefined, recordKey: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Alarms disabled for this asset.", error: "Could not disable alarms." },
    mutationFn: async (data: { asset_name: string; duration: AlarmDisableDuration; reason: string }) =>
      (await api.post<AssetAlarmDisableStatus>(`/api/systems/${systemId}/asset-alarm-disables`, { record_key: recordKey, ...data })).data,
    onSuccess: () => invalidateAssetAlarmDisable(qc, systemId, recordKey),
  });
}

export function useEnableAssetAlarms(systemId: string | undefined, recordKey: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Alarms re-enabled for this asset.", error: "Could not re-enable alarms." },
    mutationFn: async () => {
      await api.delete(`/api/systems/${systemId}/asset-alarm-disables`, { params: { record_key: recordKey } });
    },
    onSuccess: () => invalidateAssetAlarmDisable(qc, systemId, recordKey),
  });
}

export function useCreateSystem() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "System created successfully.", error: "Could not create the system." },
    mutationFn: async (data: Partial<System>) =>
      (await api.post<System>("/api/systems", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["systems"] }),
  });
}

export function useUpdateSystem() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "System details saved.", error: "Could not save the system." },
    mutationFn: async ({ id, data }: { id: string; data: Partial<System> }) =>
      (await api.patch<System>(`/api/systems/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["systems"] }),
  });
}

export function useArchiveSystem() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "System archived.", error: "Could not archive the system." },
    mutationFn: async (id: string) => (await api.delete<System>(`/api/systems/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["systems"] }),
  });
}

export function useUnarchiveSystem() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "System restored to active systems.", error: "Could not unarchive the system." },
    mutationFn: async (id: string) => (await api.post<System>(`/api/systems/${id}/unarchive`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["systems"] }),
  });
}

export function useDeleteSystem() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "System deleted permanently.", error: "Could not delete the system." },
    mutationFn: async (id: string) => api.delete(`/api/systems/${id}/permanent`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["systems"] }),
  });
}

export function usePanels(systemId: string | undefined) {
  return useQuery({
    queryKey: ["panels", { systemId }],
    queryFn: async () =>
      (await api.get<Panel[]>("/api/panels", { params: { system_id: systemId }, timeout: 10_000 })).data,
    enabled: !!systemId,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useSitePanels(siteId: string | undefined) {
  return useQuery({
    queryKey: ["panels", { siteId }],
    queryFn: async () =>
      (await api.get<Panel[]>("/api/panels", { params: { site_id: siteId }, timeout: 10_000 })).data,
    enabled: !!siteId,
    staleTime: 30_000,
    retry: 1,
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
    meta: { success: "Panel created.", error: "Could not create the panel." },
    mutationFn: async (data: Partial<Panel>) => (await api.post<Panel>("/api/panels", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["panels"] }),
  });
}

export function useUpdatePanel() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Panel updated.", error: "Could not update the panel." },
    mutationFn: async ({ id, data }: { id: string; data: Partial<Panel> }) =>
      (await api.patch<Panel>(`/api/panels/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["panels"] }),
  });
}

export function useDeletePanel() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Panel deleted.", error: "Could not delete the panel." },
    mutationFn: async (id: string) => api.delete(`/api/panels/${id}`),
    // The panel's generators, ATS units and monitored assets are removed with it.
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ["panels"] }),
      qc.invalidateQueries({ queryKey: ["generators"] }),
      qc.invalidateQueries({ queryKey: ["ats"] }),
      qc.invalidateQueries({ queryKey: ["monitored-assets"] }),
    ]),
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

export function useSystemAts(systemId: string | undefined) {
  return useQuery({
    queryKey: ["ats", { systemId }],
    queryFn: async () => (await api.get<ATS[]>("/api/ats", { params: { system_id: systemId }, timeout: 10_000 })).data,
    enabled: !!systemId,
    staleTime: 30_000,
    retry: 1,
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
    meta: { success: "ATS created.", error: "Could not create the ATS." },
    mutationFn: async (data: Partial<ATS>) => (await api.post<ATS>("/api/ats", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ats"] }),
  });
}

export function useUpdateAts() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "ATS updated.", error: "Could not update the ATS." },
    mutationFn: async ({ id, data }: { id: string; data: Partial<ATS> }) =>
      (await api.patch<ATS>(`/api/ats/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ats"] }),
  });
}

export function useDeleteAts() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "ATS deleted.", error: "Could not delete the ATS." },
    mutationFn: async (id: string) => api.delete(`/api/ats/${id}`),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["ats"] }), qc.invalidateQueries({ queryKey: ["panels"] })]),
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

export function useSystemGenerators(systemId: string | undefined) {
  return useQuery({
    queryKey: ["generators", { systemId }],
    queryFn: async () => (await api.get<Generator[]>("/api/generators", { params: { system_id: systemId }, timeout: 10_000 })).data,
    enabled: !!systemId,
    staleTime: 30_000,
    retry: 1,
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
    meta: { success: "Generator created.", error: "Could not create the generator." },
    mutationFn: async (data: Partial<Generator>) => (await api.post<Generator>("/api/generators", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["generators"] }),
  });
}

export function useUpdateGenerator() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Generator updated.", error: "Could not update the generator." },
    mutationFn: async ({ id, data }: { id: string; data: Partial<Generator> }) =>
      (await api.patch<Generator>(`/api/generators/${id}`, data, { timeout: 20_000 })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["generators"] }),
  });
}

export function useDeleteGenerator() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Generator deleted.", error: "Could not delete the generator." },
    mutationFn: async (id: string) => api.delete(`/api/generators/${id}`),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["generators"] }), qc.invalidateQueries({ queryKey: ["panels"] })]),
  });
}

/** The One-Line Wizard's saved equipment/connections model for a system — one row per system, or none yet. */
export type OneLineRecord = { id: string; system_id: string; data: Record<string, unknown> };

export function useOneLine(systemId: string | undefined) {
  return useQuery({
    queryKey: ["one-line", systemId],
    queryFn: async () => (await api.get<OneLineRecord | null>(`/api/systems/${systemId}/one-line`, { timeout: 10_000 })).data,
    enabled: !!systemId,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useSaveOneLine() {
  const qc = useQueryClient();
  return useMutation({
    meta: { errorsOnly: true, error: "Could not save the one-line diagram. Your latest change may not be stored." },
    mutationFn: async ({ systemId, data }: { systemId: string; data: Record<string, unknown> }) =>
      (await api.put<OneLineRecord>(`/api/systems/${systemId}/one-line`, { data })).data,
    onSuccess: (_result, { systemId }) => qc.invalidateQueries({ queryKey: ["one-line", systemId] }),
  });
}
