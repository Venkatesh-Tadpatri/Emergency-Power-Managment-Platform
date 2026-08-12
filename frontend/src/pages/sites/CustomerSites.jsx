import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { IconAlert, IconBuilding, IconCheckCircle, IconMap, IconPanel } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { PageHero } from "../../components/common/PageHero";
import { StatsGrid } from "../../components/common/StatCard";
import { StatusPill } from "../../components/common/StatusPill";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useArchiveSite, useCreateSite, useSites, useSystems, useUpdateSite } from "../../queries/systems";

export function CustomerSites() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { data: customer } = useCompany(companyId);
  const { data: sites } = useSites(companyId);
  const { data: systems } = useSystems(companyId);
  const { data: me } = useMe(true);
  const createSite = useCreateSite();
  const updateSite = useUpdateSite();
  const archiveSite = useArchiveSite();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", address: "" });
  const canManage = me?.role === "superadmin";
  const activeSites = (sites || []).filter((site) => site.status !== "archived");
  const normal = (systems || []).filter((system) => system.status === "normal").length;

  usePageHeader(customer?.name || "Customer", [{ label: "Resellers", onClick: () => navigate("/resellers") }]);

  function openNew() { setForm({ name: "", address: "" }); setEditing("new"); }
  function openEdit(site, event) { event.stopPropagation(); setForm({ name: site.name, address: site.address || "" }); setEditing(site); }
  function submit(event) {
    event.preventDefault();
    if (!form.name.trim() || !companyId) return;
    const data = { name: form.name.trim(), address: form.address.trim() || undefined };
    if (editing === "new") createSite.mutate({ ...data, customer_id: companyId });
    else updateSite.mutate({ id: editing.id, data });
    setEditing(null);
  }

  return <>
    <PageHero title={customer?.name || "Customer"} subtitle={customer?.address} icon={IconBuilding} color="#2563eb" bgImage="/images/hero-bg.jpg" />
    <StatsGrid stats={[
      { label: "Sites", value: activeSites.length, color: "var(--blue)", icon: IconMap },
      { label: "Total Systems", value: systems?.length ?? 0, color: "var(--cyan)", icon: IconPanel },
      { label: "Normal", value: normal, color: "var(--green)", icon: IconCheckCircle },
      { label: "Events", value: (systems?.length ?? 0) - normal, color: "var(--red)", icon: IconAlert },
    ]} />
    <div className="section-header"><div><div className="section-title">Sites</div><div className="section-sub">Select a site to view its systems</div></div>{canManage && <button className="header-btn primary" onClick={openNew}>+ New Site</button>}</div>
    <table className="data-table">
      <thead><tr><th>Site</th><th>Location</th><th>Systems</th><th>Normal</th><th>Events</th><th>Status</th><th /></tr></thead>
      <tbody>{activeSites.map((site) => {
        const siteSystems = (systems || []).filter((system) => system.site_id === site.id);
        const siteNormal = siteSystems.filter((system) => system.status === "normal").length;
        return <tr key={site.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/companies/${companyId}/sites/${site.id}`)}>
          <td style={{ fontWeight: 600 }}><span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 8, color: "var(--blue)" }}><IconMap size={16} /></span>{site.name}</td>
          <td>{site.address || "—"}</td><td>{siteSystems.length}</td><td style={{ color: "var(--green)", fontWeight: 600 }}>{siteNormal}</td><td style={{ color: siteSystems.length - siteNormal ? "var(--red)" : "var(--text-dim)", fontWeight: 600 }}>{siteSystems.length - siteNormal}</td><td><StatusPill status={site.status} /></td>
          <td onClick={(event) => event.stopPropagation()}>{canManage && <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><button className="header-btn" onClick={(event) => openEdit(site, event)}>Edit</button><button className="header-btn" onClick={() => archiveSite.mutate(site.id)}>Archive</button></span>}</td>
        </tr>;
      })}</tbody>
    </table>
    {editing && <Modal title={editing === "new" ? "New Site" : "Edit Site"} onClose={() => setEditing(null)}><form onSubmit={submit}><div className="form-row"><label>Site Name *</label><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Ameerpet Hospital" autoFocus /></div><div className="form-row"><label>Address / Area</label><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="e.g. Ameerpet, Hyderabad" /></div><div className="modal-actions"><button type="button" className="header-btn" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="header-btn primary">Save</button></div></form></Modal>}
  </>;
}
