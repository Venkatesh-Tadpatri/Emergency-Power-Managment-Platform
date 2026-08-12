import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { IconAlert, IconCheckCircle, IconMap, IconPanel } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { PageHero } from "../../components/common/PageHero";
import { StatsGrid } from "../../components/common/StatCard";
import { StatusPill } from "../../components/common/StatusPill";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useCreateSystem, useSite, useSystems } from "../../queries/systems";

export function SiteSystems() {
  const { companyId, siteId } = useParams();
  const navigate = useNavigate();
  const { data: customer } = useCompany(companyId);
  const { data: site } = useSite(siteId);
  const { data: systems } = useSystems(companyId, siteId);
  const { data: me } = useMe(true);
  const createSystem = useCreateSystem();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const normal = (systems || []).filter((system) => system.status === "normal").length;
  const canManage = me?.role === "superadmin";
  usePageHeader(site?.name || "Site", [{ label: customer?.name || "Customer", onClick: () => navigate(`/companies/${companyId}`) }]);
  function submit(event) { event.preventDefault(); if (!name.trim() || !companyId || !siteId) return; createSystem.mutate({ name: name.trim(), company_id: companyId, site_id: siteId, address: site?.address }); setName(""); setOpen(false); }
  return <>
    <PageHero title={site?.name || "Site"} subtitle={`${customer?.name || "Customer"}${site?.address ? ` · ${site.address}` : ""}`} icon={IconMap} color="#0ea5e9" bgImage="/images/hero-bg.jpg" />
    <StatsGrid stats={[{ label: "Systems", value: systems?.length ?? 0, color: "var(--cyan)", icon: IconPanel }, { label: "Normal", value: normal, color: "var(--green)", icon: IconCheckCircle }, { label: "Events", value: (systems?.length ?? 0) - normal, color: "var(--red)", icon: IconAlert }]} />
    <div className="section-header"><div><div className="section-title">Systems</div><div className="section-sub">Systems at {site?.name}</div></div>{canManage && <button className="header-btn primary" onClick={() => setOpen(true)}>+ New System</button>}</div>
    <table className="data-table"><thead><tr><th>System</th><th>Status</th><th /></tr></thead><tbody>{(systems || []).map((system) => <tr key={system.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/systems/${system.id}`)}><td style={{ fontWeight: 600 }}>{system.name}</td><td><StatusPill status={system.status} /></td><td style={{ color: "var(--blue)" }}>View →</td></tr>)}</tbody></table>
    {open && <Modal title="New System" onClose={() => setOpen(false)}><form onSubmit={submit}><div className="form-row"><label>System Name *</label><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Main Emergency Power System" autoFocus /></div><div className="modal-actions"><button type="button" className="header-btn" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="header-btn primary">Save</button></div></form></Modal>}
  </>;
}
