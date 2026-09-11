import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { downloadReportPdf, useReport } from "../../queries/reports";
import { useSystem } from "../../queries/systems";
import { GeneratorRunReport } from "./GeneratorRunReport";
import { AtsTransferReport } from "./AtsTransferReport";

export function ReportDetail() {
  const { companyId, reportId } = useParams();
  const navigate = useNavigate();
  const { data: company } = useCompany(companyId);
  const { data: report } = useReport(reportId);
  const { data: system } = useSystem(report?.system_id);
  const [downloading, setDownloading] = useState(false);
  usePageHeader("Report Detail", [
    { label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) },
    { label: "Reports", onClick: () => navigate(`/companies/${companyId}/reports`) },
  ]);

  if (!report) return null;

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      await downloadReportPdf(report.id, `${report.report_code}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="report-detail-toolbar">
        <button className="report-back-btn" onClick={() => navigate(`/companies/${companyId}/reports`)}>← Back to reports</button>
        <button type="button" className="report-download-btn" onClick={downloadPdf} disabled={downloading}>
          {downloading ? "Preparing PDF…" : "Download PDF ↓"}
        </button>
      </div>
      {report.type === "gen-run" ? (
        <GeneratorRunReport report={report} system={system} company={company} />
      ) : (
        <AtsTransferReport report={report} system={system} company={company} />
      )}
    </>
  );
}
