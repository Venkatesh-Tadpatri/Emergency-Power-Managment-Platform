import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany, useUploadCompanyLogo } from "../../queries/companies";

export function CompanyDetails() {
  const { companyId } = useParams(); const navigate = useNavigate(); const inputRef = useRef<HTMLInputElement>(null);
  const { data: company } = useCompany(companyId); const upload = useUploadCompanyLogo(); const [error, setError] = useState("");
  usePageHeader("Company Details", [{ label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) }]);
  const selectLogo = async (file?: File) => {
    if (!file || !companyId) return; setError("");
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 2 * 1024 * 1024) { setError("Choose a PNG or JPEG logo smaller than 2 MB."); return; }
    try { await upload.mutateAsync({ id: companyId, file }); } catch { setError("The logo could not be uploaded. Please try again."); }
  };
  return <div className="company-details-card"><div><h2>Report branding</h2><p>Upload {company?.name || "this customer's"} logo. It will appear in on-screen reports and every downloaded PDF for this customer.</p></div><div className="company-logo-preview">{company?.logo_data ? <img src={company.logo_data} alt={`${company.name} logo`} /> : <span>No logo uploaded</span>}</div><input ref={inputRef} className="company-logo-input" type="file" accept="image/png,image/jpeg" onChange={(e) => selectLogo(e.target.files?.[0])} /><button type="button" className="report-download-btn" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>{upload.isPending ? "Uploading…" : company?.logo_data ? "Replace logo" : "Upload logo"}</button>{error && <p className="company-logo-error">{error}</p>}<p className="company-logo-help">PNG or JPEG, up to 2 MB.</p></div>;
}
