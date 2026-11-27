import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { IconMap } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { StatusPill } from "../../components/common/StatusPill";
import { QueryState } from "../../components/common/QueryState";
import { useToast } from "../../components/common/Toast";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { resolveAtsTelemetry, resolveGeneratorTelemetry, ResultTab, shareAtsLoadSide } from "../../components/systems/SystemOperationsOverview";
import { useTelemetrySnapshots } from "../../hooks/useTelemetry";
import { useAlarms } from "../../queries/alarms";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useMeters } from "../../queries/meters";
import { useMonitoredAssets } from "../../queries/monitoredAssets";
import { useReseller } from "../../queries/resellers";
import { useAllAts, useAllGenerators, useAllPanels, useArchiveSystem, useCreateSystem, useOneLine, useSite, useSystems, useUpdateSystem } from "../../queries/systems";
import { activeAlarmOnly } from "../../utils/alarmClassification";

function SystemCardMenu({ system, canManage, onEdit, onArchive }) {
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
          <button type="button" className="danger" onClick={() => { setOpen(false); onArchive(); }}>Archive</button>
        </div>
      )}
    </div>
  );
}

export function SiteSystems() {
  const { companyId, siteId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const customerQuery = useCompany(companyId);
  const siteQuery = useSite(siteId);
  const systemsQuery = useSystems(companyId, siteId);
  const { data: customer } = customerQuery;
  const { data: reseller } = useReseller(customer?.reseller_id);
  const { data: site } = siteQuery;
  const { data: systems } = systemsQuery;
  const { data: alarms } = useAlarms({ companyId });
  const { data: panels } = useAllPanels();
  const { data: ats } = useAllAts();
  const { data: generators } = useAllGenerators();
  const { data: me } = useMe(true);
  const createSystem = useCreateSystem();
  const updateSystem = useUpdateSystem();
  const archiveSystem = useArchiveSystem();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [systemSaveError, setSystemSaveError] = useState("");
  const [sldSystemId, setSldSystemId] = useState(null);
  const [editingSystem, setEditingSystem] = useState(null);
  const [editName, setEditName] = useState("");
  const [archiveConfirmSystem, setArchiveConfirmSystem] = useState(null);
  const [systemSearch, setSystemSearch] = useState("");
  const { data: savedOneLine } = useOneLine(sldSystemId || undefined);
  const { data: sldMonitoredAssets = [] } = useMonitoredAssets(sldSystemId || undefined);

  const siteSystems = systems || [];
  const telemetryBySystem = useTelemetrySnapshots(siteSystems.map((system) => system.id));
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
  const siteAtsIds = useMemo(
    () => (ats || []).filter((item) => (panels || []).some((panel) => siteSystemIds.has(panel.system_id) && panel.id === item.panel_id)).map((item) => item.id),
    [ats, panels, siteSystemIds],
  );
  const siteMeters = useMeters(siteAtsIds);
  const generatorsByPanel = useMemo(() => {
    const map = new Map();
    (generators || []).forEach((item) => map.set(item.panel_id, [...(map.get(item.panel_id) || []), item]));
    return map;
  }, [generators]);
  const canManage = me?.role === "superadmin";

  const canViewReseller = me?.role === "superadmin" || me?.role === "reseller_admin";
  usePageHeader(site?.name || "Site", [
    ...(canViewReseller ? [
      { label: "Active Resellers", onClick: () => navigate("/resellers") },
      { label: reseller?.name || "", onClick: () => navigate(`/resellers/${customer?.reseller_id}`) },
    ] : []),
    { label: customer?.name || "", onClick: () => navigate(`/companies/${companyId}`) },
  ]);

  function submit(event) {
    event.preventDefault();
    if (createSystem.isPending || !name.trim() || !companyId || !siteId) return;
    setSystemSaveError("");
    const duplicate = siteSystems.find(system => system.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (duplicate) { const message = `A system named "${duplicate.name}" already exists.`; setSystemSaveError(message); toast.error(message); return; }
    createSystem.mutate({ name: name.trim(), company_id: companyId, site_id: siteId, address: site?.address }, {
      onSuccess: (saved) => { setName(""); setOpen(false); toast.success(`System "${saved.name}" created successfully.`); },
      onError: (error) => { const detail = error?.response?.data?.detail; const message = typeof detail === "string" ? detail : "Unable to save the system. Please try again."; setSystemSaveError(message); toast.error(message); },
    });
  }

  function openEditSystem(system) {
    setSystemSaveError("");
    setEditName(system.name);
    setEditingSystem(system);
  }

  function submitEditSystem(event) {
    event.preventDefault();
    if (updateSystem.isPending || !editName.trim() || !editingSystem) return;
    setSystemSaveError("");
    const duplicate = siteSystems.find(system => system.id !== editingSystem.id && system.name.trim().toLowerCase() === editName.trim().toLowerCase());
    if (duplicate) { const message = `A system named "${duplicate.name}" already exists.`; setSystemSaveError(message); toast.error(message); return; }
    updateSystem.mutate({ id: editingSystem.id, data: { name: editName.trim() } }, {
      onSuccess: (saved) => { setEditingSystem(null); toast.success(`System "${saved.name}" updated successfully.`); },
      onError: (error) => { const detail = error?.response?.data?.detail; const message = typeof detail === "string" ? detail : "Unable to save the system. Please try again."; setSystemSaveError(message); toast.error(message); },
    });
  }

  function confirmArchiveSystem() {
    if (!archiveConfirmSystem) return;
    const target = archiveConfirmSystem;
    archiveSystem.mutate(target.id, {
      onSuccess: () => toast.success(`System "${target.name}" archived successfully.`),
      onError: (error) => toast.error(error?.response?.data?.detail || `Could not archive "${target.name}".`),
    });
    setArchiveConfirmSystem(null);
  }

  function assetsFor(systemId) {
    const systemPanels = panelBySystem.get(systemId) || [];
    return {
      panels: systemPanels,
      ats: systemPanels.flatMap((panel) => atsByPanel.get(panel.id) || []),
      generators: systemPanels.flatMap((panel) => generatorsByPanel.get(panel.id) || []),
    };
  }

  function generatorReadiness(item, telemetry) {
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

  function atsReadiness(item, telemetry) {
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
    const telemetry = telemetryBySystem.get(system.id);
    const generatorStates = assets.generators.map((item) => generatorReadiness(item, telemetry));
    const atsStates = assets.ats.map((item) => atsReadiness(item, telemetry));
    const generatorsReady = generatorStates.filter((state) => state === "Ready").length;
    const atsNormal = atsStates.filter((state) => state === "Normal").length;
    const hasLiveTelemetry = Boolean(telemetry?.storage?.has_data && telemetry?.storage?.mqtt_connected);
    const utilityAvailable = hasLiveTelemetry && assets.ats.length
      ? assets.ats.every((item) => {
          const data = resolveAtsTelemetry(telemetry?.ats, item.id, item.name);
          return data?.communication_healthy === true && data?.utility_available === true;
        })
      : false;
    const onEmergency = hasLiveTelemetry && assets.ats.some((item) => resolveAtsTelemetry(telemetry?.ats, item.id, item.name)?.connected_source === "GENERATOR");
    const hasMappedEquipment = assets.generators.length + assets.ats.length > 0;
    const generatorsHealthy = assets.generators.length === 0 || generatorStates.every((state) => state === "Ready");
    const atsHealthy = assets.ats.length === 0 || (atsStates.every((state) => state === "Normal") && utilityAvailable);
    const realtimeOnline = hasLiveTelemetry && hasMappedEquipment && generatorsHealthy && atsHealthy && !onEmergency;
    const inTest = generatorStates.some((state) => state === "Test");
    const activeTestGenerators = assets.generators.filter((item) => {
      const data = resolveGeneratorTelemetry(telemetry?.generators, item.id, item.name);
      return data?.test_mode || data?.status === "TEST";
    });
    // Operational state is derived only from the current MQTT snapshot. The
    // persisted system.status value is descriptive and must never create a
    // false Online state when the broker or mapped devices are unavailable.
    const effectiveStatus = !hasLiveTelemetry
      ? "offline"
      : onEmergency
        ? "emergency"
        : inTest
          ? "test"
          : realtimeOnline
            ? "normal"
            : "offline";
    return {
      generatorsReady,
      atsNormal,
      generatorStates,
      atsStates,
      generatorSummary: readinessSummary(generatorStates, "Ready"),
      atsSummary: readinessSummary(atsStates, "Normal"),
      utilityAvailable,
      hasLiveTelemetry,
      realtimeOnline,
      activeTestGenerators,
      effectiveStatus,
    };
  }

  const systemCards = useMemo(
    () => siteSystems.map((system) => { const assets = assetsFor(system.id); return { system, assets, stats: statsFor(system, assets) }; }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siteSystems, panelBySystem, atsByPanel, generatorsByPanel, telemetryBySystem]
  );
  const attentionSystems = systemCards.filter((card) => !["normal", "online"].includes(card.stats.effectiveStatus));
  const emergencyPowerSystems = systemCards.filter((card) => card.stats.effectiveStatus === "emergency");
  const utilityUnavailableSystems = systemCards.filter((card) => !card.stats.utilityAvailable && card.stats.effectiveStatus !== "emergency");
  const systemsAwaitingTelemetry = systemCards.filter((card) => !card.stats.hasLiveTelemetry);
  const allNormal = systemCards.length > 0 && systemCards.every((card) => card.stats.realtimeOnline) && !activeAlarms.length;
  const atsCount = siteSystems.reduce((total, system) => total + (panelBySystem.get(system.id) || []).reduce((count, panel) => count + (atsByPanel.get(panel.id) || []).length, 0), 0);
  const generatorCount = siteSystems.reduce((total, system) => total + (panelBySystem.get(system.id) || []).reduce((count, panel) => count + (generatorsByPanel.get(panel.id) || []).length, 0), 0);
  const systemQuery = systemSearch.trim().toLowerCase();
  const visibleSystemCards = systemQuery
    ? systemCards.filter(({ system, assets }) => [system.name, ...assets.ats.map((item) => item.name), ...assets.generators.map((item) => item.name)]
        .some((value) => value?.toLowerCase().includes(systemQuery)))
    : systemCards;
  const onlineSystemCount =systemCards.filter((card) => card.stats.realtimeOnline).length;
  const offlineDeviceCount = systemCards.reduce(
    (total, card) => total + [...card.stats.generatorStates, ...card.stats.atsStates].filter((state) => state === "Offline").length,
    0,
  );

  const sldSystem = sldSystemId ? siteSystems.find((system) => system.id === sldSystemId) : null;
  const sldAssets = sldSystemId ? assetsFor(sldSystemId) : null;
  const sldTelemetry = sldSystemId ? telemetryBySystem.get(sldSystemId) : undefined;
  const savedOneLineData = savedOneLine?.data || {};
  const legacySourceLinks = savedOneLineData.sourceLinks || {};
  const emergencySourceLinks = savedOneLineData.lines?.emergency?.sourceLinks
    || Object.fromEntries(Object.entries(legacySourceLinks).filter(([id]) => id !== "utility"));
  const normalSourceLinks = savedOneLineData.lines?.normal?.sourceLinks
    || (legacySourceLinks.utility ? { utility: legacySourceLinks.utility } : {});
  // ATS load-side wiring is shared by both source views — merge it the same way the system page does.
  const { emergency: savedPieceDownstream, normal: savedNormalPieceDownstream } = shareAtsLoadSide(
    savedOneLineData.atsDownstream || {},
    Object.fromEntries(
      Object.entries(savedOneLineData.sharedPieceDownstream || savedOneLineData.pieceDownstream || {}).map(([name, value]) => [name, Array.isArray(value) ? value : [value]])
    ),
    Object.fromEntries(
      Object.entries(savedOneLineData.lines?.normal?.pieceDownstream || {}).map(([name, value]) => [name, Array.isArray(value) ? value : [value]])
    ),
  );
  // Company data is only needed for branding inside the optional one-line modal. Do not hold the
  // entire site page behind that independent request; cached site/systems data can paint immediately
  // while company branding and operational datasets refresh in the background.
  if (siteQuery.isPending || systemsQuery.isPending) return <QueryState loading title="Loading site systems…" />;
  if (siteQuery.isError || systemsQuery.isError) return <QueryState title="Site systems unavailable" message="We couldn't retrieve the systems for this site." onRetry={() => { void siteQuery.refetch(); void systemsQuery.refetch(); }} />;

  return <>
    <div className="reseller-page-heading">
      <div className="reseller-page-heading-icon" style={{ color: activeAlarms.length ? "#dc2626" : "#0ea5e9", background: activeAlarms.length ? "rgba(220,38,38,.14)" : "rgba(14,165,233,.14)" }}><IconMap size={19} /></div>
      <div className="reseller-page-heading-copy">
        <h2>{site?.name || "Site"}</h2>
        <div className="site-inventory-summary">
          {siteSystems.length} {siteSystems.length === 1 ? "system" : "systems"} · {atsCount} ATS · {generatorCount} {generatorCount === 1 ? "generator" : "generators"} · {siteMeters.length} {siteMeters.length === 1 ? "meter" : "meters"}
        </div>
      </div>
    </div>
    <div className="reseller-total-strip">
      <div className="reseller-total-item cyan"><span>Total Systems</span><strong>{siteSystems.length}</strong></div>
      <div className={`reseller-total-item ${onlineSystemCount === siteSystems.length && siteSystems.length ? "green" : "blue"}`}><span>Online Systems</span><strong>{onlineSystemCount}</strong></div>
      <div className={`reseller-total-item ${offlineDeviceCount ? "red" : "green"}`}><span>Offline Devices</span><strong>{offlineDeviceCount}</strong></div>
      <div className="reseller-total-item amber"><span>Events</span><strong>{activeAlarms.length}</strong></div>
    </div>
    {siteSystems.length > 0 && (
      <div className={`site-status-banner ${allNormal ? "normal" : "emergency"}`}>
        {allNormal ? (
          <>
            <h2>All Systems Online</h2>
            <p>No active alarms. No emergency operations.</p>
          </>
        ) : (
          <>
            <h2>{systemsAwaitingTelemetry.length
              ? `${systemsAwaitingTelemetry.length} System${systemsAwaitingTelemetry.length > 1 ? "s" : ""} Awaiting MQTT Data`
              : emergencyPowerSystems.length
              ? `${emergencyPowerSystems.length} System${emergencyPowerSystems.length > 1 ? "s" : ""} On Emergency Power`
              : utilityUnavailableSystems.length
                ? `${utilityUnavailableSystems.length} System${utilityUnavailableSystems.length > 1 ? "s" : ""} With Utility Unavailable`
                : attentionSystems.length
                  ? `${attentionSystems.length} System${attentionSystems.length > 1 ? "s" : ""} Need Attention`
                  : "Active Alarms"}</h2>
            <p>
              {systemsAwaitingTelemetry.length ? `${systemsAwaitingTelemetry.map((card) => card.system.name).join(", ")} ${systemsAwaitingTelemetry.length > 1 ? "do" : "does"} not have a current MQTT connection. ` : ""}
              {emergencyPowerSystems.length ? `${emergencyPowerSystems.map((card) => card.system.name).join(", ")} running on emergency power. ` : ""}
              {utilityUnavailableSystems.length ? `${utilityUnavailableSystems.map((card) => card.system.name).join(", ")} ${utilityUnavailableSystems.length > 1 ? "have" : "has"} no available utility source. ` : ""}
              {attentionSystems.filter((card) => !emergencyPowerSystems.includes(card) && !utilityUnavailableSystems.includes(card)).length ? `${attentionSystems.filter((card) => !emergencyPowerSystems.includes(card) && !utilityUnavailableSystems.includes(card)).map((card) => card.system.name).join(", ")} reporting a non-normal state. ` : ""}
              {activeAlarms.length ? `${activeAlarms.length} active alarm${activeAlarms.length > 1 ? "s" : ""}.` : "No active alarms."}
            </p>
          </>
        )}
      </div>
    )}
    <div className="section-header"><div><div className="section-title">Active Systems</div><div className="section-sub">{siteSystems.length} active {siteSystems.length === 1 ? "system" : "systems"} at {site?.name}</div></div>{canManage && <button className="header-btn primary" onClick={() => { setSystemSaveError(""); setName(""); setOpen(true); }}>+ New System</button>}</div>
    {siteSystems.length > 0 && <>
      <div className="directory-toolbar">
        <div className="directory-filters reseller-search-bar">
          <input type="search" value={systemSearch} onChange={(event) => setSystemSearch(event.target.value)} placeholder="Search systems, ATS or generators..." aria-label="Search systems at this site" />
        </div>
      </div>
    </>}
    <div className="readiness-definition"><b>Generator Ready</b>: communicating, Auto, stopped, not testing, no fault/shutdown, fuel and battery OK. <b>ATS Normal</b>: communicating, utility available, connected to utility, no fault or transfer in progress.</div>
    {systemQuery && !visibleSystemCards.length && <div className="operations-empty">No systems match “{systemSearch.trim()}”.</div>}
    <div className="site-systems-grid">{visibleSystemCards.map(({ system, assets, stats }) => {
      return (
        <div className={`site-system-card status-${stats.effectiveStatus}`} key={system.id}>
          <div className="site-system-card-head">
            <h3>{system.name}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StatusPill status={stats.effectiveStatus} />
              <SystemCardMenu system={system} canManage={canManage} onEdit={() => openEditSystem(system)} onArchive={() => setArchiveConfirmSystem(system)} />
            </div>
          </div>
          <div className="site-system-stats">
            <div className="site-system-stat"><span>Utility</span><b className={stats.utilityAvailable ? "stat-good" : "stat-bad"}>{stats.utilityAvailable ? "Available" : "Unavailable"}</b></div>
            <div className="site-system-stat" title="Ready = communicating, in Auto, stopped, not testing, no shutdown/fault, and no low fuel or battery condition."><span>Generators</span><b className={stats.generatorsReady === assets.generators.length ? "stat-good" : "stat-bad"}>{stats.generatorSummary}</b></div>
            <div className="site-system-stat" title="Normal = communicating, utility available, connected to utility, no fault, and no transfer in progress."><span>ATS</span><b className={stats.atsNormal === assets.ats.length ? "stat-good" : "stat-bad"}>{stats.atsSummary}</b></div>
          </div>
          {stats.activeTestGenerators.length > 0 && (
            <div className="site-system-test-indicator">
              <StatusPill status="test" label="Test Active" />
              <span>{stats.activeTestGenerators.map((generator) => generator.name).join(", ")}</span>
            </div>
          )}
          <div className="site-system-card-actions">
            <button type="button" onClick={() => navigate(`/systems/${system.id}`)}>Detail</button>
            <button type="button" onClick={() => setSldSystemId(system.id)}>One-Line</button>
          </div>
        </div>
      );
    })}</div>
    {!siteSystems.length && <div className="operations-empty">No systems registered at this site yet.</div>}
    {open && <Modal title="New System" onClose={() => !createSystem.isPending && setOpen(false)}><form onSubmit={submit}><div className="form-row"><label>System Name *</label><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Main Emergency Power System" autoFocus /></div>{systemSaveError && <div className="reseller-save-error" role="alert">{systemSaveError}</div>}<div className="modal-actions"><button type="button" className="header-btn" disabled={createSystem.isPending} onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="header-btn primary" disabled={createSystem.isPending}>{createSystem.isPending ? "Saving..." : "Save"}</button></div></form></Modal>}
    {editingSystem && <Modal title="Edit System" onClose={() => !updateSystem.isPending && setEditingSystem(null)}><form onSubmit={submitEditSystem}><div className="form-row"><label>System Name *</label><input required minLength={2} maxLength={120} value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus /></div>{systemSaveError && <div className="reseller-save-error" role="alert">{systemSaveError}</div>}<div className="modal-actions"><button type="button" className="header-btn" disabled={updateSystem.isPending} onClick={() => setEditingSystem(null)}>Cancel</button><button type="submit" className="header-btn primary" disabled={updateSystem.isPending}>{updateSystem.isPending ? "Saving..." : "Save"}</button></div></form></Modal>}
    {archiveConfirmSystem && (
      <Modal title="Archive System" onClose={() => setArchiveConfirmSystem(null)}>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--text-dim)" }}>
          Archive <b style={{ color: "var(--text)" }}>{archiveConfirmSystem.name}</b>? It will move to Archived Systems and be removed from active monitoring.
        </p>
        <div className="modal-actions">
          <button type="button" className="header-btn" onClick={() => setArchiveConfirmSystem(null)}>Cancel</button>
          <button type="button" className="header-btn danger" onClick={confirmArchiveSystem}>Archive</button>
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
            systemId={sldSystem.id}
            systemName={sldSystem.name}
            customerLogo={customer?.logo_data}
            customerName={customer?.name}
            ats={sldAssets.ats}
            generators={sldAssets.generators}
            monitoredAssets={sldMonitoredAssets}
            atsTelemetry={sldTelemetry?.ats}
            generatorTelemetry={sldTelemetry?.generators}
            pieces={savedOneLineData.pieces || []}
            emergencySourceLinks={emergencySourceLinks}
            normalSourceLinks={normalSourceLinks}
            atsDownstream={savedOneLineData.atsDownstream || {}}
            pieceDownstream={savedPieceDownstream}
            normalPieceDownstream={savedNormalPieceDownstream}
            generated={Boolean(savedOneLineData.generated || savedOneLineData.lines?.emergency?.generated || savedOneLineData.lines?.normal?.generated)}
          />
        )}
      </Modal>
    )}
  </>;
}
