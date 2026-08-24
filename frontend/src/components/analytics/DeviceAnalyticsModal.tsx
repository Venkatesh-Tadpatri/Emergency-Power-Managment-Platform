import { Modal } from "../common/Modal";
import { TrendChart, type TrendSeries } from "./TrendChart";
import type { AtsTelemetry, GeneratorTelemetry, TelemetryHistoryPoint } from "../../hooks/useTelemetry";
import { deviceGrafanaUrl, type DeviceKind } from "../../utils/grafanaLinks";

const metric = (value: number | undefined, decimals = 1, unit = "") => (value == null || Number.isNaN(value) ? "—" : `${value.toFixed(decimals)}${unit}`);
const series = (key: string, label: string, color: string, history: TelemetryHistoryPoint[], field: keyof TelemetryHistoryPoint): TrendSeries => ({
  key, label, color, points: history.map((point) => (point[field] as number | undefined) ?? NaN),
});

export function DeviceAnalyticsModal({ kind, snapshot, history, onClose }: {
  kind: DeviceKind;
  snapshot: (GeneratorTelemetry | AtsTelemetry) & { equipment_id: string; equipment_name: string };
  history: TelemetryHistoryPoint[];
  onClose: () => void;
}) {
  const isGenerator = kind === "generator";
  const generator = isGenerator ? (snapshot as GeneratorTelemetry) : undefined;
  const ats = !isGenerator ? (snapshot as AtsTelemetry) : undefined;
  const unhealthy = snapshot.fault_active || !snapshot.communication_healthy;
  const grafanaHref = deviceGrafanaUrl(kind, snapshot.equipment_id, snapshot.equipment_name);

  const voltageSeries = [
    series("vab", "V A-B", "var(--chart-1)", history, "voltage_ab"),
    series("vbc", "V B-C", "var(--chart-2)", history, "voltage_bc"),
    series("vca", "V C-A", "var(--chart-3)", history, "voltage_ca"),
  ];
  const currentSeries = [
    series("ia", "Amps A", "var(--chart-1)", history, "current_a"),
    series("ib", "Amps B", "var(--chart-2)", history, "current_b"),
    series("ic", "Amps C", "var(--chart-3)", history, "current_c"),
  ];

  return (
    <Modal title="" onClose={onClose} className="device-analytics-modal">
      <button type="button" className="equipment-popup-close" aria-label="Close device analytics" onClick={onClose}>x</button>
      <header className="device-analytics-header">
        <div>
          <span>{isGenerator ? "Generator" : "Automatic Transfer Switch"} analytics</span>
          <h3>{snapshot.equipment_name}</h3>
        </div>
        <span className={`analytics-status ${unhealthy ? "fault" : "healthy"}`}>{snapshot.status}</span>
      </header>

      <div className="device-analytics-stats">
        <div><span>Load</span><b>{metric(snapshot.load_percentage, 1, "%")}</b></div>
        <div><span>Active power</span><b>{metric(snapshot.active_power_kw, 1, " kW")}</b></div>
        <div><span>Frequency</span><b>{metric(snapshot.frequency, 1, " Hz")}</b></div>
        <div><span>Power factor</span><b>{metric(snapshot.power_factor, 2)}</b></div>
        {isGenerator ? <>
          <div><span>Fuel level</span><b>{metric(generator?.fuel_level_percent, 0, "%")}</b></div>
          <div><span>Engine hours</span><b>{metric(generator?.engine_hours, 1, " h")}</b></div>
        </> : <>
          <div><span>Connected source</span><b>{ats?.connected_source ?? "—"}</b></div>
          <div><span>Time on emergency</span><b>{ats ? `${ats.time_on_emergency_seconds}s` : "—"}</b></div>
        </>}
      </div>

      <div className="device-analytics-trends">
        <TrendChart title="Load" unit="%" series={[series("load", "Load", "var(--chart-1)", history, "load_percentage")]} />
        <TrendChart title="Active power" unit=" kW" series={[series("kw", "Power", "var(--chart-1)", history, "active_power_kw")]} />
        <TrendChart title="Line voltage" unit=" V" decimals={1} series={voltageSeries} />
        <TrendChart title="Line current" unit=" A" decimals={1} series={currentSeries} />
        <TrendChart title="Frequency" unit=" Hz" decimals={2} series={[series("hz", "Frequency", "var(--chart-1)", history, "frequency")]} />
        {isGenerator ? <>
          <TrendChart title="Coolant temperature" unit="°C" series={[series("temp", "Coolant", "var(--chart-1)", history, "coolant_temperature_c")]} />
          <TrendChart title="Fuel level" unit="%" decimals={0} series={[series("fuel", "Fuel", "var(--chart-1)", history, "fuel_level_percent")]} />
          <TrendChart title="Oil pressure" unit=" psi" series={[series("oil", "Oil pressure", "var(--chart-1)", history, "oil_pressure_psi")]} />
        </> : (
          <TrendChart title="Power factor" unit="" decimals={2} series={[series("pf", "Power factor", "var(--chart-1)", history, "power_factor")]} />
        )}
      </div>

      <footer className="device-analytics-footer">
        <p>Charts trend live readings sampled since this page was opened. Open Grafana for this device's complete historical trend and analytics.</p>
        <a className="analytics-open-btn" href={grafanaHref} target="_blank" rel="noopener noreferrer">Open full trend in Grafana ↗</a>
      </footer>
    </Modal>
  );
}
