import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { InfoCard } from "../../components/common/StatCard";
import { IconBuilding, IconSearch } from "../../components/common/Icons";
import { QueryState } from "../../components/common/QueryState";
import { Modal } from "../../components/common/Modal";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useArchiveCompany, useCompanies, useCreateCompany, useUpdateCompany } from "../../queries/companies";
import { useAlarms } from "../../queries/alarms";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { useAllGenerators, useAllPanels, useSites, useSystems } from "../../queries/systems";
import { getCustomerCardStats, getCustomerLocationSummary, getCustomerWorstStatus } from "../../utils/customerCardStats";
import { activeAlarmOnly } from "../../utils/alarmClassification";

export function ResellerCompanies() {
  const { resellerId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
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
  const [form, setForm] = useState({ name: "", address: "", lat: "", lng: "" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  usePageHeader("Active Customers", [{ label: "Active Resellers", onClick: () => navigate("/resellers") }, { label: reseller?.name || "", onClick: () => navigate(`/resellers/${resellerId}`) }]);
  const canManage = !!me?.permissions.create_company;
  const openNew = () => { setForm({ name: "", address: "", lat: "", lng: "" }); setEditing("new"); };
  const openEdit = (company, event) => { event.stopPropagation(); setForm({ name: company.name, address: company.address || "", lat: company.lat?.toString() || "", lng: company.lng?.toString() || "" }); setEditing(company); };
  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !resellerId) return;
    const data = { name: form.name, address: form.address, lat: form.lat ? Number(form.lat) : undefined, lng: form.lng ? Number(form.lng) : undefined };
    if (editing === "new") createCompany.mutate({ ...data, reseller_id: resellerId });
    else if (editing) updateCompany.mutate({ id: editing.id, data });
    setEditing(null);
  };
  const filteredCompanies = (companies || []).filter((company) => {
    if (company.status === "archived" || !company.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    const customerSystems = (systems || []).filter((system) => system.company_id === company.id);
    if (statusFilter === "alarms") return activeAlarmOnly(alarms).some((alarm) => customerSystems.some((system) => system.id === alarm.system_id));
    if (statusFilter === "offline") return customerSystems.some((system) => system.status === "offline");
    if (statusFilter === "test") return customerSystems.some((system) => system.status === "test");
    return true;
  });
  if (resellerQuery.isPending || companiesQuery.isPending) return <QueryState loading title="Loading customers…" />;
  if (resellerQuery.isError || companiesQuery.isError) return <QueryState title="Customers unavailable" message="We couldn't retrieve this reseller's customers." onRetry={() => { void resellerQuery.refetch(); void companiesQuery.refetch(); }} />;
  return <>
    <div className="reseller-customers-toolbar"><label className="reseller-customers-search"><IconSearch size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers..." aria-label="Search customers" /></label><select className="customer-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter customers by status"><option value="all">All Customers</option><option value="alarms">Has Alarms</option><option value="offline">Offline</option><option value="test">In Test</option></select>{canManage && <button className="header-btn primary" onClick={openNew}>+ New Customer</button>}</div>
    <div className="card-grid reseller-customers-grid">{filteredCompanies.map((company) => {
      const stats = getCustomerCardStats(company.id, { sites, systems, alarms, panels, generators });
      return <div className="reseller-company-card-shell" key={company.id}><InfoCard title={company.name} status={getCustomerWorstStatus(company.id, { systems, alarms })} subtitle={getCustomerLocationSummary(company, sites || [])} icon={IconBuilding} stats={stats} onClick={() => navigate(`/companies/${company.id}`)} />{canManage && <div className="reseller-card-actions"><button className="header-btn" onClick={(event) => openEdit(company, event)}>Edit</button></div>}</div>;
    })}{filteredCompanies.length === 0 && <div className="reseller-customers-empty">No active customers match your search.</div>}</div>
    {editing && <Modal title={editing === "new" ? "New Customer" : "Edit Customer"} onClose={() => setEditing(null)}><form onSubmit={submit}><div className="form-row"><label>Customer Name *</label><input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Riverside Medical Center" autoFocus /></div><div className="form-row"><label>Address / City</label><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="e.g. 200 Main St, Springfield" /></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><div className="form-row"><label>Latitude</label><input type="number" step="any" min={-90} max={90} value={form.lat} onChange={(event) => setForm({ ...form, lat: event.target.value })} /></div><div className="form-row"><label>Longitude</label><input type="number" step="any" min={-180} max={180} value={form.lng} onChange={(event) => setForm({ ...form, lng: event.target.value })} /></div></div><div className="modal-actions">{editing !== "new" && <button type="button" className="header-btn danger reseller-edit-archive" onClick={() => { setArchiving(editing); setEditing(null); }}>Archive</button>}<button type="button" className="header-btn" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="header-btn primary">Save</button></div></form></Modal>}
    {archiving && <ConfirmDialog title="Archive customer" message={`Archive "${archiving.name}"? It will be moved to Archived Customers.`} confirmLabel="Archive" onCancel={() => setArchiving(null)} onConfirm={() => { archiveCompany.mutate(archiving.id); setArchiving(null); }} />}
  </>;
}
