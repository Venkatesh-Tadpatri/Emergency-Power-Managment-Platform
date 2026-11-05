import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { IconAlert, IconCheckCircle, IconMap, IconPanel } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { StatsGrid } from "../../components/common/StatCard";
import { StatusPill } from "../../components/common/StatusPill";
import { QueryState } from "../../components/common/QueryState";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { resolveAtsTelemetry, resolveGeneratorTelemetry, ResultTab } from "../../components/systems/SystemOperationsOverview";
import { TestWizard } from "../../components/systems/TestWizard";
import { useTelemetrySnapshot } from "../../hooks/useTelemetry";
import { useAlarms } from "../../queries/alarms";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useAllAts, useAllGenerators, useAllPanels, useArchiveSystem, useCreateSystem, useOneLine, useSite, useSystems, useUpdateSystem } from "../../queries/systems";
import { activeAlarmOnly } from "../../utils/alarmClassification";

function SystemCardMenu({ system, canManage, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open]);

  if (!canManage) return null;

  return (
    <div className="site-system-card-menu" ref={rootRef}>
      <button type="button" className="site-system-card-menu-btn" aria-label={`Options for ${system.name}`} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        ⋮
      </button>
      {open && (
        <div className="site-system-card-menu-panel" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => { setOpen(false); onEdit(); }}>Edit</button>
          <button type="button" className="danger" onClick={() => { setOpen(false); onDelete(); }}>Delete</button>
        </div>
      )}
    </div>
  );
}

export function SiteSystems() {
  const { companyId, siteId } = useParams();
  const navigate = useNavigate();
  const customerQuery = useCompany(companyId);
  const siteQuery = useSite(siteId);
  const systemsQuery = useSystems(companyId, siteId);
  const { data: customer } = customerQuery;
  const { data: site } = siteQuery;
  const { data: systems } = systemsQuery;
  const { data: alarms } = useAlarms({ companyId });
  const { data: panels } = useAllPanels();
  const { data: ats } = useAllAts();
  const { data: generators } = useAllGenerators();
  const { data: me } = useMe(true);
  const telemetry = useTelemetrySnapshot();
  const createSystem = useCreateSystem();
  const updateSystem = useUpdateSystem();
  const archiveSystem = useArchiveSystem();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sldSystemId, setSldSystemId] = useState(null);
  const [testSystemId, setTestSystemId] = useState(null);
  const [editingSystem, setEditingSystem] = useState(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirmSystem, setDeleteConfirmSystem] = useState(null);
  const { data: savedOneLine } = useOneLine(sldSystemId || undefined);

  const siteSystems = systems || [];
  const siteSystemIds = useMemo(() => new Set(siteSystems.map((system) => system.id)), [siteSystems]);
  const activeAlarms = activeAlarmOnly(alarms).filter((alarm) => siteSystemIds.has(alarm.system_id));
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

  usePageHeader(site?.name || "Site");

  function submit(event) {
    event.preventDefault();
    if (!name.trim() || !companyId || !siteId) return;
    createSystem.mutate({ name: name.trim(), company_id: companyId, site_id: siteId, address: site?.address });
    setName("");
    setOpen(false);
  }

  function openEditSystem(system) {
    setEditName(system.name);
    setEditingSystem(system);
  }

  function submitEditSystem(event) {
    event.preventDefault();
    if (!editName.trim() || !editingSystem) return;
    updateSystem.mutate({ id: editingSystem.id, data: { name: editName.trim() } });
    setEditingSystem(null);
  }

  function confirmDeleteSystem() {
    if (!deleteConfirmSystem) return;
    archiveSystem.mutate(deleteConfirmSystem.id);
    setDeleteConfirmSystem(null);
  }

  function assetsFor(systemId) {
    const systemPanels = panelBySystem.get(systemId) || [];
    return {
      panels: systemPanels,
      ats: systemPanels.flatMap((panel) => atsByPanel.get(panel.id) || []),
      generators: systemPanels.flatMap((panel) => generatorsByPanel.get(panel.id) || []),
    };
  }

  function generatorReadiness(item) {
    const data = resolveGeneratorTelemetry(telemetry?.generators, item.id, item.name);
    if (!data || data.communication_healthy === false || data.status === "OFFLINE") return "Offline";
    if (data.fault_active || data.status === "FAULT" || data.low_oil_pressure_alarm || data.high_temperature_alarm || data.overload_alarm) return "Fault";
    if (data.test_mode || data.status === "TEST") return "Test";
    if (data.running || data.status === "RUNNING") return "Running";
    if (data.auto_mode === false) return "Not Auto";
    if (data.low_fuel_alarm || (data.fuel_level_percent != null && data.fuel_level_percent < 25)) return "Low Fuel";
    if (data.low_battery_alarm) return "Low Battery";
    return "Ready";
  }

  function atsReadiness(item) {
    const data = resolveAtsTelemetry(telemetry?.ats, item.id, item.name);
    if (!data || data.communication_healthy === false || data.status === "OFFLINE") return "Offline";
    if (data.fault_active || data.status === "FAULT") return "Fault";
    if (data.transfer_in_progress || data.status === "TRANSFERING") return "Transferring";
    if (data.connected_source === "GENERATOR" || data.status === "EMERGENCY") return "On Emergency";
    if (!data.utility_available) return "Utility Unavailable";
    if (data.connected_source === "OFF") return "Source Off";
    return data.connected_source === "UTILITY" && data.status === "NORMAL" ? "Normal" : data.status || "Offline";
  }

  function readinessSummary(states, healthyLabel) {
    if (!states.length) return `0 / 0 ${healthyLabel}`;
    const healthy = states.filter((state) => state === healthyLabel).length;
    if (healthy === states.length) return `${healthy} / ${states.length} ${healthyLabel}`;
    const counts = states.reduce((result, state) => ({ ...result, [state]: (result[state] || 0) + 1 }), {});
    return Object.entries(counts).map(([state, count]) => `${count} ${state}`).join(" · ");
  }

  function statsFor(system, assets) {
    const generatorStates = assets.generators.map(generatorReadiness);
    const atsStates = assets.ats.map(atsReadiness);
    const generatorsReady = generatorStates.filter((state) => state === "Ready").length;
    const atsNormal = atsStates.filter((state) => state === "Normal").length;
    const utilityAvailable = assets.ats.length
      ? assets.ats.every((item) => {
          const data = resolveAtsTelemetry(telemetry?.ats, item.id, item.name);
          return data?.communication_healthy !== false && data?.utility_available === true;
        })
      : system.status !== "offline";
    const onEmergency = assets.ats.some((item) => resolveAtsTelemetry(telemetry?.ats, item.id, item.name)?.connected_source === "GENERATOR");
    // Source availability is part of operational health. Never show Online when
    // utility is unavailable; generator operation takes precedence as Emergency.
    const effectiveStatus = onEmergency ? "emergency" : !utilityAvailable ? "offline" : system.status;
    return {
      generatorsReady,
      atsNormal,
      generatorStates,
      atsStates,
      generatorSummary: readinessSummary(generatorStates, "Ready"),
      atsSummary: readinessSummary(atsStates, "Normal"),
      utilityAvailable,
      effectiveStatus,
    };
  }

  const systemCards = useMemo(
    () => siteSystems.map((system) => { const assets = assetsFor(system.id); return { system, assets, stats: statsFor(system, assets) }; }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siteSystems, panelBySystem, atsByPanel, generatorsByPanel, telemetry]
  );
  const normal = systemCards.filter((card) => ["normal", "online"].includes(card.stats.effectiveStatus)).length;
  const attentionSystems = systemCards.filter((card) => !["normal", "online"].includes(card.stats.effectiveStatus));
  const emergencyPowerSystems = systemCards.filter((card) => card.stats.effectiveStatus === "emergency");
  const utilityUnavailableSystems = systemCards.filter((card) => !card.stats.utilityAvailable && card.stats.effectiveStatus !== "emergency");
  const allNormal = siteSystems.length > 0 && !attentionSystems.length && !activeAlarms.length;
  const activeTests = systemCards.flatMap(({ system, assets }) =>
    assets.generators
      .map((generator) => ({ system, generator, data: resolveGeneratorTelemetry(telemetry?.generators, generator.id, generator.name) }))
      .filter(({ data }) => data?.test_mode || data?.status === "TEST")
  );
  const atsCount = siteSystems.reduce((total, system) => total + (panelBySystem.get(system.id) || []).reduce((count, panel) => count + (atsByPanel.get(panel.id) || []).length, 0), 0);
  const generatorCount = siteSystems.reduce((total, system) => total + (panelBySystem.get(system.id) || []).reduce((count, panel) => count + (generatorsByPanel.get(panel.id) || []).length, 0), 0);

  const sldSystem = sldSystemId ? siteSystems.find((system) => system.id === sldSystemId) : null;
  const sldAssets = sldSystemId ? assetsFor(sldSystemId) : null;
  const savedOneLineData = savedOneLine?.data || {};
  const savedPieceDownstream = Object.fromEntries(
    Object.entries(savedOneLineData.pieceDownstream || {}).map(([name, value]) => [name, Array.isArray(value) ? value : [value]])
  );
  const testSystem = testSystemId ? siteSystems.find((system) => system.id === testSystemId) : null;
  const testAssets = testSystemId ? assetsFor(testSystemId) : null;

  if (customerQuery.isPending || siteQuery.isPending || systemsQuery.isPending) return <QueryState loading title="Loading site systems…" />;
  if (customerQuery.isError || siteQuery.isError || systemsQuery.isError) return <QueryState title="Site systems unavailable" message="We couldn't retrieve the systems for this site." onRetry={() => { void customerQuery.refetch(); void siteQuery.refetch(); void systemsQuery.refetch(); }} />;

  return <>
    <div className="reseller-page-heading">
      <div className="reseller-page-heading-icon" style={{ color: activeAlarms.length ? "#dc2626" : "#0ea5e9", background: activeAlarms.length ? "rgba(220,38,38,.14)" : "rgba(14,165,233,.14)" }}><IconMap size={19} /></div>
      <div className="reseller-page-heading-copy">
        <h2>{site?.name || "Site"}</h2>
      </div>
    </div>
    <StatsGrid stats={[
      { label: "Systems", value: siteSystems.length, color: "var(--cyan)", icon: IconPanel },
      { label: "Online", value: normal, color: "var(--green)", icon: IconCheckCircle },
      { label: "ATS", value: atsCount, color: "var(--purple)", icon: IconPanel },
      { label: "Generators", value: generatorCount, color: "var(--amber)", icon: IconPanel },
      { label: "Active alarms", value: activeAlarms.length, color: activeAlarms.length ? "var(--red)" : "var(--green)", icon: IconAlert },
    ]} />
    {siteSystems.length > 0 && (
      <div className={`site-status-banner ${allNormal ? "normal" : "emergency"}`}>
        {allNormal ? (
          <>
            <h2>All Systems Online</h2>
            <p>No active alarms. No emergency operations.</p>
          </>
        ) : (
          <>
            <h2>{emergencyPowerSystems.length
              ? `${emergencyPowerSystems.length} System${emergencyPowerSystems.length > 1 ? "s" : ""} On Emergency Power`
              : utilityUnavailableSystems.length
                ? `${utilityUnavailableSystems.length} System${utilityUnavailableSystems.length > 1 ? "s" : ""} With Utility Unavailable`
                : attentionSystems.length
                  ? `${attentionSystems.length} System${attentionSystems.length > 1 ? "s" : ""} Need Attention`
                  : "Active Alarms"}</h2>
            <p>
              {emergencyPowerSystems.length ? `${emergencyPowerSystems.map((card) => card.system.name).join(", ")} running on emergency power. ` : ""}
              {utilityUnavailableSystems.length ? `${utilityUnavailableSystems.map((card) => card.system.name).join(", ")} ${utilityUnavailableSystems.length > 1 ? "have" : "has"} no available utility source. ` : ""}
              {attentionSystems.filter((card) => !emergencyPowerSystems.includes(card) && !utilityUnavailableSystems.includes(card)).length ? `${attentionSystems.filter((card) => !emergencyPowerSystems.includes(card) && !utilityUnavailableSystems.includes(card)).map((card) => card.system.name).join(", ")} reporting a non-normal state. ` : ""}
              {activeAlarms.length ? `${activeAlarms.length} active alarm${activeAlarms.length > 1 ? "s" : ""}.` : "No active alarms."}
            </p>
          </>
        )}
      </div>
    )}
    <div className="section-header"><div><div className="section-title">Systems</div><div className="section-sub">{siteSystems.length} systems at {site?.name}</div></div>{canManage && <button className="header-btn primary" onClick={() => setOpen(true)}>+ New System</button>}</div>
    <div className="readiness-definition"><b>Generator Ready</b>: communicating, Auto, stopped, not testing, no fault/shutdown, fuel and battery OK. <b>ATS Normal</b>: communicating, utility available, connected to utility, no fault or transfer in progress.</div>
    <div className="site-systems-grid">{systemCards.map(({ system, assets, stats }) => {
      return (
        <div className={`site-system-card status-${stats.effectiveStatus}`} key={system.id}>
          <div className="site-system-card-head">
            <h3>{system.name}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StatusPill status={stats.effectiveStatus} />
              <SystemCardMenu system={system} canManage={canManage} onEdit={() => openEditSystem(system)} onDelete={() => setDeleteConfirmSystem(system)} />
            </div>
          </div>
          <div className="site-system-stats">
            <div className="site-system-stat"><span>Utility</span><b className={stats.utilityAvailable ? "stat-good" : "stat-bad"}>{stats.utilityAvailable ? "Available" : "Unavailable"}</b></div>
            <div className="site-system-stat" title="Ready = communicating, in Auto, stopped, not testing, no shutdown/fault, and no low fuel or battery condition."><span>Generators</span><b className={stats.generatorsReady === assets.generators.length ? "stat-good" : "stat-bad"}>{stats.generatorSummary}</b></div>
            <div className="site-system-stat" title="Normal = communicating, utility available, connected to utility, no fault, and no transfer in progress."><span>ATS</span><b className={stats.atsNormal === assets.ats.length ? "stat-good" : "stat-bad"}>{stats.atsSummary}</b></div>
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
    <div className="section-header site-alarms-heading"><div><div className="section-title">Active Tests</div><div className="section-sub">{activeTests.length} active {activeTests.length === 1 ? "test" : "tests"} at this site</div></div></div>
    {activeTests.length ? (
      <div className="site-alarms-table-wrap">
        <table className="data-table site-alarms-table">
          <thead><tr><th>System</th><th>Generator</th><th>Status</th></tr></thead>
          <tbody>{activeTests.map(({ system, generator, data }) => (
            <tr key={generator.id}><td>{system.name}</td><td>{generator.name}</td><td><StatusPill status="test" label={data?.status === "TEST" ? "Test Mode" : "Testing"} /></td></tr>
          ))}</tbody>
        </table>
      </div>
    ) : <div className="site-alarms-empty">No active tests in progress.</div>}
    {open && <Modal title="New System" onClose={() => setOpen(false)}><form onSubmit={submit}><div className="form-row"><label>System Name *</label><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Main Emergency Power System" autoFocus /></div><div className="modal-actions"><button type="button" className="header-btn" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="header-btn primary">Save</button></div></form></Modal>}
    {editingSystem && <Modal title="Edit System" onClose={() => setEditingSystem(null)}><form onSubmit={submitEditSystem}><div className="form-row"><label>System Name *</label><input required minLength={2} maxLength={120} value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus /></div><div className="modal-actions"><button type="button" className="header-btn" onClick={() => setEditingSystem(null)}>Cancel</button><button type="submit" className="header-btn primary">Save</button></div></form></Modal>}
    {deleteConfirmSystem && (
      <Modal title="Delete System" onClose={() => setDeleteConfirmSystem(null)}>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--text-dim)" }}>
          Delete <b style={{ color: "var(--text)" }}>{deleteConfirmSystem.name}</b>? This marks the system offline and removes it from active monitoring.
        </p>
        <div className="modal-actions">
          <button type="button" className="header-btn" onClick={() => setDeleteConfirmSystem(null)}>Cancel</button>
          <button type="button" className="header-btn danger" onClick={confirmDeleteSystem}>Delete</button>
        </div>
      </Modal>
    )}
    {sldSystem && sldAssets && (
      <Modal title="" onClose={() => setSldSystemId(null)} className="modal-sld-only modal-generated-one-line">
        <button type="button" className="equipment-popup-close" aria-label="Close single line diagram" onClick={() => setSldSystemId(null)}>x</button>
        {savedOneLine === undefined ? (
          <div className="operations-empty">Loading generated one-line...</div>
        ) : (
          <ResultTab
            systemName={sldSystem.name}
            customerLogo={customer?.logo_data}
            customerName={customer?.name}
            ats={sldAssets.ats}
            generators={sldAssets.generators}
            atsTelemetry={telemetry?.ats}
            generatorTelemetry={telemetry?.generators}
            pieces={savedOneLineData.pieces || []}
            sourceLinks={savedOneLineData.sourceLinks || {}}
            atsDownstream={savedOneLineData.atsDownstream || {}}
            pieceDownstream={savedPieceDownstream}
            generated={Boolean(savedOneLineData.generated)}
          />
        )}
      </Modal>
    )}
    {testSystem && testAssets && (
      <TestWizard systemName={testSystem.name} ats={testAssets.ats} generators={testAssets.generators} onClose={() => setTestSystemId(null)} />
    )}
  </>;
}
