import { useMemo, useState } from "react";

import { Modal } from "../common/Modal";
import { TrendChart, type TrendSeries } from "./TrendChart";
import { HISTORY_RANGES, useDeviceHistory, type AtsTelemetry, type GeneratorTelemetry, type HistoryPoint, type HistoryRange } from "../../hooks/useTelemetry";
import { devicePerformance, fieldStats, formatAgo, formatHours, formatNumber, seriesColor, voltageUnbalance, type NumericField } from "./analyticsData";
import { RangePicker } from "./RangePicker";

export type DeviceKind = "generator" | "ats";

const single = (key: string, label: string, points: HistoryPoint[], field: NumericField): TrendSeries[] => [{
  key, label, color: seriesColor(0), points: points.map((point) => (typeof point[field] === "number" ? point[field] as number : NaN)),
}];
const phases = (points: HistoryPoint[], fields: [NumericField, string][]): TrendSeries[] => fields.map(([field, label], index) => ({
  key: field, label, color: seriesColor(index), points: points.map((point) => (typeof point[field] === "number" ? point[field] as number : NaN)),
}));

export function DeviceAnalyticsModal({ kind, deviceId, deviceName, systemId, snapshot, initialRange = "24h", onClose }: {
  kind: DeviceKind;
  deviceId: string;
  deviceName: string;
  systemId: string;
  /** Latest live reading, when the device is currently reporting. */
  snapshot?: (GeneratorTelemetry | AtsTelemetry) | null;
  initialRange?: HistoryRange;
  onClose: () => void;
}) {
  const [range, setRange] = useState<HistoryRange>(initialRange);
  const historyQuery = useDeviceHistory([systemId], range, deviceId);
  const device = historyQuery.data?.devices.find((item) => item.equipment_id === deviceId);
  const points = useMemo(() => device?.points ?? [], [device]);
  const times = points.map((point) => point.t);
  const rangeMs = HISTORY_RANGES.find((item) => item.key === range)!.ms;
  const domain: [number, number] = [Date.now() - rangeMs, Date.now()];
  const perf = device && historyQuery.data ? devicePerformance(device, historyQuery.data.window_seconds, rangeMs) : undefined;
  const isGenerator = kind === "generator";
  const generator = isGenerator ? (snapshot as GeneratorTelemetry | undefined) : undefined;
  const ats = !isGenerator ? (snapshot as AtsTelemetry | undefined) : undefined;
  const unhealthy = snapshot ? snapshot.fault_active || !snapshot.communication_healthy : false;
  const unbalance = points.map((point) => voltageUnbalance(point) ?? NaN);
  const freq = fieldStats(points, "frequency");
  const pf = fieldStats(points, "power_factor");

  const chart = (title: string, series: TrendSeries[], unit: string, decimals = 1, step = false) =>
    <TrendChart title={title} series={series} unit={unit} decimals={decimals} times={times} domain={domain} step={step} />;

  return (
    <Modal title="" onClose={onClose} className="device-analytics-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close device analytics" onClick={onClose}>x</button>
      <header className="device-analytics-header">
        <div>
          <span>{isGenerator ? "Generator" : "Automatic Transfer Switch"} analytics</span>
          <h3>{deviceName}</h3>
        </div>
        <div className="device-analytics-header-actions">
          <RangePicker value={range} onChange={setRange} />
          <span className={`analytics-status ${snapshot ? (unhealthy ? "fault" : "healthy") : "unknown"}`}>{snapshot?.status ?? "No live data"}</span>
        </div>
      </header>

      <div className="device-analytics-stats">
        {isGenerator ? <>
          <div><span>Load now</span><b>{formatNumber(snapshot?.load_percentage, 1, "%")}</b></div>
          <div><span>Avg load</span><b>{formatNumber(perf?.avgLoad, 1, "%")}</b></div>
          <div><span>Peak power</span><b>{formatNumber(perf?.peakKw, 1, " kW")}</b></div>
          <div><span>Run time</span><b>{formatHours(perf?.runHours)}</b></div>
          <div><span>Fuel used</span><b>{formatNumber(perf?.fuelUsed, 1, "%")}</b></div>
          <div><span>Fuel level</span><b>{formatNumber(generator?.fuel_level_percent, 0, "%")}</b></div>
        </> : <>
          <div><span>Source now</span><b>{ats?.connected_source ?? "—"}</b></div>
          <div><span>Transfers</span><b>{perf?.transfers ?? "—"}</b></div>
          <div><span>On emergency</span><b>{formatHours(perf?.emergencyHours)}</b></div>
          <div><span>Avg frequency</span><b>{formatNumber(freq.avg, 2, " Hz")}</b></div>
          <div><span>Avg power factor</span><b>{formatNumber(pf.avg, 2)}</b></div>
          <div><span>Peak power</span><b>{formatNumber(perf?.peakKw, 1, " kW")}</b></div>
        </>}
      </div>
      <div className="device-analytics-availability">
        <span>Data availability <b>{formatNumber(perf?.availability, 0, "%")}</b></span>
        <span>Last reading <b>{formatAgo(perf?.lastSeen)}</b></span>
        <span>{historyQuery.data ? `Averaged per ${Math.round(historyQuery.data.window_seconds / 60)} min` : ""}</span>
      </div>

      {historyQuery.isPending ? <div className="analytics-empty">Loading history…</div>
        : historyQuery.isError ? <div className="analytics-empty error">Could not load stored history for this device. Try again shortly.</div>
        : <div className="device-analytics-trends">
          {isGenerator ? <>
            {chart("Load", single("load", "Load", points, "load_percentage"), "%")}
            {chart("Active power", single("kw", "Active power", points, "active_power_kw"), " kW")}
          </> : chart("Running on emergency (1 = yes)", single("emg", "On emergency", points, "on_emergency"), "", 0, true)}
          {chart("Line voltage", phases(points, [["voltage_ab", "V A-B"], ["voltage_bc", "V B-C"], ["voltage_ca", "V C-A"]]), " V")}
          {chart("Phase-to-neutral voltage", phases(points, [["voltage_an", "V A-N"], ["voltage_bn", "V B-N"], ["voltage_cn", "V C-N"]]), " V")}
          {chart("Line current", phases(points, [["current_a", "Amps A"], ["current_b", "Amps B"], ["current_c", "Amps C"]]), " A")}
          {chart("Voltage unbalance", [{ key: "unb", label: "Unbalance", color: seriesColor(0), points: unbalance }], "%", 2)}
          {chart("Frequency", single("hz", "Frequency", points, "frequency"), " Hz", 2)}
          {chart("Power factor", single("pf", "Power factor", points, "power_factor"), "", 2)}
          {isGenerator ? <>
            {chart("Fuel level", single("fuel", "Fuel", points, "fuel_level_percent"), "%", 0)}
            {chart("Coolant temperature", single("temp", "Coolant", points, "coolant_temperature_c"), "°C")}
            {chart("Oil pressure", single("oil", "Oil pressure", points, "oil_pressure_psi"), " psi")}
            {chart("Battery voltage", single("batt", "Battery", points, "battery_voltage"), " V", 2)}
          </> : chart("Active power", single("kw", "Active power", points, "active_power_kw"), " kW")}
        </div>}
    </Modal>
  );
}
