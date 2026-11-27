import type { DeviceHistory, HistoryPoint } from "../../hooks/useTelemetry";
import type { TrendSeries } from "./TrendChart";

/** Categorical slots, fixed order (validated light + dark — see --series-* in global.css). */
export const MAX_SERIES = 8;
export const seriesColor = (index: number) => `var(--series-${(index % MAX_SERIES) + 1})`;

export type NumericField = Exclude<keyof HistoryPoint, "t">;

/** Union of every device's bucket timestamps, ascending — the shared x-axis for a fleet chart. */
export function unionTimes(devices: DeviceHistory[]) {
  return [...new Set(devices.flatMap((device) => device.points.map((point) => point.t)))].sort((a, b) => a - b);
}

export type FieldOrFn = NumericField | ((point: HistoryPoint) => number | undefined);
const read = (point: HistoryPoint, field: FieldOrFn) => (typeof field === "function" ? field(point) : point[field] as number | undefined);

function valuesAt(device: DeviceHistory, field: FieldOrFn, times: number[]) {
  const byTime = new Map(device.points.map((point) => [point.t, read(point, field)]));
  return times.map((t) => {
    const value = byTime.get(t);
    return typeof value === "number" ? value : NaN;
  });
}

/**
 * One series per device for `field`. Colour follows the device (its stable position in the full,
 * name-sorted list), never its rank in this chart, so filtering never repaints the survivors.
 * Past eight devices the remainder is reported as hidden rather than cycling colours.
 */
export function perDeviceSeries(devices: DeviceHistory[], allDevices: DeviceHistory[], field: FieldOrFn, times: number[]) {
  const withData = devices.filter((device) => device.points.some((point) => typeof read(point, field) === "number"));
  const shown = withData.slice(0, MAX_SERIES);
  const order = new Map(allDevices.map((device, index) => [device.equipment_id, index]));
  const series: TrendSeries[] = shown.map((device) => ({
    key: device.equipment_id,
    label: device.equipment_name,
    color: seriesColor(order.get(device.equipment_id) ?? 0),
    points: valuesAt(device, field, times),
  }));
  return { series, hidden: withData.length - shown.length };
}

/** Sum of `field` across devices per bucket (NaN where no device reported). */
export function fleetTotal(devices: DeviceHistory[], field: FieldOrFn, times: number[]) {
  const columns = devices.map((device) => valuesAt(device, field, times));
  return times.map((_, index) => {
    const values = columns.map((column) => column[index]).filter((value) => Number.isFinite(value));
    return values.length ? values.reduce((total, value) => total + value, 0) : NaN;
  });
}

export type FieldStats = { avg?: number; min?: number; max?: number; latest?: number };

export function fieldStats(points: HistoryPoint[], field: NumericField): FieldStats {
  const values = points.map((point) => point[field]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return {};
  return {
    avg: values.reduce((total, value) => total + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    latest: values[values.length - 1],
  };
}

/** Mean of the three line-to-line voltages for one bucket. */
export function lineVoltage(point: HistoryPoint) {
  const phases = [point.voltage_ab, point.voltage_bc, point.voltage_ca].filter((value): value is number => typeof value === "number");
  return phases.length ? phases.reduce((total, value) => total + value, 0) / phases.length : undefined;
}

/** NEMA voltage unbalance: max deviation from the phase average, as % of that average. */
export function voltageUnbalance(point: HistoryPoint) {
  const phases = [point.voltage_ab, point.voltage_bc, point.voltage_ca].filter((value): value is number => typeof value === "number");
  if (phases.length < 3) return undefined;
  const avg = phases.reduce((total, value) => total + value, 0) / 3;
  return avg ? (Math.max(...phases.map((value) => Math.abs(value - avg))) / avg) * 100 : undefined;
}

export type DevicePerformance = {
  /** % of the selected range in which the device reported at least one reading. */
  availability: number;
  runHours?: number;
  emergencyHours?: number;
  transfers?: number;
  avgLoad?: number;
  peakKw?: number;
  avgKw?: number;
  fuelUsed?: number;
  lastSeen?: number;
};

export function devicePerformance(device: DeviceHistory, windowSeconds: number, rangeMs: number): DevicePerformance {
  const points = device.points;
  const bucketHours = windowSeconds / 3600;
  const expectedBuckets = Math.max(1, Math.round(rangeMs / (windowSeconds * 1000)));
  const perf: DevicePerformance = {
    availability: Math.min(100, (points.length / expectedBuckets) * 100),
    lastSeen: points.length ? points[points.length - 1].t : undefined,
  };
  const load = fieldStats(points, "load_percentage");
  const kw = fieldStats(points, "active_power_kw");
  perf.avgLoad = load.avg;
  perf.peakKw = kw.max;
  perf.avgKw = kw.avg;
  if (device.equipment_type === "generator") {
    const running = points.filter((point) => point.running != null);
    if (running.length) perf.runHours = running.filter((point) => point.running === 1).length * bucketHours;
    const fuel = points.map((point) => point.fuel_level_percent).filter((value): value is number => typeof value === "number");
    if (fuel.length > 1) perf.fuelUsed = Math.max(0, fuel[0] - fuel[fuel.length - 1]);
  } else {
    const states = points.filter((point) => point.on_emergency != null);
    if (states.length) {
      perf.emergencyHours = states.filter((point) => point.on_emergency === 1).length * bucketHours;
      perf.transfers = states.reduce((count, point, index) => count + (index > 0 && point.on_emergency === 1 && states[index - 1].on_emergency === 0 ? 1 : 0), 0);
    }
  }
  return perf;
}

export const formatNumber = (value: number | undefined, decimals = 1, unit = "") =>
  value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(decimals)}${unit}`;

export const formatHours = (hours: number | undefined) => {
  if (hours == null || !Number.isFinite(hours)) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
};

export const formatAgo = (ms: number | undefined) => {
  if (!ms) return "—";
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};
