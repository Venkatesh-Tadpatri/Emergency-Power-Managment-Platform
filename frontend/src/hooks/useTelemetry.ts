import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

export type GeneratorTelemetry = {
  equipment_id: string;
  equipment_name: string;
  status: "READY" | "RUNNING" | "FAULT" | "OFFLINE" | "TEST";
  running: boolean;
  auto_mode: boolean;
  test_mode: boolean;
  fault_active: boolean;
  voltage_ab: number;
  voltage_bc: number;
  voltage_ca: number;
  current_a: number;
  current_b: number;
  current_c: number;
  frequency: number;
  active_power_kw: number;
  apparent_power_kva: number;
  power_factor: number;
  load_percentage: number;
  oil_pressure_psi: number;
  coolant_temperature_c: number;
  engine_hours: number;
  fuel_level_percent: number;
  fuel_volume_litres: number;
  fuel_consumption_lph: number;
  estimated_runtime_hours: number;
  battery_voltage: number;
  low_fuel_alarm: boolean;
  low_oil_pressure_alarm: boolean;
  high_temperature_alarm: boolean;
  low_battery_alarm: boolean;
  overload_alarm: boolean;
  communication_healthy: boolean;
  timestamp: string;
};

export type AtsTelemetry = {
  equipment_id: string;
  equipment_name: string;
  status: "NORMAL" | "EMERGENCY" | "TRANSFERING" | "FAULT" | "OFFLINE";
  utility_available: boolean;
  generator_available: boolean;
  connected_source: "UTILITY" | "GENERATOR" | "OFF";
  transfer_in_progress: boolean;
  transfer_time_seconds: number;
  time_on_emergency_seconds: number;
  voltage_ab: number;
  voltage_bc: number;
  voltage_ca: number;
  current_a: number;
  current_b: number;
  current_c: number;
  frequency: number;
  active_power_kw: number;
  apparent_power_kva: number;
  power_factor: number;
  load_percentage: number;
  fault_active: boolean;
  communication_healthy: boolean;
  timestamp: string;
};

export type TelemetrySnapshot = {
  customer: { id: string; name: string };
  site: { id: string; name: string };
  system: { id: string; name: string };
  refresh_interval_ms: number;
  generators: GeneratorTelemetry[];
  ats: AtsTelemetry[];
  storage?: { engine: string; url: string; org: string; bucket: string; measurement: string; has_data: boolean };
};

/** Temporary JSON telemetry source. Replace this fetch with the telemetry API after MQTT ingestion is available. */
export function useTelemetry(systemId?: string) {
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        const isHassenfeld = systemId === "SYS-0006";
        const snapshot = isHassenfeld
          ? (await api.get<TelemetrySnapshot>(`/api/telemetry/systems/${systemId}/latest`)).data
          : await fetch(`/data/telemetry.json?_=${Date.now()}`, { cache: "no-store" }).then((response) => {
              if (!response.ok) throw new Error("Unable to load telemetry fixture");
              return response.json() as Promise<TelemetrySnapshot>;
            });
        if (!active) return;
        setTelemetry(snapshot);
        setError(null);
        timer = window.setTimeout(load, snapshot.refresh_interval_ms || 5000);
      } catch (error) {
        console.warn("Telemetry fixture could not be loaded", error);
        if (active) setError(systemId === "SYS-0006" ? "Live MQTT telemetry is unavailable." : "Telemetry data could not be loaded. Check frontend/public/data/telemetry.json.");
        if (active) timer = window.setTimeout(load, 5000);
      }
    };
    void load();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [systemId]);

  return { telemetry, error };
}

/** Convenience hook for screens that only need the latest snapshot. */
export function useTelemetrySnapshot(systemId?: string) {
  return useTelemetry(systemId).telemetry;
}

export function telemetryFor<T extends { equipment_id: string; equipment_name: string }>(items: T[] | undefined, id: string, name: string) {
  const key = (value: string) => value.trim().toLowerCase();
  return items?.find((item) => item.equipment_id === id || key(item.equipment_name) === key(name));
}

const HISTORY_FIELDS = [
  "load_percentage", "active_power_kw", "voltage_ab", "voltage_bc", "voltage_ca",
  "current_a", "current_b", "current_c", "frequency", "power_factor",
  "fuel_level_percent", "coolant_temperature_c", "oil_pressure_psi",
] as const;
type HistoryField = (typeof HISTORY_FIELDS)[number];
export type TelemetryHistoryPoint = { t: number } & Partial<Record<HistoryField, number>>;
export type TelemetryHistory = Map<string, TelemetryHistoryPoint[]>;

export const historyKey = (type: "generator" | "ats", equipmentId: string) => `${type}:${equipmentId}`;

/** Wraps useTelemetry and accumulates a bounded in-memory trend buffer per equipment, sampled as snapshots arrive. */
export function useTelemetryHistory(maxPoints = 60) {
  const { telemetry, error } = useTelemetry();
  const historyRef = useRef<TelemetryHistory>(new Map());
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!telemetry) return;
    const sample = (key: string, item: Record<string, unknown>) => {
      const point: TelemetryHistoryPoint = { t: Date.now() };
      for (const field of HISTORY_FIELDS) {
        const value = item[field];
        if (typeof value === "number") point[field] = value;
      }
      const list = historyRef.current.get(key) || [];
      historyRef.current.set(key, [...list, point].slice(-maxPoints));
    };
    telemetry.generators.forEach((item) => sample(historyKey("generator", item.equipment_id), item));
    telemetry.ats.forEach((item) => sample(historyKey("ats", item.equipment_id), item));
    setTick((n) => n + 1);
  }, [telemetry, maxPoints]);

  return { telemetry, error, history: historyRef.current };
}
