import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import type { ReportDetail, ReportListItem } from "../types/entities";

export function useReports(params: { companyId?: string; systemId?: string }) {
  const { companyId, systemId } = params;
  return useQuery({
    queryKey: ["reports", params],
    queryFn: async () =>
      (
        await api.get<ReportListItem[]>("/api/reports", {
          params: { company_id: companyId, system_id: systemId },
        })
      ).data,
    enabled: !!(companyId || systemId),
  });
}

export function useReport(id: string | undefined) {
  return useQuery({
    queryKey: ["reports", "detail", id],
    queryFn: async () => (await api.get<ReportDetail>(`/api/reports/${id}`)).data,
    enabled: !!id,
  });
}
