import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/LocalAuth";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany, useUpdateCompany, useUploadCompanyLogo } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { COUNTRY_CODES, DEFAULT_COUNTRY } from "../auth/countryCodes";
import { formatPhone, phoneDigitLimit, phoneError } from "../../components/users/userFields";
import { CompanyUsers } from "./CompanyUsers";
import { CONTACT_NAME_MAX, EMAIL_MAX, optionalEmailError } from "../../utils/contactValidation";

type Tab = "info" | "branding" | "users";

const contactNameError = (raw: string) => {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return undefined;
  if (!/[\p{L}]/u.test(value) || !/^[\p{L}\p{M} .'-]+$/u.test(value)) return "Enter a valid contact name using letters, spaces, apostrophes, periods, or hyphens";
  if (value.length < 2) return "Contact name must be at least 2 characters";
  if (value.length > CONTACT_NAME_MAX) return `Contact name must be at most ${CONTACT_NAME_MAX} characters`;
  return undefined;
};

const sanitizeContactName = (value: string) => value
  .replace(/[^\p{L}\p{M} .'-]/gu, "")
  .replace(/\s{2,}/g, " ");

const optionalPhoneError = (country: string, value: string) => value ? phoneError(country, value) : undefined;

function splitStoredPhone(value: string) {
  const compact = value.trim().replace(/[()\s-]/g, "");
  const country = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length).find((item) => compact.startsWith(item.dial));
  return { country: country?.iso || DEFAULT_COUNTRY, phone: compact.replace(country?.dial || "", "").replace(/\D/g, "") };
}

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
  const [form, setForm] = useState({ name: "", address: "", contact_name: "", contact_email: "", contact_phone: "", notes: "" });
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  usePageHeader("Customer Settings", [{ label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) }]);
  useEffect(() => {
    if (company) {
      const storedPhone = splitStoredPhone(company.contact_phone || "");
      setPhoneCountry(storedPhone.country);
      setForm({
        name: company.name || "", address: company.address || "", contact_name: company.contact_name || "",
        contact_email: company.contact_email || "", contact_phone: storedPhone.phone, notes: company.notes || "",
      });
    }
  }, [company]);

  const validationErrors: Record<string, string | undefined> = {
    contact_name: contactNameError(form.contact_name),
    contact_email: optionalEmailError(form.contact_email),
    contact_phone: optionalPhoneError(phoneCountry, form.contact_phone),
  };
  const visibleError = (field: string) => submitted || touched[field] ? validationErrors[field] : undefined;
  const touch = (field: string) => () => setTouched((current) => ({ ...current, [field]: true }));

  const saveInfo = async (event: FormEvent) => {
    event.preventDefault();
    if (!companyId) return;
    setSubmitted(true);
    setMessage(""); setError("");
    if (Object.values(validationErrors).some(Boolean)) return;
    try {
      await update.mutateAsync({ id: companyId, data: {
        ...form,
        contact_name: form.contact_name.trim().replace(/\s+/g, " "),
        contact_email: form.contact_email.trim(),
        contact_phone: form.contact_phone ? formatPhone(phoneCountry, form.contact_phone) : "",
      } });
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
  // Company Info is saved through the customer record, which the server lets Super Admins and the
  // owning Reseller Admin change. Customer Admins see it read-only rather than a Save that fails.
  const canEditInfo = !!me?.permissions.create_company;
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
        <div className="form-row"><label>Company Name *</label><input required minLength={2} maxLength={255} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEditInfo} /></div>
        <div className="form-row"><label>CUSTCODE</label><input className="mono customer-code-field" value={company?.customer_code || "—"} readOnly aria-readonly="true" title="Assigned automatically when the customer is created. It cannot be changed." /><small className="customer-settings-hint">Assigned automatically and cannot be changed. Used as the PNUMBER prefix ({company?.customer_code || "CODE"}P01).</small></div>
        <div className="form-row full"><label>Address</label><textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!canEditInfo} /></div>
        <div className={`form-row${visibleError("contact_name") ? " has-error" : ""}`}><label>Primary Contact Name</label><input maxLength={CONTACT_NAME_MAX} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: sanitizeContactName(e.target.value) })} onBlur={touch("contact_name")} aria-invalid={Boolean(visibleError("contact_name"))} placeholder={canEditInfo ? "e.g. Priya Sharma" : "Not provided"} disabled={!canEditInfo} />{visibleError("contact_name") && <small className="field-error">{visibleError("contact_name")}</small>}</div>
        <div className={`form-row${visibleError("contact_email") ? " has-error" : ""}`}><label>Contact Email</label><input type="email" maxLength={EMAIL_MAX} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} onBlur={touch("contact_email")} aria-invalid={Boolean(visibleError("contact_email"))} placeholder={canEditInfo ? "e.g. facilities@customer.com" : "Not provided"} disabled={!canEditInfo} />{visibleError("contact_email") && <small className="field-error">{visibleError("contact_email")}</small>}</div>
        <div className={`form-row full${visibleError("contact_phone") ? " has-error" : ""}`}><label>Contact Phone</label><div className="customer-contact-phone"><select value={phoneCountry} onChange={(e) => { const country = e.target.value; setPhoneCountry(country); setForm({ ...form, contact_phone: form.contact_phone.slice(0, phoneDigitLimit(country)) }); }} aria-label="Country calling code" disabled={!canEditInfo}>{COUNTRY_CODES.map((item) => <option value={item.iso} key={item.iso}>{item.iso} {item.dial}</option>)}</select><input type="tel" inputMode="numeric" maxLength={phoneDigitLimit(phoneCountry)} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value.replace(/\D/g, "").slice(0, phoneDigitLimit(phoneCountry)) })} onBlur={touch("contact_phone")} aria-invalid={Boolean(visibleError("contact_phone"))} placeholder="Mobile number" disabled={!canEditInfo} /></div>{visibleError("contact_phone") && <small className="field-error">{visibleError("contact_phone")}</small>}</div>
        <div className="form-row full"><label>Notes</label><textarea rows={4} maxLength={5000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={canEditInfo ? "Site access instructions, contract details, escalation preferences…" : "No notes"} disabled={!canEditInfo} /></div>
      </div>
      {!canEditInfo && <p className="customer-settings-hint">Company information is managed by your reseller or a Super Admin.</p>}
      {error && <p className="company-logo-error">{error}</p>}{message && <p className="customer-settings-success">{message}</p>}
      {canEditInfo && <div className="customer-settings-actions"><button className="header-btn primary" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save changes"}</button></div>}
    </form>}

    {tab === "branding" && <div className="customer-settings-card"><div><h2>Report branding</h2><p>Upload {company?.name || "this customer's"} logo for on-screen reports and downloaded PDFs.</p></div><div className="company-logo-preview">{company?.logo_data ? <img src={company.logo_data} alt={`${company.name} logo`} /> : <span>No logo uploaded</span>}</div>{canManage && <><input ref={inputRef} className="company-logo-input" type="file" accept="image/png,image/jpeg" onChange={(e) => selectLogo(e.target.files?.[0])} /><button type="button" className="report-download-btn" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>{upload.isPending ? "Uploading…" : company?.logo_data ? "Replace logo" : "Upload logo"}</button><p className="company-logo-help">PNG or JPEG, up to 2 MB.</p></>}{error && <p className="company-logo-error">{error}</p>}{message && <p className="customer-settings-success">{message}</p>}</div>}

    {tab === "users" && <div className="customer-settings-users"><CompanyUsers embedded /></div>}
  </div>;
}
