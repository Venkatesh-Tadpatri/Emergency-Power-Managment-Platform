import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import type { Alarm } from "../types/entities";

export function useAlarms(
  params: { systemId?: string; companyId?: string; resellerId?: string },
  options: { enabled?: boolean } = {}
) {
  const { systemId, companyId, resellerId } = params;
  return useQuery({
    queryKey: ["alarms", params],
    queryFn: async () =>
      (
        await api.get<Alarm[]>("/api/alarms", {
          params: {
            system_id: systemId,
            company_id: companyId,
            reseller_id: resellerId,
          },
        })
      ).data,
    enabled: options.enabled ?? !!(systemId || companyId || resellerId),
  });
}
