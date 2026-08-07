import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import type { ATS, Panel, System } from "../types/entities";

export interface SystemAts {
  system: System;
  ats: ATS[];
}

/** Fetches every ATS device across a company's systems, for the ATS compliance tab. */
export function useCompanyAtsRoster(companyId: string | undefined) {
  return useQuery({
    queryKey: ["compliance", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const systems = (await api.get<System[]>("/api/systems", { params: { company_id: companyId } })).data;
      const result: SystemAts[] = [];
      for (const system of systems) {
        const panels = (await api.get<Panel[]>("/api/panels", { params: { system_id: system.id } })).data;
        const atsLists = await Promise.all(
          panels.map((p) => api.get<ATS[]>("/api/ats", { params: { panel_id: p.id } }))
        );
        result.push({ system, ats: atsLists.flatMap((r) => r.data) });
      }
      return result;
    },
  });
}
