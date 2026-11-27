import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/LocalAuth";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { InfoCard } from "../../components/common/StatCard";
import { IconBuilding, IconSearch } from "../../components/common/Icons";
import { QueryState } from "../../components/common/QueryState";
import { Modal } from "../../components/common/Modal";
import { useToast } from "../../components/common/Toast";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useArchiveCompany, useCompanies, useCreateCompany, useUpdateCompany } from "../../queries/companies";
import { useAlarms } from "../../queries/alarms";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { useAllGenerators, useAllPanels, useSites, useSystems } from "../../queries/systems";
import { getCustomerCardStats, getCustomerLocationSummary, getCustomerWorstStatus } from "../../utils/customerCardStats";
import { activeAlarmOnly } from "../../utils/alarmClassification";
import { CONTACT_NAME_MAX, EMAIL_MAX, apiErrorMessage, contactNameError, joinPhone, optionalEmailError, optionalPhoneError, sanitizeContactName, splitStoredPhone } from "../../utils/contactValidation";
import { phoneDigitLimit } from "../../components/users/userFields";
import { COUNTRY_CODES, DEFAULT_COUNTRY } from "../auth/countryCodes";

export function ResellerCompanies() {
  const { resellerId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const toast = useToast();
  const { data: me } = useMe(auth.isAuthenticated);
  const resellerQuery = useReseller(resellerId);
  const companiesQuery = useCompanies(resellerId);
  const { data: reseller } = resellerQuery;
  const { data: companies } = companiesQuery;
  const { data: systems } = useSystems();
  const { data: sites } = useSites();
  const { data: alarms } = useAlarms({ resellerId });
  const { data: panels } = useAllPanels();
  const { data: generators } = useAllGenerators();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const archiveCompany = useArchiveCompany();
  const [editing, setEditing] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const [saveError, setSaveError] = useState("");
  const emptyForm = { name: "", address: "", contact_name: "", contact_email: "", phoneCountry: DEFAULT_COUNTRY, contact_phone: "", notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  usePageHeader("Active Customers", [{ label: "Active Resellers", onClick: () => navigate("/resellers") }, { label: reseller?.name || "", onClick: () => navigate(`/resellers/${resellerId}`) }]);
  const canManage = !!me?.permissions.create_company;
  const openNew = () => { setSaveError(""); setFormSubmitted(false); setForm(emptyForm); setEditing("new"); };
  const openEdit = (company, event) => {
    event.stopPropagation();
    setSaveError("");
    setFormSubmitted(false);
    const phone = splitStoredPhone(company.contact_phone);
    setForm({ name: company.name, address: company.address || "", contact_name: company.contact_name || "", contact_email: company.contact_email || "", phoneCountry: phone.country, contact_phone: phone.phone, notes: company.notes || "" });
    setEditing(company);
  };
  const isSaving = createCompany.isPending || updateCompany.isPending;
  const formErrors = {
    contact_name: contactNameError(form.contact_name),
    contact_email: optionalEmailError(form.contact_email),
    contact_phone: optionalPhoneError(form.phoneCountry, form.contact_phone),
  };
  const fieldError = (field) => (formSubmitted ? formErrors[field] : undefined);
  const submit = (event) => {
    event.preventDefault();
    if (isSaving || !form.name.trim() || !resellerId) return;
    setSaveError("");
    setFormSubmitted(true);
    if (Object.values(formErrors).some(Boolean)) return;
    const duplicate = (companies || []).find(company => company.id !== editing?.id && company.name.trim().toLowerCase() === form.name.trim().toLowerCase());
    if (duplicate) { const message = `A customer named "${duplicate.name}" already exists.`; setSaveError(message); toast.error(message); return; }
    const data = {
      name: form.name.trim(), address: form.address,
      contact_name: form.contact_name.trim().replace(/\s+/g, " "), contact_email: form.contact_email.trim(),
      contact_phone: joinPhone(form.phoneCountry, form.contact_phone), notes: form.notes,
    };
    const onSuccess = (saved) => { setEditing(null); toast.success(editing === "new" ? `Customer "${saved.name}" created successfully (CUSTCODE ${saved.customer_code}).` : `Customer "${saved.name}" updated successfully.`); };
    const onError = (error) => { const message = apiErrorMessage(error, "Unable to save the customer. Please try again."); setSaveError(message); toast.error(message); };
    if (editing === "new") createCompany.mutate({ ...data, reseller_id: resellerId }, { onSuccess, onError });
    else if (editing) updateCompany.mutate({ id: editing.id, data }, { onSuccess, onError });
  };
  const activeCompanies = (companies || []).filter((company) => company.status !== "archived");
  const activeCompanyIds = new Set(activeCompanies.map((company) => company.id));
  const activeSites = (sites || []).filter((site) => site.status !== "archived" && activeCompanyIds.has(site.customer_id));
  const activeSiteIds = new Set(activeSites.map((site) => site.id));
  const activeSystems = (systems || []).filter((system) => activeCompanyIds.has(system.company_id) && activeSiteIds.has(system.site_id));
  const totals = [
    ["Total Customers", activeCompanies.length, "blue"],
    ["Total Sites", activeSites.length, "amber"],
    ["Total Systems", activeSystems.length, "cyan"],
    ["Offline Devices", activeSystems.filter((system) => system.status === "offline").length, "red"],
  ];
  const filteredCompanies = activeCompanies.filter((company) => {
    if (!company.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    const customerSystems = (systems || []).filter((system) => system.company_id === company.id);
    if (statusFilter === "alarms") return activeAlarmOnly(alarms).some((alarm) => customerSystems.some((system) => system.id === alarm.system_id));
    if (statusFilter === "offline") return customerSystems.some((system) => system.status === "offline");
    if (statusFilter === "test") return customerSystems.some((system) => system.status === "test");
    return true;
  });
  if (resellerQuery.isPending || companiesQuery.isPending) return <QueryState loading title="Loading customers…" />;
  if (resellerQuery.isError || companiesQuery.isError) return <QueryState title="Customers unavailable" message="We couldn't retrieve this reseller's customers." onRetry={() => { void resellerQuery.refetch(); void companiesQuery.refetch(); }} />;
  return <div className="companies-directory reseller-companies-directory">
    <div className="reseller-total-strip customer-total-strip">{totals.map(([label, value, tone]) => <div className={`reseller-total-item ${tone}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    {/* Search + status filter grouped on the left; the primary action sits on its own at the right. */}
    <div className="reseller-customers-toolbar">
      <div className="reseller-customers-filters">
        <label className="reseller-customers-search"><IconSearch size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers..." aria-label="Search customers" /></label>
        <select className="customer-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter customers by status"><option value="all">All Customers</option><option value="alarms">Has Alarms</option><option value="offline">Offline</option><option value="test">In Test</option></select>
      </div>
      {canManage && <button className="header-btn primary" onClick={openNew}>+ New Customer</button>}
    </div>
    <div className="card-grid reseller-customers-grid">{filteredCompanies.map((company) => {
      const stats = getCustomerCardStats(company.id, { sites, systems, alarms, panels, generators });
      return <div className="reseller-company-card-shell" key={company.id}><InfoCard title={company.name} status={getCustomerWorstStatus(company.id, { systems, alarms })} subtitle={getCustomerLocationSummary(company, sites || [])} icon={IconBuilding} stats={stats} onClick={() => navigate(`/companies/${company.id}`)} />{canManage && <div className="reseller-card-actions"><button className="header-btn" onClick={(event) => openEdit(company, event)}>Edit</button></div>}</div>;
    })}{filteredCompanies.length === 0 && <div className="reseller-customers-empty">No active customers match your search.</div>}</div>
    {editing && <Modal title={editing === "new" ? "New Customer" : "Edit Customer"} onClose={() => !isSaving && setEditing(null)}><form onSubmit={submit}><div className="form-row"><label>Customer Name *</label><input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Riverside Medical Center" autoFocus /></div><div className="form-row"><label>Address / City</label><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="e.g. 200 Main St, Springfield" /></div>
      {editing !== "new" && editing?.customer_code && <div className="form-row"><label>CUSTCODE</label><input className="mono" value={editing.customer_code} readOnly aria-readonly="true" /></div>}
      <div className={`form-row${fieldError("contact_name") ? " has-error" : ""}`}><label>Primary Contact Name</label><input maxLength={CONTACT_NAME_MAX} value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: sanitizeContactName(event.target.value) })} placeholder="e.g. Priya Sharma" />{fieldError("contact_name") && <small className="field-error">{fieldError("contact_name")}</small>}</div>
      <div className={`form-row${fieldError("contact_email") ? " has-error" : ""}`}><label>Contact Email</label><input type="email" maxLength={EMAIL_MAX} value={form.contact_email} onChange={(event) => setForm({ ...form, contact_email: event.target.value })} placeholder="e.g. facilities@customer.com" />{fieldError("contact_email") && <small className="field-error">{fieldError("contact_email")}</small>}</div>
      <div className={`form-row${fieldError("contact_phone") ? " has-error" : ""}`}><label>Contact Phone</label><div className="customer-contact-phone"><select value={form.phoneCountry} onChange={(event) => setForm({ ...form, phoneCountry: event.target.value, contact_phone: form.contact_phone.slice(0, phoneDigitLimit(event.target.value)) })} aria-label="Country calling code">{COUNTRY_CODES.map((item) => <option value={item.iso} key={item.iso}>{item.iso} {item.dial}</option>)}</select><input type="tel" inputMode="numeric" maxLength={phoneDigitLimit(form.phoneCountry)} value={form.contact_phone} onChange={(event) => setForm({ ...form, contact_phone: event.target.value.replace(/\D/g, "").slice(0, phoneDigitLimit(form.phoneCountry)) })} placeholder="Mobile number" /></div>{fieldError("contact_phone") && <small className="field-error">{fieldError("contact_phone")}</small>}</div>
      <div className="form-row"><label>Notes</label><textarea rows={3} maxLength={5000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Optional" /></div>
      {editing === "new" && <p className="customer-settings-hint">A CUSTCODE is assigned automatically when the customer is created.</p>}
      {saveError && <div className="reseller-save-error" role="alert">{saveError}</div>}<div className="modal-actions">{editing !== "new" && <button type="button" className="header-btn danger reseller-edit-archive" disabled={isSaving} onClick={() => { setArchiving(editing); setEditing(null); }}>Archive</button>}<button type="button" className="header-btn" disabled={isSaving} onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="header-btn primary" disabled={isSaving}>{isSaving ? "Saving..." : "Save"}</button></div></form></Modal>}
    {archiving && <ConfirmDialog title="Archive customer" message={`Archive "${archiving.name}"? It will be moved to Archived Customers.`} confirmLabel="Archive" onCancel={() => setArchiving(null)} onConfirm={() => { archiveCompany.mutate(archiving.id); setArchiving(null); }} />}
  </div>;
}
