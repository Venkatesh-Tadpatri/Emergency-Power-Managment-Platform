import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { InfoCard } from "../../components/common/StatCard";
import { StatusPill } from "../../components/common/StatusPill";
import { Modal } from "../../components/common/Modal";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { IconBuilding, IconResellers } from "../../components/common/Icons";
import { PageHero } from "../../components/common/PageHero";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAlarms } from "../../queries/alarms";
import { useArchiveCompany, useCompanies, useCreateCompany, useUpdateCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { useAllGenerators, useAllPanels, useSites, useSystems } from "../../queries/systems";

export function ResellerDashboard() {
  const { resellerId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: reseller } = useReseller(resellerId);
  const { data: companies } = useCompanies(resellerId);
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

  usePageHeader(
    reseller?.name || "Reseller",
    me?.role === "superadmin"
      ? [{ label: "Resellers", onClick: () => navigate("/resellers") }]
      : [],
  );

  const companySystems = (systems || []).filter((s) => (companies || []).some((c) => c.id === s.company_id));
  const companySites = (sites || []).filter((site) => site.status !== "archived" && (companies || []).some((company) => company.id === site.customer_id));
  const activeAlarms = (alarms || []).filter((a) => a.status === "active");
  const resellerTotals = [
    { label: "Total Customers", value: companies?.length ?? 0, tone: "blue" },
    { label: "Total Sites", value: companySites.length, tone: "amber" },
    { label: "Total Systems", value: companySystems.length, tone: "cyan" },
  ];
  const systemById = new Map(companySystems.map((system) => [system.id, system]));
  const companyById = new Map((companies || []).map((company) => [company.id, company]));
  const formatAlarmDate = (value) => new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  const formatAlarmTime = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

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
          <button type="button" className="header-btn" onClick={() => setEditingCustomer(null)}>Cancel</button>
          <button type="submit" className="header-btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );

  const deleteCustomerDialog = !deletingCustomer ? null : (
    <ConfirmDialog
      title="Delete customer"
      message={`Delete "${deletingCustomer.name}"? This hides the customer and its systems from active monitoring.`}
      confirmLabel="Delete"
      onCancel={() => setDeletingCustomer(null)}
      onConfirm={() => {
        archiveCompany.mutate(deletingCustomer.id);
        setDeletingCustomer(null);
      }}
    />
  );

  return (
    <>
      <PageHero
        title={reseller?.name || "Reseller"}
        subtitle={`${companies?.length ?? 0} customers - ${companySystems.length} systems`}
        icon={IconResellers}
        color={activeAlarms.length > 0 ? "#dc2626" : "#7c3aed"}
        bgImage="/images/hero-bg.jpg"
        showText={false}
        showIcon={false}
      />

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
          <div className="section-title">Customers</div>
        </div>
        {canManage && <button className="header-btn primary" onClick={openNewCustomer}>+ New Customer</button>}
      </div>

      <div className="card-grid reseller-customer-grid">
        {(companies || []).map((c) => {
          const cSystems = companySystems.filter((s) => s.company_id === c.id);
          const cSites = companySites.filter((site) => site.customer_id === c.id);
          const cOfflineDevices = cSystems.filter((system) => system.status === "offline").length;
          const cActiveAlarms = activeAlarms.filter((alarm) => cSystems.some((system) => system.id === alarm.system_id)).length;
          const cSystemIds = new Set(cSystems.map((system) => system.id));
          const cPanelIds = new Set((panels || []).filter((panel) => cSystemIds.has(panel.system_id)).map((panel) => panel.id));
          const cGenerators = (generators || []).filter((generator) => cPanelIds.has(generator.panel_id)).length;
          return (
            <div className="reseller-card-shell" key={c.id}>
              <InfoCard
                title={c.name}
                subtitle={c.address}
                icon={IconBuilding}
                stats={[
                  { label: "Sites", value: cSites.length, color: "var(--cyan)" },
                  { label: "Systems", value: cSystems.length, color: "var(--purple)" },
                  { label: "Offline devices", value: cOfflineDevices, color: cOfflineDevices ? "var(--red)" : "var(--green)" },
                  { label: "Active alarms", value: cActiveAlarms, color: cActiveAlarms ? "var(--red)" : "var(--green)" },
                  { label: "Generators", value: cGenerators, color: "var(--amber)" },
                ]}
                onClick={() => navigate(`/companies/${c.id}`)}
              />
              {canManage && (
                <div className="reseller-card-actions">
                  <button className="header-btn" onClick={(e) => openEditCustomer(c, e)}>Edit</button>
                  <button className="header-btn danger" onClick={(e) => { e.stopPropagation(); setDeletingCustomer(c); }}>Archive</button>
                </div>
              )}
            </div>
          );
        })}
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
