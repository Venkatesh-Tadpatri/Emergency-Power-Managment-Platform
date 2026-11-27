import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export type PanelDeviceType = "generator" | "ats" | "meter" | "fuel_tank";
export type PanelLimits = Record<PanelDeviceType, number>;
export type PanelLimitsResponse = {
  limits: PanelLimits;
  defaults: PanelLimits;
  max: PanelLimits;
  /** Highest number of each device type currently on any single panel. */
  in_use: PanelLimits;
  updated_by: string | null;
  updated_at: string | null;
};

/** Used until the server answers, and if it can't be reached. Matches the backend defaults. */
export const DEFAULT_PANEL_LIMITS: PanelLimits = { generator: 1, ats: 4, meter: 4, fuel_tank: 1 };
export const SLOT_PREFIX: Record<PanelDeviceType, string> = { generator: "G", ats: "A", meter: "M", fuel_tank: "F" };

/** Slot names for a device type, e.g. slotsFor("ats", limits) → ["A1","A2","A3","A4"]. */
export const slotsFor = (type: PanelDeviceType, limits: PanelLimits) =>
  Array.from({ length: limits[type] }, (_, index) => `${SLOT_PREFIX[type]}${index + 1}`);

export function usePanelLimitsSettings() {
  return useQuery({
    queryKey: ["settings", "panel-limits"],
    queryFn: async () => (await api.get<PanelLimitsResponse>("/api/settings/panel-limits")).data,
    staleTime: 60_000,
  });
}

/** The current per-panel limits, falling back to the defaults while loading. */
export function usePanelLimits(): PanelLimits {
  return usePanelLimitsSettings().data?.limits || DEFAULT_PANEL_LIMITS;
}

export function useUpdatePanelLimits() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Panel device limits saved.", error: "Could not save the panel device limits." },
    mutationFn: async (limits: PanelLimits) => (await api.put<PanelLimitsResponse>("/api/settings/panel-limits", limits)).data,
    onSuccess: (data) => qc.setQueryData(["settings", "panel-limits"], data),
  });
}
