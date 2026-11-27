import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/LocalAuth";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { IconBuilding } from "../../components/common/Icons";
import { InfoCard } from "../../components/common/StatCard";
import { useToast } from "../../components/common/Toast";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies, useDeleteCompany, useUnarchiveCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller, useResellers } from "../../queries/resellers";
import { useSites, useSystems } from "../../queries/systems";

export function ArchivedCompanies() {
  const { resellerId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: reseller } = useReseller(resellerId);
  const { data: resellers } = useResellers();
  const { data: companies } = useCompanies(resellerId);
  const { data: sites } = useSites();
  const { data: systems } = useSystems();
  const unarchiveCompany = useUnarchiveCompany();
  const deleteCompany = useDeleteCompany();
  const toast = useToast();
  const [deleting, setDeleting] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const activePath = resellerId ? `/resellers/${resellerId}/companies` : "/companies";
  usePageHeader("Archived Customers", [
    ...(resellerId ? [{ label: "Active Resellers", onClick: () => navigate("/resellers") }, { label: reseller?.name || "", onClick: () => navigate(`/resellers/${resellerId}`) }] : []),
    { label: "Active Customers", onClick: () => navigate(activePath) },
  ]);
  const canManage = !!me?.permissions.create_company;
  const archived = (companies || []).filter((company) => company.status === "archived");
  const resellerById = new Map((resellers || []).map((item) => [item.id, item]));
  const busy = unarchiveCompany.isPending || deleteCompany.isPending;
  const confirmDelete = () => {
    if (!deleting) return;
    const customer = deleting;
    deleteCompany.mutate(customer.id, {
      onSuccess: () => toast.success(`Customer "${customer.name}" was deleted permanently.`),
      onError: (error) => toast.error(error?.response?.data?.detail || `Could not delete "${customer.name}".`),
    });
    setDeleting(null);
  };

  return <div className="companies-directory archived-directory">
    {archived.length === 0 ? <div className="reseller-customers-empty">No archived customers.</div> : <>
      <div className="directory-filter-count">{archived.length} archived customer{archived.length === 1 ? "" : "s"}</div>
      <div className="card-grid reseller-customers-grid archived-card-grid">{archived.map((company) => {
        const parentReseller = resellerById.get(company.reseller_id);
        const companySites = (sites || []).filter((site) => site.customer_id === company.id);
        const companySystems = (systems || []).filter((system) => system.company_id === company.id);
        return <div className="reseller-company-card-shell archived-card-shell" key={company.id}>
          <InfoCard
            title={company.name}
            status="archived"
            subtitle={company.address || "No address recorded"}
            icon={IconBuilding}
            stats={[{ label: "Sites", value: companySites.length }, { label: "Systems", value: companySystems.length }]}
            footer={<>
              <dl className="archived-card-details">
                <dt>Reseller</dt>
                <dd>{parentReseller?.name || "Unknown reseller"}{parentReseller?.status === "archived" && <span className="archived-card-flag">Reseller archived</span>}</dd>
                <dt>Contact</dt>
                <dd>{[company.contact_name, company.contact_email, company.contact_phone].filter(Boolean).join(" · ") || "—"}</dd>
              </dl>
              {canManage && <div className="archived-card-actions">
                <button type="button" className="header-btn" onClick={() => setRestoring(company)} disabled={busy}>Unarchive</button>
                <button type="button" className="header-btn danger" onClick={() => setDeleting(company)} disabled={busy}>Delete</button>
              </div>}
            </>}
          />
        </div>;
      })}</div>
    </>}
    {deleting && <ConfirmDialog title="Delete customer permanently" message={`Permanently delete "${deleting.name}" and all of its data? This cannot be undone.`} confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />}
    {restoring && <ConfirmDialog title="Unarchive customer" message={`Restore "${restoring.name}" to Active Customers?`} confirmLabel="Unarchive" danger={false} onCancel={() => setRestoring(null)} onConfirm={() => { const target = restoring; setRestoring(null); unarchiveCompany.mutate(target.id, { onSuccess: () => toast.success(`Customer "${target.name}" unarchived successfully.`), onError: (error) => toast.error(error?.response?.data?.detail || `Could not unarchive "${target.name}".`) }); }} />}
  </div>;
}
