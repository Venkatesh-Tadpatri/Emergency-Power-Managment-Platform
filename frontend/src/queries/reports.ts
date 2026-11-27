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

/** PDF of the Reports page's Initiating ATS / Average Time to Buss tab, built by the backend from the
 * stored reports with the same date range and filters the page is showing. */
export async function downloadAnalyticalReportPdf(
  kind: "initiating-ats" | "time-to-buss",
  params: { companyId: string; start: string; end: string; branch?: string; omitOverLimit?: boolean },
) {
  const response = await api.get(`/api/reports/analytical/${kind}/pdf`, {
    responseType: "blob",
    params: { company_id: params.companyId, start: params.start, end: params.end, branch: params.branch ?? "all", omit_over_limit: params.omitOverLimit ?? false },
  });
  const disposition = String(response.headers["content-disposition"] || "");
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `${kind}-report.pdf`;
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
