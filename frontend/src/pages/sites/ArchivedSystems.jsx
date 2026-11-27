import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { useToast } from "../../components/common/Toast";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useReseller } from "../../queries/resellers";
import { useDeleteSystem, useSite, useSystems, useUnarchiveSystem } from "../../queries/systems";

export function ArchivedSystems() {
  const { companyId, siteId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: customer } = useCompany(companyId);
  const { data: reseller } = useReseller(customer?.reseller_id);
  const { data: site } = useSite(siteId);
  const { data: systems } = useSystems(companyId, siteId, true);
  const unarchiveSystem = useUnarchiveSystem();
  const deleteSystem = useDeleteSystem();
  const [restoring, setRestoring] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const archivedSystems = (systems || []).filter((system) => system.archived);

  usePageHeader("Archived Systems", [
    { label: "Active Resellers", onClick: () => navigate("/resellers") },
    { label: reseller?.name || "", onClick: () => navigate(`/resellers/${customer?.reseller_id}`) },
    { label: customer?.name || "", onClick: () => navigate(`/companies/${companyId}`) },
    { label: site?.name || "", onClick: () => navigate(`/companies/${companyId}/sites/${siteId}`) },
  ]);

  return <>
    <div className="directory-filter-count">{archivedSystems.length} archived system{archivedSystems.length === 1 ? "" : "s"}</div>
    {archivedSystems.length === 0 ? <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No archived systems at this site.</p> : <table className="data-table">
      <thead><tr><th>System</th><th>Site</th><th>Status</th><th /></tr></thead>
      <tbody>{archivedSystems.map((system) => <tr key={system.id}>
        <td style={{ fontWeight: 600 }}>{system.name}</td><td>{site?.name || system.site_name || "—"}</td><td>Archived</td>
        <td><div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
          <button className="header-btn" disabled={unarchiveSystem.isPending || deleteSystem.isPending} onClick={() => setRestoring(system)}>Unarchive</button>
          <button className="header-btn danger" disabled={unarchiveSystem.isPending || deleteSystem.isPending} onClick={() => setDeleting(system)}>Delete</button>
        </div></td>
      </tr>)}</tbody>
    </table>}
    {restoring && <ConfirmDialog title="Unarchive system" message={`Restore "${restoring.name}" to Active Systems?`} confirmLabel="Unarchive" danger={false} onCancel={() => setRestoring(null)} onConfirm={() => { const target = restoring; setRestoring(null); unarchiveSystem.mutate(target.id, { onSuccess: () => toast.success(`System "${target.name}" unarchived successfully.`), onError: (error) => toast.error(error?.response?.data?.detail || `Could not unarchive "${target.name}".`) }); }} />}
    {deleting && <ConfirmDialog title="Delete system permanently" message={`Permanently delete "${deleting.name}" and all of its data? This cannot be undone.`} confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={() => { const target = deleting; setDeleting(null); deleteSystem.mutate(target.id, { onSuccess: () => toast.success(`System "${target.name}" was deleted permanently.`), onError: (error) => toast.error(error?.response?.data?.detail || `Could not delete "${target.name}".`) }); }} />}
  </>;
}
