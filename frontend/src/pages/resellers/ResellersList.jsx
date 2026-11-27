import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/LocalAuth";
import { useQueryClient } from "@tanstack/react-query";
import { InfoCard } from "../../components/common/StatCard";
import { IconResellers } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { useToast } from "../../components/common/Toast";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { removeResellerLogo, uploadResellerLogo, useArchiveReseller, useCreateReseller, useResellers, useUpdateReseller } from "../../queries/resellers";
import { useSites, useSystems } from "../../queries/systems";
import { getWorstStatus } from "../../utils/customerCardStats";
import { COUNTRY_CODES, DEFAULT_COUNTRY } from "../auth/countryCodes";
import { phoneDigitLimit } from "../../components/users/userFields";
import { CONTACT_NAME_MAX, EMAIL_MAX, apiErrorMessage, companyNameError, contactNameError, joinPhone, optionalEmailError, optionalPhoneError, sanitizeContactName, splitStoredPhone } from "../../utils/contactValidation";

const blank = { name: "", contact_name: "", contact_email: "", contact_phone: "", show_logo_on_reports: false };

export function ResellersList() {
  const navigate = useNavigate(), [params] = useSearchParams(), auth = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe(auth.isAuthenticated), { data: resellers } = useResellers(), { data: companies } = useCompanies(), { data: systems } = useSystems(), { data: sites } = useSites();
  const create = useCreateReseller(), update = useUpdateReseller(), archive = useArchiveReseller();
  const [editing, setEditing] = useState(null), [archiving, setArchiving] = useState(null), [form, setForm] = useState(blank), [logo, setLogo] = useState(null), [saveError, setSaveError] = useState(""), [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY), [touched, setTouched] = useState({}), [submitted, setSubmitted] = useState(false);
  const [searchInput, setSearchInput] = useState(params.get("search") || "");
  usePageHeader("Active Resellers");
  if (me?.role === "reseller_admin" && me.reseller_id) return <Navigate to={`/resellers/${me.reseller_id}`} replace />;
  const search = searchInput.trim().toLowerCase();
  const rows = (resellers || []).filter(r => r.status !== "archived" && (!search || r.name.toLowerCase().includes(search)));
  const rids = new Set(rows.map(r => r.id)), cs = (companies || []).filter(c => rids.has(c.reseller_id)), cids = new Set(cs.map(c => c.id));
  const siteRows = (sites || []).filter(s => s.status !== "archived" && cids.has(s.customer_id)), activeSiteIds = new Set(siteRows.map(s => s.id));
  const ss = (systems || []).filter(s => cids.has(s.company_id) && activeSiteIds.has(s.site_id));
  const totals = [["Total Resellers", rows.length, "purple"], ["Total Customers", cs.length, "blue"], ["Total Sites", siteRows.length, "amber"], ["Total Systems", ss.length, "cyan"]];
  const edit = (r, e) => { e?.stopPropagation(); setEditing(r); setLogo(null); setSaveError(""); setTouched({}); setSubmitted(false);
    if (r === "new") { setPhoneCountry(DEFAULT_COUNTRY); setForm(blank); return; }
    const storedPhone = splitStoredPhone(r.contact_phone);
    setPhoneCountry(storedPhone.country);
    setForm({ name:r.name, contact_name:r.contact_name||"", contact_email:r.contact_email||"", contact_phone:storedPhone.phone, show_logo_on_reports:!!r.show_logo_on_reports }); };
  const validationErrors = {
    name: companyNameError(form.name),
    contact_name: contactNameError(form.contact_name),
    contact_email: optionalEmailError(form.contact_email),
    contact_phone: optionalPhoneError(phoneCountry, form.contact_phone),
  };
  const visibleError = field => (submitted || touched[field]) ? validationErrors[field] : undefined;
  const touch = field => () => setTouched(current => ({ ...current, [field]: true }));
  const isSaving = create.isPending || update.isPending;
  const submit = async e => {
    e.preventDefault();
    if (isSaving) return;
    setSaveError("");
    setSubmitted(true);
    if (Object.values(validationErrors).some(Boolean)) { toast.error("Please fix the highlighted fields."); return; }
    const isNew = editing === "new";
    const duplicate = (resellers || []).find(r => r.id !== editing?.id && r.name.trim().toLowerCase() === form.name.trim().toLowerCase());
    if (duplicate) { const message = `A reseller named "${duplicate.name}" already exists.`; setSaveError(message); toast.error(message); return; }
    const data = {...form, name:form.name.trim().replace(/\s+/g, " "), contact_name:form.contact_name.trim().replace(/\s+/g, " ")||(isNew?undefined:""), contact_email:form.contact_email.trim()||(isNew?undefined:""), contact_phone:joinPhone(phoneCountry, form.contact_phone)||(isNew?undefined:"")};
    try {
      const saved = isNew ? await create.mutateAsync(data) : await update.mutateAsync({id:editing.id,data});
      if (logo) { await uploadResellerLogo(saved.id, logo); await queryClient.invalidateQueries({queryKey:["resellers"]}); }
      setEditing(null);
      toast.success(isNew ? `Reseller "${saved.name}" created successfully.` : `Reseller "${saved.name}" updated successfully.`);
    } catch (error) {
      const message = apiErrorMessage(error, "Unable to save the reseller. Please try again.");
      setSaveError(message);
      toast.error(message);
    }
  };
  return <div className="companies-directory resellers-directory">
    <div className="reseller-total-strip">{totals.map(([l,v,t]) => <div className={`reseller-total-item ${t}`} key={l}><span>{l}</span><strong>{v}</strong></div>)}</div>
    {!!me?.permissions.manage_resellers && <div className="section-header reseller-directory-actions"><div/><button className="header-btn primary" onClick={() => edit("new")}>+ New Reseller</button></div>}
    <div className="directory-filters reseller-search-bar">
      <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search resellers by name..." aria-label="Search resellers by name" />
    </div>
    <div className="card-grid">{rows.map(r => { const rc=(companies||[]).filter(c=>c.reseller_id===r.id), rst=(sites||[]).filter(s=>s.status!=="archived"&&rc.some(c=>c.id===s.customer_id)), rs=(systems||[]).filter(s=>rst.some(site=>site.id===s.site_id)), off=rs.filter(s=>s.status==="offline").length; return <div className="reseller-card-shell" key={r.id}><InfoCard title={r.name} status={getWorstStatus(rs)} icon={IconResellers} stats={[{label:"Customers",value:rc.length,color:"var(--blue)"},{label:"Sites",value:rst.length,color:"var(--cyan)"},{label:"Total systems",value:rs.length,color:"var(--cyan)"},{label:"Offline devices",value:off,color:off?"var(--red)":"var(--green)"}]} onClick={()=>navigate(`/resellers/${r.id}/companies`)}/>{!!me?.permissions.manage_resellers&&<div className="reseller-card-actions"><button className="header-btn" onClick={e=>edit(r,e)}>Edit</button></div>}</div>; })}</div>
    {archiving && <ConfirmDialog title="Archive reseller" message={`Archive "${archiving.name}"? It will be moved to Archived Resellers.`} confirmLabel="Archive" onCancel={()=>setArchiving(null)} onConfirm={()=>{archive.mutate(archiving.id);setArchiving(null);}}/>}
    {editing && <Modal title={editing==="new"?"New Reseller":"Edit Reseller"} className="reseller-form-modal" onClose={()=>setEditing(null)}><form onSubmit={submit} noValidate>
      <div className={`form-row${visibleError("name") ? " has-error" : ""}`}><label>Company Name *</label><input maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} onBlur={touch("name")} aria-invalid={Boolean(visibleError("name"))} autoFocus/>{visibleError("name") && <small className="field-error">{visibleError("name")}</small>}</div>
      <div className={`form-row${visibleError("contact_name") ? " has-error" : ""}`}><label>Primary Contact Name</label><input maxLength={CONTACT_NAME_MAX} value={form.contact_name} onChange={e=>setForm({...form,contact_name:sanitizeContactName(e.target.value)})} onBlur={touch("contact_name")} aria-invalid={Boolean(visibleError("contact_name"))}/>{visibleError("contact_name") && <small className="field-error">{visibleError("contact_name")}</small>}</div>
      <div className={`form-row${visibleError("contact_email") ? " has-error" : ""}`}><label>Contact Email</label><input type="email" maxLength={EMAIL_MAX} value={form.contact_email} onChange={e=>setForm({...form,contact_email:e.target.value})} onBlur={touch("contact_email")} aria-invalid={Boolean(visibleError("contact_email"))}/>{visibleError("contact_email") && <small className="field-error">{visibleError("contact_email")}</small>}</div>
      <div className={`form-row${visibleError("contact_phone") ? " has-error" : ""}`}><label>Contact Phone</label><div className="customer-contact-phone"><select value={phoneCountry} onChange={e=>{const country=e.target.value; setPhoneCountry(country); setForm({...form,contact_phone:form.contact_phone.slice(0, phoneDigitLimit(country))});}} aria-label="Country calling code">{COUNTRY_CODES.map(item=><option value={item.iso} key={item.iso}>{item.iso} {item.dial}</option>)}</select><input type="tel" inputMode="numeric" maxLength={phoneDigitLimit(phoneCountry)} value={form.contact_phone} onChange={e=>setForm({...form,contact_phone:e.target.value.replace(/\D/g, "").slice(0, phoneDigitLimit(phoneCountry))})} onBlur={touch("contact_phone")} aria-invalid={Boolean(visibleError("contact_phone"))} placeholder="Mobile number"/></div>{visibleError("contact_phone") && <small className="field-error">{visibleError("contact_phone")}</small>}</div>
      <div className="form-row"><label>Brand logo (optional)</label>{editing!=="new"&&editing.logo_data&&<img className="reseller-logo-preview" src={editing.logo_data} alt={`${editing.name} logo`}/>}<input type="file" accept="image/png,image/jpeg" onChange={e=>setLogo(e.target.files?.[0]||null)}/><small>PNG or JPEG, up to 2 MB. This becomes the primary navigation logo for the reseller and its customers.</small></div>
      <label className="branding-checkbox"><input type="checkbox" checked={form.show_logo_on_reports} onChange={e=>setForm({...form,show_logo_on_reports:e.target.checked})}/> Include reseller logo on customer reports and PDFs</label>
      {saveError && <div className="reseller-save-error" role="alert">{saveError}</div>}
      <div className="modal-actions">{editing!=="new"&&editing.logo_data&&<button type="button" className="header-btn" disabled={isSaving} onClick={async()=>{await removeResellerLogo(editing.id);setEditing({...editing,logo_data:null});}}>Remove logo</button>}{editing!=="new"&&<button type="button" className="header-btn danger reseller-edit-archive" disabled={isSaving} onClick={()=>{setArchiving(editing);setEditing(null);}}>Archive</button>}<button type="button" className="header-btn" disabled={isSaving} onClick={()=>setEditing(null)}>Cancel</button><button type="submit" className="header-btn primary" disabled={isSaving}>{isSaving ? "Saving..." : "Save"}</button></div>
    </form></Modal>}
  </div>;
}
