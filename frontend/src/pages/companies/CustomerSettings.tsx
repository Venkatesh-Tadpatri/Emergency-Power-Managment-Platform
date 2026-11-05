import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany, useUpdateCompany, useUploadCompanyLogo } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { CompanyUsers } from "./CompanyUsers";

type Tab = "info" | "branding" | "users";

export function CustomerSettings() {
  const { companyId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: company } = useCompany(companyId);
  const update = useUpdateCompany();
  const upload = useUploadCompanyLogo();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(requestedTab === "branding" || requestedTab === "users" ? requestedTab : "info");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", address: "", contact_name: "", contact_email: "", contact_phone: "" });

  usePageHeader("Customer Settings", [{ label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) }]);
  useEffect(() => {
    if (company) setForm({
      name: company.name || "", address: company.address || "", contact_name: company.contact_name || "",
      contact_email: company.contact_email || "", contact_phone: company.contact_phone || "",
    });
  }, [company]);

  const saveInfo = async (event: FormEvent) => {
    event.preventDefault();
    if (!companyId) return;
    setMessage(""); setError("");
    try {
      await update.mutateAsync({ id: companyId, data: form });
      setMessage("Customer information saved.");
    } catch { setError("Customer information could not be saved. Please try again."); }
  };

  const selectLogo = async (file?: File) => {
    if (!file || !companyId) return;
    setMessage(""); setError("");
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError("Choose a PNG or JPEG logo smaller than 2 MB."); return;
    }
    try { await upload.mutateAsync({ id: companyId, file }); setMessage("Report logo updated."); }
    catch { setError("The logo could not be uploaded. Please try again."); }
  };

  const canManage = !!me?.permissions.manage_company_users;
  const selectTab = (nextTab: Tab) => { setTab(nextTab); setSearchParams(nextTab === "info" ? {} : { tab: nextTab }, { replace: true }); setMessage(""); setError(""); };
  return <div className="customer-settings">
    <div className="customer-settings-tabs" role="tablist" aria-label="Customer settings">
      <button className={tab === "info" ? "active" : ""} onClick={() => selectTab("info")}>Company Info</button>
      <button className={tab === "branding" ? "active" : ""} onClick={() => selectTab("branding")}>Report Branding</button>
      <button className={tab === "users" ? "active" : ""} onClick={() => selectTab("users")}>Users</button>
    </div>

    {tab === "info" && <form className="customer-settings-card" onSubmit={saveInfo}>
      <div><h2>Company information</h2><p>Keep the customer identity and primary contact details current.</p></div>
      <div className="customer-settings-grid">
        <div className="form-row"><label>Company Name *</label><input required minLength={2} maxLength={255} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canManage} /></div>
        <div className="form-row full"><label>Address</label><textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!canManage} /></div>
        <div className="form-row"><label>Primary Contact Name</label><input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} disabled={!canManage} /></div>
        <div className="form-row"><label>Contact Email</label><input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} disabled={!canManage} /></div>
        <div className="form-row"><label>Contact Phone</label><input type="tel" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} disabled={!canManage} /></div>
      </div>
      {error && <p className="company-logo-error">{error}</p>}{message && <p className="customer-settings-success">{message}</p>}
      {canManage && <div className="customer-settings-actions"><button className="header-btn primary" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save changes"}</button></div>}
    </form>}

    {tab === "branding" && <div className="customer-settings-card"><div><h2>Report branding</h2><p>Upload {company?.name || "this customer's"} logo for on-screen reports and downloaded PDFs.</p></div><div className="company-logo-preview">{company?.logo_data ? <img src={company.logo_data} alt={`${company.name} logo`} /> : <span>No logo uploaded</span>}</div>{canManage && <><input ref={inputRef} className="company-logo-input" type="file" accept="image/png,image/jpeg" onChange={(e) => selectLogo(e.target.files?.[0])} /><button type="button" className="report-download-btn" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>{upload.isPending ? "Uploading…" : company?.logo_data ? "Replace logo" : "Upload logo"}</button><p className="company-logo-help">PNG or JPEG, up to 2 MB.</p></>}{error && <p className="company-logo-error">{error}</p>}{message && <p className="customer-settings-success">{message}</p>}</div>}

    {tab === "users" && <div className="customer-settings-users"><CompanyUsers embedded /></div>}
  </div>;
}
