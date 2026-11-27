import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/LocalAuth";

import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { IconResellers } from "../../components/common/Icons";
import { InfoCard } from "../../components/common/StatCard";
import { useToast } from "../../components/common/Toast";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useDeleteReseller, useResellers, useUnarchiveReseller } from "../../queries/resellers";
import { useSites, useSystems } from "../../queries/systems";

export function ArchivedResellers() {
  const navigate = useNavigate();
  const auth = useAuth();
  const toast = useToast();
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: resellers } = useResellers();
  const { data: companies } = useCompanies();
  const { data: sites } = useSites();
  const { data: systems } = useSystems();
  const unarchiveReseller = useUnarchiveReseller();
  const deleteReseller = useDeleteReseller();
  const [deleting, setDeleting] = useState(null);
  const [restoring, setRestoring] = useState(null);

  usePageHeader("Archived Resellers", [{ label: "Active Resellers", onClick: () => navigate("/resellers") }]);

  const canManage = !!me?.permissions.manage_resellers;
  if (!canManage) {
    return <div className="center-screen" style={{ height: "auto", padding: 40 }}>Only superadmins can manage archived resellers.</div>;
  }

  const archived = (resellers || []).filter((r) => r.status === "archived");
  const busy = unarchiveReseller.isPending || deleteReseller.isPending;

  return (
    <div className="companies-directory archived-directory">
      {archived.length === 0 ? (
        <div className="reseller-customers-empty">No archived resellers.</div>
      ) : (
        <>
          <div className="directory-filter-count">{archived.length} archived reseller{archived.length === 1 ? "" : "s"}</div>
          <div className="card-grid reseller-customers-grid archived-card-grid">
            {archived.map((r) => {
              const resellerCompanies = (companies || []).filter((company) => company.reseller_id === r.id);
              const companyIds = new Set(resellerCompanies.map((company) => company.id));
              const resellerSites = (sites || []).filter((site) => companyIds.has(site.customer_id));
              const resellerSystems = (systems || []).filter((system) => companyIds.has(system.company_id));
              return (
                <div className="reseller-company-card-shell archived-card-shell" key={r.id}>
                  <InfoCard
                    title={r.name}
                    status="archived"
                    subtitle={r.contact_name ? `Contact: ${r.contact_name}` : "No contact recorded"}
                    icon={IconResellers}
                    stats={[
                      { label: "Customers", value: resellerCompanies.length, color: "var(--blue)" },
                      { label: "Sites", value: resellerSites.length, color: "var(--cyan)" },
                      { label: "Systems", value: resellerSystems.length, color: "var(--cyan)" },
                    ]}
                    footer={<>
                      <dl className="archived-card-details">
                        <dt>Email</dt><dd className="mono">{r.contact_email || "—"}</dd>
                        <dt>Phone</dt><dd className="mono">{r.contact_phone || "—"}</dd>
                      </dl>
                      <div className="archived-card-actions">
                        <button type="button" className="header-btn" disabled={busy} onClick={() => setRestoring(r)}>Unarchive</button>
                        <button type="button" className="header-btn danger" disabled={busy} onClick={() => setDeleting(r)}>Delete</button>
                      </div>
                    </>}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete reseller permanently"
          message={`Permanently delete "${deleting.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => { deleteReseller.mutate(deleting.id); setDeleting(null); }}
        />
      )}
      {restoring && <ConfirmDialog title="Unarchive reseller" message={`Restore "${restoring.name}" to Active Resellers?`} confirmLabel="Unarchive" danger={false} onCancel={() => setRestoring(null)} onConfirm={() => { const target = restoring; setRestoring(null); unarchiveReseller.mutate(target.id, { onSuccess: () => toast.success(`Reseller "${target.name}" unarchived successfully.`), onError: (error) => toast.error(error?.response?.data?.detail || `Could not unarchive "${target.name}".`) }); }} />}
    </div>
  );
}
