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

// A plain <a href> can't carry the axios instance's bearer-token header, so the PDF is fetched as a
// blob (same auth as every other request) and handed to the browser as a local object URL instead.
export async function downloadReportPdf(id: string, filename: string) {
  const response = await api.get(`/api/reports/${id}/pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
