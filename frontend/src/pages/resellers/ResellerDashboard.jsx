import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { InfoCard } from "../../components/common/StatCard";
import { StatusPill } from "../../components/common/StatusPill";
import { Modal } from "../../components/common/Modal";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { IconBuilding, IconResellers } from "../../components/common/Icons";
import { QueryState } from "../../components/common/QueryState";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAlarms } from "../../queries/alarms";
import { useArchiveCompany, useCompanies, useCreateCompany, useUpdateCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { useAllGenerators, useAllPanels, useSites, useSystems } from "../../queries/systems";
import { getCustomerCardStats, getCustomerLocationSummary, getCustomerWorstStatus } from "../../utils/customerCardStats";
import { activeAlarmOnly } from "../../utils/alarmClassification";

export function ResellerDashboard() {
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
  const { data: panels } = useAllPanels();
  const { data: generators } = useAllGenerators();
  const { data: alarms } = useAlarms({ resellerId });
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const archiveCompany = useArchiveCompany();
  const canManage = !!me?.permissions.create_company;
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerForm, setCustomerForm] = useState({ name: "", address: "" });
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  const [customerStatusFilter, setCustomerStatusFilter] = useState("all");

  usePageHeader(
    reseller?.name || "Reseller",
    me?.role === "superadmin"
      ? [{ label: "Resellers", onClick: () => navigate("/resellers") }]
      : [],
  );

  const companySystems = (systems || []).filter((s) => (companies || []).some((c) => c.id === s.company_id));
  const companySites = (sites || []).filter((site) => site.status !== "archived" && (companies || []).some((company) => company.id === site.customer_id));
  const activeAlarms = activeAlarmOnly(alarms);
  const activeCustomers = (companies || []).filter((company) => company.status !== "archived");
  const filteredCustomers = activeCustomers.filter((company) => {
    const customerSystems = companySystems.filter((system) => system.company_id === company.id);
    if (customerStatusFilter === "alarms") return activeAlarms.some((alarm) => customerSystems.some((system) => system.id === alarm.system_id));
    if (customerStatusFilter === "offline") return customerSystems.some((system) => system.status === "offline");
    if (customerStatusFilter === "test") return customerSystems.some((system) => system.status === "test");
    return true;
  });
  const resellerTotals = [
    { label: "Total Customers", value: companies?.length ?? 0, tone: "blue" },
    { label: "Total Sites", value: companySites.length, tone: "amber" },
    { label: "Total Systems", value: companySystems.length, tone: "cyan" },
  ];
  const systemById = new Map(companySystems.map((system) => [system.id, system]));
  const companyById = new Map((companies || []).map((company) => [company.id, company]));
  const formatAlarmDate = (value) => new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  const formatAlarmTime = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  if (resellerQuery.isPending || companiesQuery.isPending) return <QueryState loading title="Loading reseller portfolio…" message="Customers and sites will appear as soon as they are ready." />;
  if (resellerQuery.isError || companiesQuery.isError) return <QueryState title="Reseller portfolio unavailable" message="The server did not return the customer list. Your data has not been changed." onRetry={() => { void resellerQuery.refetch(); void companiesQuery.refetch(); }} />;

  const openNewCustomer = () => {
    setCustomerForm({ name: "", address: "" });
    setEditingCustomer("new");
  };


  const openEditCustomer = (c, e) => {
    e.stopPropagation();
    setCustomerForm({ name: c.name, address: c.address || "" });
    setEditingCustomer(c);
  };

  const submitCustomer = (e) => {
    e.preventDefault();
    if (!customerForm.name.trim()) return;
    if (editingCustomer === "new") {
      if (!resellerId) return;
      createCompany.mutate({ name: customerForm.name, address: customerForm.address, reseller_id: resellerId });
    } else if (editingCustomer) {
      updateCompany.mutate({ id: editingCustomer.id, data: { name: customerForm.name, address: customerForm.address } });
    }
    setEditingCustomer(null);
  };

  const customerModal = !editingCustomer ? null : (
    <Modal title={editingCustomer === "new" ? "New Customer" : "Edit Customer"} onClose={() => setEditingCustomer(null)}>
      <form onSubmit={submitCustomer}>
        <div className="form-row">
          <label>Customer Name *</label>
          <input
            required
            minLength={2}
            maxLength={120}
            value={customerForm.name}
            onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
            placeholder="e.g. Riverside Medical Center"
            autoFocus
          />
        </div>
        <div className="form-row">
          <label>City</label>
          <input
            value={customerForm.address}
            onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
            placeholder="e.g. Springfield"
          />
        </div>
        <div className="modal-actions">
          {editingCustomer !== "new" && <button type="button" className="header-btn danger reseller-edit-archive" onClick={() => { setDeletingCustomer(editingCustomer); setEditingCustomer(null); }}>Archive</button>}
          <button type="button" className="header-btn" onClick={() => setEditingCustomer(null)}>Cancel</button>
          <button type="submit" className="header-btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );

  const deleteCustomerDialog = !deletingCustomer ? null : (
    <ConfirmDialog
      title="Archive customer"
      message={`Archive "${deletingCustomer.name}"? It will be moved to Archived Customers.`}
      confirmLabel="Archive"
      onCancel={() => setDeletingCustomer(null)}
      onConfirm={() => {
        archiveCompany.mutate(deletingCustomer.id);
        setDeletingCustomer(null);
      }}
    />
  );

  return (
    <>
      <div className="reseller-page-heading">
        <div className="reseller-page-heading-icon"><IconResellers size={19} /></div>
        <div className="reseller-page-heading-copy">
          <h2>{reseller?.name || "Reseller"}</h2>
        </div>
      </div>

      <div className="reseller-total-strip">
        {resellerTotals.map((total) => (
          <div className={`reseller-total-item ${total.tone}`} key={total.label}>
            <span>{total.label}</span>
            <strong>{total.value}</strong>
          </div>
        ))}
      </div>

      <div className="section-header">
        <div>
          <div className="section-title">Active Customers</div>
        </div>
        <div className="customer-list-actions">
          <select value={customerStatusFilter} onChange={(event) => setCustomerStatusFilter(event.target.value)} aria-label="Filter customers by status">
            <option value="all">All Customers</option>
            <option value="alarms">Has Alarms</option>
            <option value="offline">Offline</option>
            <option value="test">In Test</option>
          </select>
          {canManage && <button className="header-btn primary" onClick={openNewCustomer}>+ New Customer</button>}
        </div>
      </div>

      <div className="card-grid reseller-customer-grid">
        {filteredCustomers.map((c) => {
          const stats = getCustomerCardStats(c.id, { sites, systems, alarms, panels, generators });
          return (
            <div className="reseller-card-shell" key={c.id}>
              <InfoCard
                title={c.name}
                subtitle={getCustomerLocationSummary(c, sites || [])}
                status={getCustomerWorstStatus(c.id, { systems, alarms })}
                icon={IconBuilding}
                stats={stats}
                onClick={() => navigate(`/companies/${c.id}`)}
              />
              {canManage && (
                <div className="reseller-card-actions">
                  <button className="header-btn" onClick={(e) => openEditCustomer(c, e)}>Edit</button>
                </div>
              )}
            </div>
          );
        })}
        {filteredCustomers.length === 0 && <div className="reseller-customers-empty">No customers match this status filter.</div>}
      </div>

      <div className="section-header" style={{ marginTop: 18 }}>
        <div>
          <div className="section-title">Active Alarms</div>
          <div className="section-sub">{activeAlarms.length} active alarms across portfolio</div>
        </div>
      </div>
      {activeAlarms.length ? (
        <div className="reseller-active-alarms">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sl.No</th>
                <th>Date</th>
                <th>Time</th>
                <th>Customer</th>
                <th>System</th>
                <th>Alarm</th>
                <th>Severity</th>
                <th>Acknowledged</th>
              </tr>
            </thead>
            <tbody>
              {activeAlarms.map((a, index) => {
                const system = systemById.get(a.system_id);
                const company = system ? companyById.get(system.company_id) : undefined;
                return (
                  <tr key={a.id}>
                    <td className="mono">{index + 1}</td>
                    <td className="mono">{formatAlarmDate(a.occurred_at)}</td>
                    <td className="mono">{formatAlarmTime(a.occurred_at)}</td>
                    <td>{company?.name || "--"}</td>
                    <td>{system?.name || "--"}</td>
                    <td>{a.message}</td>
                    <td><StatusPill status={a.severity} /></td>
                    <td>{a.ack_by ? <span className="ack-badge acked">Acked</span> : <span className="ack-badge unacked">Unacked</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="reseller-alarms-empty">No active alarms in this reseller portfolio.</div>
      )}

      {customerModal}
      {deleteCustomerDialog}
    </>
  );
}
