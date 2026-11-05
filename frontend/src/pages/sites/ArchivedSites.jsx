import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useReseller } from "../../queries/resellers";
import { useDeleteSite, useSites, useUnarchiveSite } from "../../queries/systems";

export function ArchivedSites() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { data: customer } = useCompany(companyId);
  const { data: reseller } = useReseller(customer?.reseller_id);
  const { data: sites } = useSites(companyId);
  const unarchiveSite = useUnarchiveSite();
  const deleteSite = useDeleteSite();
  const [deleting, setDeleting] = useState(null);
  const archivedSites = (sites || []).filter((site) => site.status === "archived");

  usePageHeader("Archived Sites", [
    { label: "Active Resellers", onClick: () => navigate("/resellers") },
    { label: reseller?.name || "", onClick: () => navigate(`/resellers/${customer?.reseller_id}`) },
    { label: customer?.name || "", onClick: () => navigate(`/companies/${companyId}`) },
  ]);

  return <>
    <div className="directory-filter-count">{archivedSites.length} archived site{archivedSites.length === 1 ? "" : "s"}</div>
    {archivedSites.length === 0 ? <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No archived sites.</p> : <table className="data-table">
      <thead><tr><th>Site</th><th>Location</th><th>Status</th><th /></tr></thead>
      <tbody>{archivedSites.map((site) => <tr key={site.id}><td style={{ fontWeight: 600 }}>{site.name}</td><td>{site.address || "—"}</td><td>Archived</td><td><div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}><button className="header-btn" onClick={() => unarchiveSite.mutate(site.id)}>Unarchive</button><button className="header-btn danger" onClick={() => setDeleting(site)}>Delete</button></div></td></tr>)}</tbody>
    </table>}
    {deleting && <ConfirmDialog title="Delete site permanently" message={`Permanently delete "${deleting.name}" and its systems? This cannot be undone.`} confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={() => { deleteSite.mutate(deleting.id); setDeleting(null); }} />}
  </>;
}
