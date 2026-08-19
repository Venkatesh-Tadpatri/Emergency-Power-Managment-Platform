import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { IconAlert, IconCheckCircle, IconMap, IconPanel } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { PageHero } from "../../components/common/PageHero";
import { StatsGrid } from "../../components/common/StatCard";
import { StatusPill } from "../../components/common/StatusPill";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAlarms } from "../../queries/alarms";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useAllAts, useAllGenerators, useAllPanels, useCreateSystem, useSite, useSystems } from "../../queries/systems";

export function SiteSystems() {
  const { companyId, siteId } = useParams();
  const navigate = useNavigate();
  const { data: customer } = useCompany(companyId);
  const { data: site } = useSite(siteId);
  const { data: systems } = useSystems(companyId, siteId);
  const { data: alarms } = useAlarms({ companyId });
  const { data: panels } = useAllPanels();
  const { data: ats } = useAllAts();
  const { data: generators } = useAllGenerators();
  const { data: me } = useMe(true);
  const createSystem = useCreateSystem();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [expandedSystemIds, setExpandedSystemIds] = useState([]);

  const siteSystems = systems || [];
  const siteSystemIds = useMemo(() => new Set(siteSystems.map((system) => system.id)), [siteSystems]);
  const activeAlarms = (alarms || []).filter((alarm) => alarm.status === "active" && siteSystemIds.has(alarm.system_id));
  const panelBySystem = useMemo(() => {
    const map = new Map();
    (panels || []).forEach((panel) => {
      if (siteSystemIds.has(panel.system_id)) map.set(panel.system_id, [...(map.get(panel.system_id) || []), panel]);
    });
    return map;
  }, [panels, siteSystemIds]);
  const atsByPanel = useMemo(() => {
    const map = new Map();
    (ats || []).forEach((item) => map.set(item.panel_id, [...(map.get(item.panel_id) || []), item]));
    return map;
  }, [ats]);
  const generatorsByPanel = useMemo(() => {
    const map = new Map();
    (generators || []).forEach((item) => map.set(item.panel_id, [...(map.get(item.panel_id) || []), item]));
    return map;
  }, [generators]);
  const normal = siteSystems.filter((system) => system.status === "normal").length;
  const atsCount = siteSystems.reduce((total, system) => total + (panelBySystem.get(system.id) || []).reduce((count, panel) => count + (atsByPanel.get(panel.id) || []).length, 0), 0);
  const generatorCount = siteSystems.reduce((total, system) => total + (panelBySystem.get(system.id) || []).reduce((count, panel) => count + (generatorsByPanel.get(panel.id) || []).length, 0), 0);
  const canManage = me?.role === "superadmin";

  usePageHeader(site?.name || "Site", [{ label: customer?.name || "Customer", onClick: () => navigate(`/companies/${companyId}`) }]);

  function submit(event) {
    event.preventDefault();
    if (!name.trim() || !companyId || !siteId) return;
    createSystem.mutate({ name: name.trim(), company_id: companyId, site_id: siteId, address: site?.address });
    setName("");
    setOpen(false);
  }

  function toggleExpanded(systemId) {
    setExpandedSystemIds((current) => current.includes(systemId) ? current.filter((id) => id !== systemId) : [...current, systemId]);
  }

  function assetsFor(systemId) {
    const systemPanels = panelBySystem.get(systemId) || [];
    return {
      panels: systemPanels,
      ats: systemPanels.flatMap((panel) => atsByPanel.get(panel.id) || []),
      generators: systemPanels.flatMap((panel) => generatorsByPanel.get(panel.id) || []),
    };
  }

  function lastEventFor(systemId) {
    const latest = (alarms || []).filter((alarm) => alarm.system_id === systemId).sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))[0];
    return latest ? new Date(latest.occurred_at).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "—";
  }

  return <>
    <PageHero title={site?.name || "Site"} subtitle={`${customer?.name || "Customer"}${site?.address ? ` · ${site.address}` : ""}`} icon={IconMap} color={activeAlarms.length ? "#dc2626" : "#0ea5e9"} bgImage="/images/hero-bg.jpg" />
    <StatsGrid stats={[
      { label: "Systems", value: siteSystems.length, color: "var(--cyan)", icon: IconPanel },
      { label: "Normal", value: normal, color: "var(--green)", icon: IconCheckCircle },
      { label: "ATS", value: atsCount, color: "var(--purple)", icon: IconPanel },
      { label: "Generators", value: generatorCount, color: "var(--amber)", icon: IconPanel },
      { label: "Active alarms", value: activeAlarms.length, color: activeAlarms.length ? "var(--red)" : "var(--green)", icon: IconAlert },
    ]} />
    <div className="section-header"><div><div className="section-title">Systems</div><div className="section-sub">{siteSystems.length} systems at {site?.name}</div></div>{canManage && <button className="header-btn primary" onClick={() => setOpen(true)}>+ New System</button>}</div>
    <div className="site-systems-table-wrap"><table className="data-table site-systems-table"><thead><tr><th>Sl.</th><th>System</th><th>Status</th><th>ATS</th><th>Generators</th><th>Last event</th><th /></tr></thead><tbody>{siteSystems.map((system, index) => {
      const assets = assetsFor(system.id);
      const expanded = expandedSystemIds.includes(system.id);
      return <>
        <tr key={system.id}><td className="mono">{String(index + 1).padStart(2, "0")}</td><td style={{ fontWeight: 700 }}>{system.name}</td><td><StatusPill status={system.status} /></td><td className="mono">{assets.ats.length}</td><td className="mono">{assets.generators.length}</td><td className="mono">{lastEventFor(system.id)}</td><td className="site-system-actions"><button className="system-expand-btn" aria-label={`${expanded ? "Collapse" : "Expand"} ${system.name} assets`} onClick={() => toggleExpanded(system.id)}>{expanded ? "−" : "+"}</button><button className="table-view-btn" onClick={() => navigate(`/systems/${system.id}`)}>View <span>→</span></button></td></tr>
        {expanded && <tr key={`${system.id}-assets`} className="system-assets-row"><td colSpan={7}><div className="system-assets-panel"><div className="system-assets-heading"><strong>{system.name} assets</strong><span>{assets.panels.length} panels · {assets.ats.length} ATS · {assets.generators.length} generators</span></div><div className="system-assets-grid"><AssetGroup title="Panels" items={assets.panels} empty="No panels configured" /><AssetGroup title="ATS" items={assets.ats} empty="No ATS configured" /><AssetGroup title="Generators" items={assets.generators} empty="No generators configured" /></div></div></td></tr>}
      </>;
    })}</tbody></table></div>
    <div className="section-header site-alarms-heading"><div><div className="section-title">Active Alarms</div><div className="section-sub">{activeAlarms.length} active {activeAlarms.length === 1 ? "alarm" : "alarms"} at this site</div></div></div>
    {activeAlarms.length ? <div className="site-alarms-table-wrap"><table className="data-table site-alarms-table"><thead><tr><th>Date</th><th>Time</th><th>System</th><th>Device</th><th>Alarm</th><th>Severity</th><th>Acknowledged</th></tr></thead><tbody>{activeAlarms.map((alarm) => { const system = siteSystems.find((item) => item.id === alarm.system_id); const occurred = new Date(alarm.occurred_at); return <tr key={alarm.id}><td className="mono">{occurred.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</td><td className="mono">{occurred.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td><td>{system?.name || "—"}</td><td>{alarm.device_label || "—"}</td><td>{alarm.message}</td><td><StatusPill status={alarm.severity} /></td><td>{alarm.ack_by ? <span className="ack-badge acked">Acked</span> : <span className="ack-badge unacked">Unacked</span>}</td></tr>; })}</tbody></table></div> : <div className="site-alarms-empty">No active alarms at this site.</div>}
    {open && <Modal title="New System" onClose={() => setOpen(false)}><form onSubmit={submit}><div className="form-row"><label>System Name *</label><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Main Emergency Power System" autoFocus /></div><div className="modal-actions"><button type="button" className="header-btn" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="header-btn primary">Save</button></div></form></Modal>}
  </>;
}

function AssetGroup({ title, items, empty, systemStatus }) {
  const displayStatus = systemStatus === "emergency" || systemStatus === "alarm" ? "Emergency" : systemStatus === "test" ? "Test mode" : systemStatus === "offline" ? "Offline" : "Normal";
  const statusClass = displayStatus.toLowerCase().replace(" ", "-");
  return <div className="system-asset-group"><div className="system-asset-group-title">{title}<span>{items.length}</span></div>{items.length ? <ul className="system-asset-list">{items.map((item) => {
    const isAts = title === "ATS";
    const details = isAts ? [item.manufacturer, item.model].filter(Boolean).join(" · ") || "Transfer switch" : title === "Generators" ? [item.make, item.model].filter(Boolean).join(" · ") || "Generator set" : item.connection_status || "Connected";
    const rating = isAts ? [item.rated_amps && `${item.rated_amps} A`, item.rated_volts && `${item.rated_volts} V`].filter(Boolean).join(" · ") : title === "Generators" ? item.rated_kw ? `${item.rated_kw} kW` : "Rating pending" : "";
    return <li className="system-asset-card" key={item.id}><div><b>{item.name}</b><small>{details}</small></div>{isAts || title === "Generators" ? <div className="system-asset-state"><span className={`asset-status ${statusClass}`}>{displayStatus}</span><small>{rating}</small></div> : null}</li>;
  })}</ul> : <p>{empty}</p>}</div>;
}
