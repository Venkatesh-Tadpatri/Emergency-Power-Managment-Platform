import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { usePageHeader } from "../../components/layout/HeaderContext";
import { DeviceAnalyticsModal } from "../../components/analytics/DeviceAnalyticsModal";
import { historyKey, telemetryFor, useTelemetryHistory } from "../../hooks/useTelemetry";
import { useCompanies } from "../../queries/companies";
import { useAllAts, useAllGenerators, useAllPanels, useSites, useSystems } from "../../queries/systems";
import { viewGrafanaUrl } from "../../utils/grafanaLinks";

const VIEWS = ["System overview", "Generator performance", "Power quality"] as const;
const metric = (value: number | undefined, unit = "") => value == null ? "—" : `${value.toFixed(1)}${unit}`;

type Kind = "generator" | "ats";
type SelectedDevice = { kind: Kind; equipment_id: string };
type EquipmentRow = {
  kind: Kind;
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  siteId: string;
  siteName: string;
  systemId: string;
  systemName: string;
  live?: Record<string, unknown> & { equipment_id: string; equipment_name: string; status: string; fault_active: boolean; communication_healthy: boolean; active_power_kw: number; load_percentage: number };
};

export function Analytics() {
  const [params, setParams] = useSearchParams();
  const companyFilter = params.get("companyId") || "";
  const siteFilter = params.get("siteId") || "";

  const { data: companies } = useCompanies();
  const { data: sites } = useSites(companyFilter || undefined);
  const { data: allSystems } = useSystems();
  const { data: allPanels } = useAllPanels();
  const { data: allGenerators } = useAllGenerators();
  const { data: allAts } = useAllAts();

  const company = companies?.find((c) => c.id === companyFilter);
  const site = sites?.find((s) => s.id === siteFilter);
  usePageHeader("Analytics", company ? [{ label: "Analytics", onClick: () => setParams({}) }, { label: site ? `${company.name} — ${site.name}` : company.name }] : []);

  const setCompanyFilter = (id: string) => setParams(id ? { companyId: id } : {});
  const setSiteFilter = (id: string) => setParams(id ? { companyId: companyFilter, siteId: id } : companyFilter ? { companyId: companyFilter } : {});

  const [view, setView] = useState<(typeof VIEWS)[number]>(VIEWS[0]);
  const [selected, setSelected] = useState<SelectedDevice | null>(null);
  const { telemetry, error, history } = useTelemetryHistory();
  const openGrafana = () => window.open(viewGrafanaUrl(view), "_blank", "noopener,noreferrer");

  const systemById = useMemo(() => new Map((allSystems ?? []).map((s) => [s.id, s])), [allSystems]);
  const panelById = useMemo(() => new Map((allPanels ?? []).map((p) => [p.id, p])), [allPanels]);
  const companyById = useMemo(() => new Map((companies ?? []).map((c) => [c.id, c.name])), [companies]);

  // Real equipment, joined from generator/ats → panel → system so every row carries its actual
  // company/site/system, instead of the flat demo telemetry fixture which has no such attribution.
  const allEquipment = useMemo(() => {
    const rows: EquipmentRow[] = [];
    const addRow = (kind: Kind, item: { id: string; name: string; panel_id: string }, liveList: EquipmentRow["live"][] | undefined) => {
      const panel = panelById.get(item.panel_id);
      const system = panel && systemById.get(panel.system_id);
      if (!system) return;
      const live = telemetryFor(liveList as any, item.id, item.name) as EquipmentRow["live"];
      rows.push({
        kind, id: item.id, name: item.name,
        companyId: system.company_id, companyName: companyById.get(system.company_id) || "—",
        siteId: system.site_id, siteName: system.site_name || "—",
        systemId: system.id, systemName: system.name,
        live,
      });
    };
    (allGenerators ?? []).forEach((g) => addRow("generator", g, telemetry?.generators as any));
    (allAts ?? []).forEach((a) => addRow("ats", a, telemetry?.ats as any));
    return rows;
  }, [allGenerators, allAts, panelById, systemById, companyById, telemetry]);

  const equipment = useMemo(
    () => allEquipment.filter((row) => (!companyFilter || row.companyId === companyFilter) && (!siteFilter || row.siteId === siteFilter)),
    [allEquipment, companyFilter, siteFilter],
  );

  const data = useMemo(() => {
    const generators = equipment.filter((item) => item.kind === "generator");
    const withLive = equipment.filter((item) => item.live);
    const alarms = withLive.filter((item) => item.live!.fault_active || !item.live!.communication_healthy).length;
    return {
      generators, equipment, alarms,
      live: withLive.length,
      power: withLive.reduce((total, item) => total + (item.live!.active_power_kw || 0), 0),
      load: withLive.length ? withLive.reduce((total, item) => total + (item.live!.load_percentage || 0), 0) / withLive.length : 0,
    };
  }, [equipment]);

  const selectedRow = selected && equipment.find((item) => item.kind === selected.kind && item.live?.equipment_id === selected.equipment_id);
  const selectedHistory = selected ? history.get(historyKey(selected.kind, selected.equipment_id)) ?? [] : [];
  const onSelect = (item: EquipmentRow) => { if (item.live) setSelected({ kind: item.kind, equipment_id: item.live.equipment_id }); };

  return <div>
    <section className="analytics-intro"><div><h2>Grafana analytics and live telemetry</h2><p>{telemetry ? "Live readings are refreshed automatically. Click a device for its trends, or open Grafana for the complete dashboard workspace and historical charts." : "Loading the latest telemetry…"}</p></div><div className="analytics-actions"><button type="button" className="analytics-open-btn" onClick={openGrafana}>Open in Grafana ↗</button><span className={`analytics-live-status${telemetry ? " online" : ""}`}>● {telemetry ? "Live data" : "Connecting"}</span></div></section>
    <div className="analytics-filters">
      <label>Customer<select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}><option value="">All customers</option>{(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Site<select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} disabled={!companyFilter}><option value="">All sites</option>{(sites ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    </div>
    <div className="analytics-tabs" aria-label="Analytics views">{VIEWS.map((label) => <button key={label} className={`analytics-tab${label === view ? " active" : ""}`} onClick={() => setView(label)}>{label}</button>)}</div>
    <div className="analytics-frame-card analytics-content">
      {!telemetry && !equipment.length ? <div className={`analytics-empty${error ? " error" : ""}`}>{error || "Loading telemetry data…"}</div> : <>
        {view === "System overview" && <><div className="analytics-metrics"><Metric label="Monitored assets" value={String(data.equipment.length)} /><Metric label="Live telemetry" value={String(data.live)} /><Metric label="Active alarms" value={String(data.alarms)} alert={data.alarms > 0} /><Metric label="Active load" value={metric(data.power, " kW")} /><Metric label="Average utilisation" value={metric(data.load, "%")} /></div><EquipmentTable items={data.equipment} onSelect={onSelect} /></>}
        {view === "Generator performance" && <EquipmentTable items={data.generators} mode="generator" onSelect={onSelect} />}
        {view === "Power quality" && <EquipmentTable items={data.equipment} mode="quality" onSelect={onSelect} />}
      </>}
    </div>
    {selectedRow && selectedRow.live && <DeviceAnalyticsModal kind={selected!.kind} snapshot={selectedRow.live as any} history={selectedHistory} onClose={() => setSelected(null)} />}
  </div>;
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) { return <div className={`analytics-metric${alert ? " alert" : ""}`}><span>{label}</span><strong>{value}</strong></div>; }

function EquipmentTable({ items, mode = "overview", onSelect }: { items: EquipmentRow[]; mode?: "overview" | "generator" | "quality"; onSelect: (item: EquipmentRow) => void }) {
  return <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Sl.No</th><th>Equipment</th><th>Site</th><th>Status</th>{mode === "generator" ? <><th>Load</th><th>Fuel</th><th>Engine hours</th><th>Runtime</th></> : mode === "quality" ? <><th>Voltage AB</th><th>Frequency</th><th>Power factor</th><th>Load</th></> : <><th>Power</th><th>Load</th><th>Connection</th></>}</tr></thead><tbody>{items.map((item, index) => {
    const live = item.live;
    const clickable = Boolean(live);
    return <tr key={item.id} className={clickable ? "analytics-row-clickable" : "analytics-row-static"} tabIndex={clickable ? 0 : undefined} role={clickable ? "button" : undefined} aria-label={clickable ? `Open analytics for ${item.name}` : undefined} onClick={clickable ? () => onSelect(item) : undefined} onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(item); } } : undefined}>
      <td className="mono">{index + 1}</td>
      <td><strong>{item.name}</strong></td>
      <td>{item.siteName}<span className="analytics-system-name"> · {item.systemName}</span></td>
      <td>{live ? <span className={`analytics-status ${live.fault_active || !live.communication_healthy ? "fault" : "healthy"}`}>{live.status}</span> : <span className="analytics-status unknown">No live data</span>}</td>
      {mode === "generator" ? <><td>{metric(live?.load_percentage as number, "%")}</td><td>{metric(live?.fuel_level_percent as number, "%")}</td><td>{metric(live?.engine_hours as number, " h")}</td><td>{metric(live?.estimated_runtime_hours as number, " h")}</td></> : mode === "quality" ? <><td>{metric(live?.voltage_ab as number, " V")}</td><td>{metric(live?.frequency as number, " Hz")}</td><td>{metric(live?.power_factor as number)}</td><td>{metric(live?.load_percentage as number, "%")}</td></> : <><td>{metric(live?.active_power_kw as number, " kW")}</td><td>{metric(live?.load_percentage as number, "%")}</td><td>{live ? (live.communication_healthy ? "Connected" : "Offline") : "—"}</td></>}
    </tr>;
  })}</tbody></table>{!items.length && <div className="analytics-empty">No equipment in this scope. Try a different customer or site.</div>}</div>;
}
