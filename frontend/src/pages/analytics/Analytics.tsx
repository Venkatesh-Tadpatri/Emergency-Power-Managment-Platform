import { useMemo, useState } from "react";

import { usePageHeader } from "../../components/layout/HeaderContext";
import { DeviceAnalyticsModal } from "../../components/analytics/DeviceAnalyticsModal";
import { historyKey, useTelemetryHistory } from "../../hooks/useTelemetry";
import { viewGrafanaUrl } from "../../utils/grafanaLinks";

const VIEWS = ["System overview", "Generator performance", "Power quality"] as const;
const metric = (value: number | undefined, unit = "") => value == null ? "—" : `${value.toFixed(1)}${unit}`;

type Kind = "generator" | "ats";
type SelectedDevice = { kind: Kind; equipment_id: string };

export function Analytics() {
  usePageHeader("Analytics");
  const [view, setView] = useState<(typeof VIEWS)[number]>(VIEWS[0]);
  const [selected, setSelected] = useState<SelectedDevice | null>(null);
  const { telemetry, error, history } = useTelemetryHistory();
  const openGrafana = () => window.open(viewGrafanaUrl(view), "_blank", "noopener,noreferrer");
  const data = useMemo(() => {
    const generators = (telemetry?.generators ?? []).map((item) => ({ ...item, kind: "generator" as const }));
    const ats = (telemetry?.ats ?? []).map((item) => ({ ...item, kind: "ats" as const }));
    const equipment = [...generators, ...ats];
    const alarms = equipment.filter((item) => item.fault_active || !item.communication_healthy).length;
    return {
      generators, equipment, alarms,
      healthy: equipment.length - alarms,
      power: equipment.reduce((total, item) => total + (item.active_power_kw || 0), 0),
      load: equipment.length ? equipment.reduce((total, item) => total + (item.load_percentage || 0), 0) / equipment.length : 0,
    };
  }, [telemetry]);

  const selectedSnapshot = selected && data.equipment.find((item) => item.kind === selected.kind && item.equipment_id === selected.equipment_id);
  const selectedHistory = selected ? history.get(historyKey(selected.kind, selected.equipment_id)) ?? [] : [];
  const onSelect = (item: { kind: Kind; equipment_id: string }) => setSelected({ kind: item.kind, equipment_id: item.equipment_id });

  return <div>
    <section className="analytics-intro"><div><h2>Grafana analytics and live telemetry</h2><p>{telemetry ? "Live readings are refreshed automatically. Click a device for its trends, or open Grafana for the complete dashboard workspace and historical charts." : "Loading the latest telemetry…"}</p></div><div className="analytics-actions"><button type="button" className="analytics-open-btn" onClick={openGrafana}>Open in Grafana ↗</button><span className={`analytics-live-status${telemetry ? " online" : ""}`}>● {telemetry ? "Live data" : "Connecting"}</span></div></section>
    <div className="analytics-tabs" aria-label="Analytics views">{VIEWS.map((label) => <button key={label} className={`analytics-tab${label === view ? " active" : ""}`} onClick={() => setView(label)}>{label}</button>)}</div>
    <div className="analytics-frame-card analytics-content">
      {!telemetry ? <div className={`analytics-empty${error ? " error" : ""}`}>{error || "Loading telemetry data…"}</div> : <>
        {view === "System overview" && <><div className="analytics-metrics"><Metric label="Monitored assets" value={String(data.equipment.length)} /><Metric label="Healthy assets" value={String(data.healthy)} /><Metric label="Active alarms" value={String(data.alarms)} alert={data.alarms > 0} /><Metric label="Active load" value={metric(data.power, " kW")} /><Metric label="Average utilisation" value={metric(data.load, "%")} /></div><EquipmentTable items={data.equipment} onSelect={onSelect} /></>}
        {view === "Generator performance" && <EquipmentTable items={data.generators} mode="generator" onSelect={onSelect} />}
        {view === "Power quality" && <EquipmentTable items={data.equipment} mode="quality" onSelect={onSelect} />}
      </>}
    </div>
    {selected && selectedSnapshot && <DeviceAnalyticsModal kind={selected.kind} snapshot={selectedSnapshot} history={selectedHistory} onClose={() => setSelected(null)} />}
  </div>;
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) { return <div className={`analytics-metric${alert ? " alert" : ""}`}><span>{label}</span><strong>{value}</strong></div>; }

function EquipmentTable({ items, mode = "overview", onSelect }: { items: any[]; mode?: "overview" | "generator" | "quality"; onSelect: (item: { kind: "generator" | "ats"; equipment_id: string }) => void }) {
  return <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Equipment</th><th>Status</th>{mode === "generator" ? <><th>Load</th><th>Fuel</th><th>Engine hours</th><th>Runtime</th></> : mode === "quality" ? <><th>Voltage AB</th><th>Frequency</th><th>Power factor</th><th>Load</th></> : <><th>Power</th><th>Load</th><th>Connection</th></>}</tr></thead><tbody>{items.map((item) => <tr key={`${item.equipment_id}-${item.equipment_name}`} className="analytics-row-clickable" tabIndex={0} role="button" aria-label={`Open analytics for ${item.equipment_name}`} onClick={() => onSelect(item)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(item); } }}><td><strong>{item.equipment_name}</strong></td><td><span className={`analytics-status ${item.fault_active || !item.communication_healthy ? "fault" : "healthy"}`}>{item.status}</span></td>{mode === "generator" ? <><td>{metric(item.load_percentage, "%")}</td><td>{metric(item.fuel_level_percent, "%")}</td><td>{metric(item.engine_hours, " h")}</td><td>{metric(item.estimated_runtime_hours, " h")}</td></> : mode === "quality" ? <><td>{metric(item.voltage_ab, " V")}</td><td>{metric(item.frequency, " Hz")}</td><td>{metric(item.power_factor)}</td><td>{metric(item.load_percentage, "%")}</td></> : <><td>{metric(item.active_power_kw, " kW")}</td><td>{metric(item.load_percentage, "%")}</td><td>{item.communication_healthy ? "Connected" : "Offline"}</td></>}</tr>)}</tbody></table>{!items.length && <div className="analytics-empty">No equipment telemetry is available.</div>}</div>;
}
