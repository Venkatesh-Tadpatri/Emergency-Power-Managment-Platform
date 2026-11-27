import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { usePageHeader } from "../../components/layout/HeaderContext";
import { DeviceAnalyticsModal, type DeviceKind } from "../../components/analytics/DeviceAnalyticsModal";
import { RangePicker } from "../../components/analytics/RangePicker";
import { TrendChart, type TrendSeries } from "../../components/analytics/TrendChart";
import {
  devicePerformance, fieldStats, fleetTotal, formatAgo, formatHours, formatNumber, lineVoltage,
  perDeviceSeries, seriesColor, unionTimes, voltageUnbalance, type DevicePerformance, type FieldOrFn,
} from "../../components/analytics/analyticsData";
import {
  HISTORY_RANGES, telemetryFor, useDeviceHistory, useTelemetrySnapshots,
  type AtsTelemetry, type DeviceHistory, type GeneratorTelemetry, type HistoryRange,
} from "../../hooks/useTelemetry";
import { useCompanies } from "../../queries/companies";
import { useAllAts, useAllGenerators, useAllPanels, useSites, useSystems } from "../../queries/systems";

const VIEWS = [
  { key: "overview", label: "System overview" },
  { key: "generators", label: "Generator performance" },
  { key: "quality", label: "Power quality" },
  { key: "ats", label: "Transfer switches" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

type LiveReading = (GeneratorTelemetry | AtsTelemetry) & { load_percentage?: number; active_power_kw?: number };
type EquipmentRow = {
  kind: DeviceKind;
  id: string;
  name: string;
  companyId: string;
  siteName: string;
  systemId: string;
  systemName: string;
  live?: LiveReading;
  history?: DeviceHistory;
  perf?: DevicePerformance;
};

const isRange = (value: string | null): value is HistoryRange => HISTORY_RANGES.some((item) => item.key === value);

export function Analytics() {
  const [params, setParams] = useSearchParams();
  const companyFilter = params.get("companyId") || "";
  const siteFilter = params.get("siteId") || "";
  const systemFilter = params.get("systemId") || "";
  const range: HistoryRange = isRange(params.get("range")) ? params.get("range") as HistoryRange : "24h";
  const view: ViewKey = VIEWS.some((item) => item.key === params.get("view")) ? params.get("view") as ViewKey : "overview";
  const deviceParam = params.get("device") || "";

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    setParams(next, { replace: true });
  };

  const { data: companies } = useCompanies();
  const { data: sites } = useSites(companyFilter || undefined, { enabled: !!companyFilter });
  const { data: allSystems, isPending: systemsPending } = useSystems();
  const { data: allPanels } = useAllPanels();
  const { data: allGenerators } = useAllGenerators();
  const { data: allAts } = useAllAts();

  const company = companies?.find((item) => item.id === companyFilter);
  const site = sites?.find((item) => item.id === siteFilter);
  const scopeSystems = useMemo(() => (allSystems ?? []).filter((system) => !system.archived
    && (!companyFilter || system.company_id === companyFilter)
    && (!siteFilter || system.site_id === siteFilter)
    && (!systemFilter || system.id === systemFilter)), [allSystems, companyFilter, siteFilter, systemFilter]);
  const systemChoices = useMemo(() => (allSystems ?? []).filter((system) => !system.archived
    && (!companyFilter || system.company_id === companyFilter)
    && (!siteFilter || system.site_id === siteFilter)), [allSystems, companyFilter, siteFilter]);
  const selectedSystem = scopeSystems.find((system) => system.id === systemFilter);

  usePageHeader("Analytics", company
    ? [{ label: "Analytics", onClick: () => setParams({}) }, { label: [company.name, site?.name, selectedSystem?.name].filter(Boolean).join(" — ") }]
    : []);

  const scopeIds = useMemo(() => scopeSystems.map((system) => system.id), [scopeSystems]);
  // Live snapshots are one request per system; cap the fan-out on very large fleets.
  const snapshots = useTelemetrySnapshots(useMemo(() => scopeIds.slice(0, 50), [scopeIds]));
  const historyQuery = useDeviceHistory(scopeIds, range);
  const rangeMs = HISTORY_RANGES.find((item) => item.key === range)!.ms;
  const windowSeconds = historyQuery.data?.window_seconds ?? 60;
  // Fixed x-domain so every chart on the page lines up on the same time window.
  const domain = useMemo<[number, number]>(() => [Date.now() - rangeMs, Date.now()], [rangeMs, historyQuery.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const systemById = useMemo(() => new Map((allSystems ?? []).map((system) => [system.id, system])), [allSystems]);
  const panelById = useMemo(() => new Map((allPanels ?? []).map((panel) => [panel.id, panel])), [allPanels]);
  const historyById = useMemo(() => new Map((historyQuery.data?.devices ?? []).map((device) => [device.equipment_id, device])), [historyQuery.data]);
  const scopeSet = useMemo(() => new Set(scopeIds), [scopeIds]);

  const equipment = useMemo(() => {
    const rows: EquipmentRow[] = [];
    const add = (kind: DeviceKind, item: { id: string; name: string; panel_id: string }) => {
      const panel = panelById.get(item.panel_id);
      const system = panel && systemById.get(panel.system_id);
      if (!system || !scopeSet.has(system.id)) return;
      const snapshot = snapshots.get(system.id);
      const liveList = (kind === "generator" ? snapshot?.generators : snapshot?.ats) as LiveReading[] | undefined;
      const history = historyById.get(item.id);
      rows.push({
        kind, id: item.id, name: item.name,
        companyId: system.company_id, siteName: system.site_name || "—",
        systemId: system.id, systemName: system.name,
        live: telemetryFor(liveList, item.id, item.name),
        history,
        perf: history && historyQuery.data ? devicePerformance(history, windowSeconds, rangeMs) : undefined,
      });
    };
    (allGenerators ?? []).forEach((item) => add("generator", item));
    (allAts ?? []).forEach((item) => add("ats", item));
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [allGenerators, allAts, panelById, systemById, scopeSet, snapshots, historyById, historyQuery.data, windowSeconds, rangeMs]);

  // History for the devices actually in scope, name-sorted so colour slots stay stable per device.
  const histories = useMemo(() => equipment.flatMap((row) => (row.history ? [row.history] : [])), [equipment]);
  const generatorHistories = histories.filter((device) => device.equipment_type === "generator");
  const atsHistories = histories.filter((device) => device.equipment_type === "ats");
  const times = useMemo(() => unionTimes(histories), [histories]);

  const live = equipment.filter((row) => row.live?.communication_healthy);
  const alarms = equipment.filter((row) => row.live && (row.live.fault_active || !row.live.communication_healthy)).length;
  const kwNow = live.flatMap((row) => (typeof row.live?.active_power_kw === "number" ? [row.live.active_power_kw] : []));
  const loadNow = live.flatMap((row) => (typeof row.live?.load_percentage === "number" ? [row.live.load_percentage] : []));
  const monitoredPerf = equipment.flatMap((row) => (row.perf ? [row.perf.availability] : []));

  const selectedDevice = useMemo(() => {
    const [kind, id] = deviceParam.split(":");
    return equipment.find((row) => row.kind === kind && row.id === id) ?? null;
  }, [deviceParam, equipment]);
  const openDevice = (row: EquipmentRow) => update({ device: `${row.kind}:${row.id}` });

  const deviceChart = (title: string, devices: DeviceHistory[], field: FieldOrFn, unit: string, decimals = 1, step = false) => {
    const { series, hidden } = perDeviceSeries(devices, histories, field, times);
    return <TrendChart title={hidden ? `${title} (first 8 of ${series.length + hidden})` : title} series={series} unit={unit} decimals={decimals} times={times} domain={domain} step={step} />;
  };
  const totalChart = (title: string, devices: DeviceHistory[], field: FieldOrFn, unit: string, decimals = 1, step = false) => {
    const series: TrendSeries[] = [{ key: "total", label: title, color: seriesColor(0), points: fleetTotal(devices, field, times) }];
    return <TrendChart title={title} series={series} unit={unit} decimals={decimals} times={times} domain={domain} step={step} />;
  };

  const reporting = scopeIds.filter((id) => snapshots.get(id)?.storage?.has_data).length;
  const historyError = historyQuery.isError;

  return <div className="analytics-page">
    <section className="analytics-intro">
      <div>
        <h2>Analytics &amp; performance</h2>
        <p>Trends are read from stored telemetry{historyQuery.data ? ` and averaged per ${windowSeconds >= 3600 ? `${windowSeconds / 3600} h` : `${Math.round(windowSeconds / 60)} min`}` : ""} for the selected range. Live values refresh automatically. Select any equipment row for its full history.</p>
      </div>
      <div className="analytics-actions">
        <RangePicker value={range} onChange={(value) => update({ range: value })} />
        <span className={`analytics-live-status${reporting ? " online" : ""}`}>● {scopeIds.length ? `${reporting} of ${scopeIds.length} systems reporting` : "No systems"}</span>
      </div>
    </section>

    <div className="analytics-filters">
      <label>Customer<select value={companyFilter} onChange={(e) => update({ companyId: e.target.value || null, siteId: null, systemId: null, device: null })}><option value="">All customers</option>{(companies ?? []).filter((item) => item.status !== "archived").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Site<select value={siteFilter} onChange={(e) => update({ siteId: e.target.value || null, systemId: null, device: null })} disabled={!companyFilter}><option value="">All sites</option>{(sites ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>System<select value={systemFilter} onChange={(e) => update({ systemId: e.target.value || null, device: null })}><option value="">All systems</option>{systemChoices.map((item) => <option key={item.id} value={item.id}>{item.name}{item.site_name ? ` · ${item.site_name}` : ""}</option>)}</select></label>
    </div>

    <div className="analytics-tabs" role="tablist" aria-label="Analytics views">
      {VIEWS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={item.key === view} className={`analytics-tab${item.key === view ? " active" : ""}`} onClick={() => update({ view: item.key === "overview" ? null : item.key })}>{item.label}</button>)}
    </div>

    {systemsPending ? <div className="analytics-frame-card"><div className="analytics-empty">Loading systems…</div></div>
      : !scopeIds.length ? <div className="analytics-frame-card"><div className="analytics-empty">No systems in this scope. Try a different customer, site or system.</div></div>
      : <>
        <div className="analytics-frame-card">
          <div className="analytics-metrics">
            <Metric label="Monitored equipment" value={String(equipment.length)} />
            <Metric label="Reporting now" value={`${live.length} / ${equipment.length}`} />
            <Metric label="Active alarms" value={String(alarms)} alert={alarms > 0} />
            <Metric label="Active load" value={kwNow.length ? formatNumber(kwNow.reduce((a, b) => a + b, 0), 1, " kW") : "—"} />
            <Metric label="Avg utilisation" value={loadNow.length ? formatNumber(loadNow.reduce((a, b) => a + b, 0) / loadNow.length, 1, "%") : "—"} />
            <Metric label={`Data availability · ${range}`} value={monitoredPerf.length ? formatNumber(monitoredPerf.reduce((a, b) => a + b, 0) / monitoredPerf.length, 0, "%") : "—"} />
          </div>
        </div>

        {historyError && <div className="analytics-banner error">Stored history could not be loaded right now — live values are still shown. It will retry automatically.</div>}
        {historyQuery.isPending && <div className="analytics-banner">Loading history for the last {range}…</div>}

        {!historyQuery.isPending && !historyError && <div className="analytics-chart-grid">
          {view === "overview" && <>
            {totalChart("Total active power", histories, "active_power_kw", " kW")}
            {totalChart("Generators running", generatorHistories, "running", "", 0, true)}
            {totalChart("Transfer switches on emergency", atsHistories, "on_emergency", "", 0, true)}
            {deviceChart("Generator load", generatorHistories, "load_percentage", "%")}
          </>}
          {view === "generators" && <>
            {deviceChart("Load", generatorHistories, "load_percentage", "%")}
            {deviceChart("Active power", generatorHistories, "active_power_kw", " kW")}
            {deviceChart("Fuel level", generatorHistories, "fuel_level_percent", "%", 0)}
            {deviceChart("Coolant temperature", generatorHistories, "coolant_temperature_c", "°C")}
            {deviceChart("Oil pressure", generatorHistories, "oil_pressure_psi", " psi")}
            {deviceChart("Battery voltage", generatorHistories, "battery_voltage", " V", 2)}
          </>}
          {view === "quality" && <>
            {deviceChart("Line voltage (3-phase average)", histories, lineVoltage, " V")}
            {deviceChart("Voltage unbalance", histories, voltageUnbalance, "%", 2)}
            {deviceChart("Frequency", histories, "frequency", " Hz", 2)}
            {deviceChart("Power factor", histories, "power_factor", "", 2)}
          </>}
          {view === "ats" && <>
            {deviceChart("On emergency (1 = yes)", atsHistories, "on_emergency", "", 0, true)}
            {deviceChart("Utility available (1 = yes)", atsHistories, "utility_available", "", 0, true)}
            {deviceChart("Load through switch", atsHistories, "active_power_kw", " kW")}
          </>}
        </div>}

        <div className="analytics-frame-card analytics-content">
          {view === "overview" && <>
            <StatusBreakdown rows={equipment} />
            <EquipmentTable rows={equipment} onSelect={openDevice} columns={[
              ["Power now", (row) => formatNumber(row.live?.active_power_kw, 1, " kW")],
              ["Load now", (row) => formatNumber(row.live?.load_percentage, 1, "%")],
              [`Avg load · ${range}`, (row) => formatNumber(row.perf?.avgLoad, 1, "%")],
              [`Peak · ${range}`, (row) => formatNumber(row.perf?.peakKw, 1, " kW")],
              ["Availability", (row) => formatNumber(row.perf?.availability, 0, "%")],
              ["Last reading", (row) => formatAgo(row.perf?.lastSeen)],
            ]} />
          </>}
          {view === "generators" && <EquipmentTable rows={equipment.filter((row) => row.kind === "generator")} onSelect={openDevice} columns={[
            ["Load now", (row) => formatNumber(row.live?.load_percentage, 1, "%")],
            ["Run time", (row) => formatHours(row.perf?.runHours)],
            ["Avg load", (row) => formatNumber(row.perf?.avgLoad, 1, "%")],
            ["Peak power", (row) => formatNumber(row.perf?.peakKw, 1, " kW")],
            ["Fuel now", (row) => formatNumber((row.live as GeneratorTelemetry | undefined)?.fuel_level_percent, 0, "%")],
            ["Fuel used", (row) => formatNumber(row.perf?.fuelUsed, 1, "%")],
            ["Engine hours", (row) => formatNumber((row.live as GeneratorTelemetry | undefined)?.engine_hours, 1, " h")],
            ["Availability", (row) => formatNumber(row.perf?.availability, 0, "%")],
          ]} />}
          {view === "quality" && <EquipmentTable rows={equipment} onSelect={openDevice} columns={[
            ["Avg voltage", (row) => formatNumber(fieldStatsFn(row, lineVoltage).avg, 1, " V")],
            ["Min / max V", (row) => { const s = fieldStatsFn(row, lineVoltage); return s.min == null ? "—" : `${s.min.toFixed(0)} / ${s.max!.toFixed(0)}`; }],
            ["Max unbalance", (row) => formatNumber(fieldStatsFn(row, voltageUnbalance).max, 2, "%")],
            ["Avg frequency", (row) => formatNumber(row.history ? fieldStats(row.history.points, "frequency").avg : undefined, 2, " Hz")],
            ["Avg power factor", (row) => formatNumber(row.history ? fieldStats(row.history.points, "power_factor").avg : undefined, 2)],
          ]} />}
          {view === "ats" && <EquipmentTable rows={equipment.filter((row) => row.kind === "ats")} onSelect={openDevice} columns={[
            ["Source now", (row) => (row.live as AtsTelemetry | undefined)?.connected_source ?? "—"],
            ["Transfers", (row) => (row.perf?.transfers != null ? String(row.perf.transfers) : "—")],
            ["On emergency", (row) => formatHours(row.perf?.emergencyHours)],
            ["Utility available", (row) => { const s = fieldStatsFn(row, (p) => p.utility_available); return s.avg == null ? "—" : `${(s.avg * 100).toFixed(0)}%`; }],
            ["Availability", (row) => formatNumber(row.perf?.availability, 0, "%")],
            ["Last reading", (row) => formatAgo(row.perf?.lastSeen)],
          ]} />}
        </div>
      </>}

    {selectedDevice && <DeviceAnalyticsModal
      kind={selectedDevice.kind}
      deviceId={selectedDevice.id}
      deviceName={selectedDevice.name}
      systemId={selectedDevice.systemId}
      snapshot={selectedDevice.live}
      initialRange={range}
      onClose={() => update({ device: null })}
    />}
  </div>;
}

function fieldStatsFn(row: EquipmentRow, fn: (point: DeviceHistory["points"][number]) => number | undefined) {
  const values = (row.history?.points ?? []).map(fn).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return { avg: undefined, min: undefined, max: undefined };
  return { avg: values.reduce((a, b) => a + b, 0) / values.length, min: Math.min(...values), max: Math.max(...values) };
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <div className={`analytics-metric${alert ? " alert" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

const STATUS_GROUPS = [
  { key: "healthy", label: "Healthy", tone: "good" },
  { key: "emergency", label: "On emergency / running", tone: "warning" },
  { key: "fault", label: "Fault or offline", tone: "critical" },
  { key: "unknown", label: "No live data", tone: "neutral" },
] as const;

function statusGroup(row: EquipmentRow): (typeof STATUS_GROUPS)[number]["key"] {
  const live = row.live;
  if (!live) return "unknown";
  if (live.fault_active || !live.communication_healthy) return "fault";
  if (live.status === "EMERGENCY" || live.status === "RUNNING") return "emergency";
  return "healthy";
}

/** Count of equipment per health state — a labelled bar list (never colour alone). */
function StatusBreakdown({ rows }: { rows: EquipmentRow[] }) {
  const counts = STATUS_GROUPS.map((group) => ({ ...group, count: rows.filter((row) => statusGroup(row) === group.key).length }));
  const max = Math.max(1, ...counts.map((item) => item.count));
  return <div className="analytics-status-breakdown" aria-label="Equipment by status">
    <h4>Equipment by status</h4>
    {counts.map((item) => <div key={item.key} className="analytics-status-row">
      <span className="analytics-status-label"><i className={`tone-${item.tone}`} aria-hidden="true" />{item.label}</span>
      <span className="analytics-status-track"><span className={`analytics-status-fill tone-${item.tone}`} style={{ width: `${(item.count / max) * 100}%` }} /></span>
      <b>{item.count}</b>
    </div>)}
  </div>;
}

function EquipmentTable({ rows, columns, onSelect }: {
  rows: EquipmentRow[];
  columns: [string, (row: EquipmentRow) => string][];
  onSelect: (row: EquipmentRow) => void;
}) {
  return <div className="analytics-table-wrap">
    <table className="analytics-table">
      <thead><tr><th>Sl.No</th><th>Equipment</th><th>Site · System</th><th>Status</th>{columns.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => {
        const live = row.live;
        return <tr key={`${row.kind}:${row.id}`} className="analytics-row-clickable" tabIndex={0} role="button" aria-label={`Open analytics for ${row.name}`}
          onClick={() => onSelect(row)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(row); } }}>
          <td className="mono">{index + 1}</td>
          <td><strong>{row.name}</strong><span className="analytics-kind">{row.kind === "generator" ? "Generator" : "ATS"}</span></td>
          <td>{row.siteName}<span className="analytics-system-name"> · {row.systemName}</span></td>
          <td>{live ? <span className={`analytics-status ${live.fault_active || !live.communication_healthy ? "fault" : "healthy"}`}>{live.status}</span> : <span className="analytics-status unknown">No live data</span>}</td>
          {columns.map(([label, render]) => <td key={label} className="mono">{render(row)}</td>)}
        </tr>;
      })}</tbody>
    </table>
    {!rows.length && <div className="analytics-empty">No equipment in this scope. Try a different customer, site or system.</div>}
  </div>;
}
