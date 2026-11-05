import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

export function useAcknowledgeAlarm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) =>
      (await api.patch<Alarm>(`/api/alarms/${id}/acknowledge`, { comment: comment?.trim() || null })).data,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["alarms"] }); },
  });
}
