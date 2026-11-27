import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/LocalAuth";
import { InfoCard } from "../../components/common/StatCard";
import { Modal } from "../../components/common/Modal";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { IconBuilding, IconResellers } from "../../components/common/Icons";
import { QueryState } from "../../components/common/QueryState";
import { useToast } from "../../components/common/Toast";
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
  const toast = useToast();
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
  const [customerSaveError, setCustomerSaveError] = useState("");
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  const [customerStatusFilter, setCustomerStatusFilter] = useState("all");

  usePageHeader(
    reseller?.name || "Reseller",
    me?.role === "superadmin"
      ? [{ label: "Resellers", onClick: () => navigate("/resellers") }]
      : [],
  );

  const companySites = (sites || []).filter((site) => site.status !== "archived" && (companies || []).some((company) => company.id === site.customer_id));
  const companySiteIds = new Set(companySites.map((site) => site.id));
  const companySystems = (systems || []).filter((s) => (companies || []).some((c) => c.id === s.company_id) && companySiteIds.has(s.site_id));
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

  if (resellerQuery.isPending || companiesQuery.isPending) return <QueryState loading title="Loading reseller portfolio…" message="Customers and sites will appear as soon as they are ready." />;
  if (resellerQuery.isError || companiesQuery.isError) return <QueryState title="Reseller portfolio unavailable" message="The server did not return the customer list. Your data has not been changed." onRetry={() => { void resellerQuery.refetch(); void companiesQuery.refetch(); }} />;

  if (reseller?.status === "archived") {
    if (me?.permissions.manage_resellers) return <Navigate to="/resellers/archived" replace />;
    return <QueryState title="Reseller archived" message="This reseller portfolio is archived and is no longer accessible." />;
  }

  const openNewCustomer = () => {
    setCustomerSaveError("");
    setCustomerForm({ name: "", address: "" });
    setEditingCustomer("new");
  };


  const openEditCustomer = (c, e) => {
    e.stopPropagation();
    setCustomerSaveError("");
    setCustomerForm({ name: c.name, address: c.address || "" });
    setEditingCustomer(c);
  };

  const isSavingCustomer = createCompany.isPending || updateCompany.isPending;
  const submitCustomer = (e) => {
    e.preventDefault();
    if (isSavingCustomer || !customerForm.name.trim()) return;
    setCustomerSaveError("");
    const duplicate = (companies || []).find(company => company.id !== editingCustomer?.id && company.name.trim().toLowerCase() === customerForm.name.trim().toLowerCase());
    if (duplicate) {
      const message = `A customer named "${duplicate.name}" already exists.`;
      setCustomerSaveError(message);
      toast.error(message);
      return;
    }
    const onSuccess = (saved) => {
      setEditingCustomer(null);
      toast.success(editingCustomer === "new" ? `Customer "${saved.name}" created successfully.` : `Customer "${saved.name}" updated successfully.`);
    };
    const onError = (error) => {
      const detail = error?.response?.data?.detail;
      const message = typeof detail === "string" ? detail : "Unable to save the customer. Please try again.";
      setCustomerSaveError(message);
      toast.error(message);
    };
    if (editingCustomer === "new") {
      if (!resellerId) return;
      createCompany.mutate({ name: customerForm.name.trim(), address: customerForm.address, reseller_id: resellerId }, { onSuccess, onError });
    } else if (editingCustomer) {
      updateCompany.mutate({ id: editingCustomer.id, data: { name: customerForm.name.trim(), address: customerForm.address } }, { onSuccess, onError });
    }
  };

  const customerModal = !editingCustomer ? null : (
    <Modal title={editingCustomer === "new" ? "New Customer" : "Edit Customer"} onClose={() => !isSavingCustomer && setEditingCustomer(null)}>
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
        {customerSaveError && <div className="reseller-save-error" role="alert">{customerSaveError}</div>}
        <div className="modal-actions">
          {editingCustomer !== "new" && <button type="button" className="header-btn danger reseller-edit-archive" disabled={isSavingCustomer} onClick={() => { setDeletingCustomer(editingCustomer); setEditingCustomer(null); }}>Archive</button>}
          <button type="button" className="header-btn" disabled={isSavingCustomer} onClick={() => setEditingCustomer(null)}>Cancel</button>
          <button type="submit" className="header-btn primary" disabled={isSavingCustomer}>{isSavingCustomer ? "Saving..." : "Save"}</button>
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

      {customerModal}
      {deleteCustomerDialog}
    </>
  );
}
