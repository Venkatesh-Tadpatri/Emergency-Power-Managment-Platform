import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { IconAlert, IconCheckCircle, IconMap, IconPanel } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { PageHero } from "../../components/common/PageHero";
import { StatsGrid } from "../../components/common/StatCard";
import { StatusPill } from "../../components/common/StatusPill";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { resolveAtsTelemetry, resolveGeneratorTelemetry, SingleLineDiagram } from "../../components/systems/SystemOperationsOverview";
import { TestWizard } from "../../components/systems/TestWizard";
import { useTelemetrySnapshot } from "../../hooks/useTelemetry";
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
  const telemetry = useTelemetrySnapshot();
  const createSystem = useCreateSystem();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sldSystemId, setSldSystemId] = useState(null);
  const [testSystemId, setTestSystemId] = useState(null);

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
  const canManage = me?.role === "superadmin";

  usePageHeader(site?.name || "Site", [{ label: customer?.name || "Customer", onClick: () => navigate(`/companies/${companyId}`) }]);

  function submit(event) {
    event.preventDefault();
    if (!name.trim() || !companyId || !siteId) return;
    createSystem.mutate({ name: name.trim(), company_id: companyId, site_id: siteId, address: site?.address });
    setName("");
    setOpen(false);
  }

  function assetsFor(systemId) {
    const systemPanels = panelBySystem.get(systemId) || [];
    return {
      panels: systemPanels,
      ats: systemPanels.flatMap((panel) => atsByPanel.get(panel.id) || []),
      generators: systemPanels.flatMap((panel) => generatorsByPanel.get(panel.id) || []),
    };
  }

  function statsFor(system, assets) {
    const generatorsReady = assets.generators.filter((item) => resolveGeneratorTelemetry(telemetry?.generators, item.id, item.name)?.status !== "FAULT").length;
    const atsNormal = assets.ats.filter((item) => {
      const status = resolveAtsTelemetry(telemetry?.ats, item.id, item.name)?.status || "NORMAL";
      return status !== "EMERGENCY" && status !== "FAULT";
    }).length;
    const utilityAvailable = assets.ats.length
      ? assets.ats.some((item) => resolveAtsTelemetry(telemetry?.ats, item.id, item.name)?.utility_available)
      : system.status !== "offline";
    const onEmergency = assets.ats.some((item) => resolveAtsTelemetry(telemetry?.ats, item.id, item.name)?.connected_source === "GENERATOR");
    // The system's stored status doesn't live-track ATS transfers, so surface emergency here as soon as any ATS is on generator power.
    const effectiveStatus = onEmergency ? "emergency" : system.status;
    return { generatorsReady, atsNormal, utilityAvailable, effectiveStatus };
  }

  const systemCards = useMemo(
    () => siteSystems.map((system) => { const assets = assetsFor(system.id); return { system, assets, stats: statsFor(system, assets) }; }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siteSystems, panelBySystem, atsByPanel, generatorsByPanel, telemetry]
  );
  const normal = systemCards.filter((card) => card.stats.effectiveStatus === "normal").length;
  const atsCount = siteSystems.reduce((total, system) => total + (panelBySystem.get(system.id) || []).reduce((count, panel) => count + (atsByPanel.get(panel.id) || []).length, 0), 0);
  const generatorCount = siteSystems.reduce((total, system) => total + (panelBySystem.get(system.id) || []).reduce((count, panel) => count + (generatorsByPanel.get(panel.id) || []).length, 0), 0);

  const sldSystem = sldSystemId ? siteSystems.find((system) => system.id === sldSystemId) : null;
  const sldAssets = sldSystemId ? assetsFor(sldSystemId) : null;
  const testSystem = testSystemId ? siteSystems.find((system) => system.id === testSystemId) : null;
  const testAssets = testSystemId ? assetsFor(testSystemId) : null;

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
    <div className="site-systems-grid">{systemCards.map(({ system, assets, stats }) => {
      return (
        <div className={`site-system-card status-${stats.effectiveStatus}`} key={system.id}>
          <div className="site-system-card-head">
            <h3>{system.name}</h3>
            <StatusPill status={stats.effectiveStatus} />
          </div>
          <div className="site-system-stats">
            <div className="site-system-stat"><span>Utility</span><b className={stats.utilityAvailable ? "stat-good" : "stat-bad"}>{stats.utilityAvailable ? "Available" : "Unavailable"}</b></div>
            <div className="site-system-stat"><span>Generators</span><b>{stats.generatorsReady} / {assets.generators.length} Ready</b></div>
            <div className="site-system-stat"><span>ATS</span><b>{stats.atsNormal} / {assets.ats.length} Normal</b></div>
          </div>
          <div className="site-system-card-actions">
            <button type="button" onClick={() => navigate(`/systems/${system.id}`)}>Detail</button>
            <button type="button" onClick={() => setSldSystemId(system.id)}>One-Line</button>
            <button type="button" onClick={() => setTestSystemId(system.id)}>Test</button>
          </div>
        </div>
      );
    })}</div>
    {!siteSystems.length && <div className="operations-empty">No systems registered at this site yet.</div>}
    <div className="section-header site-alarms-heading"><div><div className="section-title">Active Alarms</div><div className="section-sub">{activeAlarms.length} active {activeAlarms.length === 1 ? "alarm" : "alarms"} at this site</div></div></div>
    {activeAlarms.length ? <div className="site-alarms-table-wrap"><table className="data-table site-alarms-table"><thead><tr><th>Date</th><th>Time</th><th>System</th><th>Device</th><th>Alarm</th><th>Severity</th><th>Acknowledged</th></tr></thead><tbody>{activeAlarms.map((alarm) => { const system = siteSystems.find((item) => item.id === alarm.system_id); const occurred = new Date(alarm.occurred_at); return <tr key={alarm.id}><td className="mono">{occurred.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</td><td className="mono">{occurred.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td><td>{system?.name || "—"}</td><td>{alarm.device_label || "—"}</td><td>{alarm.message}</td><td><StatusPill status={alarm.severity} /></td><td>{alarm.ack_by ? <span className="ack-badge acked">Acked</span> : <span className="ack-badge unacked">Unacked</span>}</td></tr>; })}</tbody></table></div> : <div className="site-alarms-empty">No active alarms at this site.</div>}
    {open && <Modal title="New System" onClose={() => setOpen(false)}><form onSubmit={submit}><div className="form-row"><label>System Name *</label><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Main Emergency Power System" autoFocus /></div><div className="modal-actions"><button type="button" className="header-btn" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="header-btn primary">Save</button></div></form></Modal>}
    {sldSystem && sldAssets && (
      <Modal title="" onClose={() => setSldSystemId(null)} className="modal-sld-only">
        <button type="button" className="equipment-popup-close" aria-label="Close single line diagram" onClick={() => setSldSystemId(null)}>x</button>
        <SingleLineDiagram
          ats={sldAssets.ats}
          generators={sldAssets.generators}
          atsTelemetry={telemetry?.ats}
          generatorTelemetry={telemetry?.generators}
          onAtsClick={() => {}}
          onGeneratorClick={() => {}}
        />
      </Modal>
    )}
    {testSystem && testAssets && (
      <TestWizard systemName={testSystem.name} ats={testAssets.ats} generators={testAssets.generators} onClose={() => setTestSystemId(null)} />
    )}
  </>;
}
