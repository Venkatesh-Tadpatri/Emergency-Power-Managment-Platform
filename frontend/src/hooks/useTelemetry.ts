import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export type GeneratorTelemetry = {
  equipment_id: string;
  equipment_name: string;
  status: "READY" | "RUNNING" | "FAULT" | "OFFLINE" | "TEST";
  running: boolean;
  auto_mode: boolean;
  test_mode: boolean;
  fault_active: boolean;
  voltage_ab?: number;
  voltage_bc?: number;
  voltage_ca?: number;
  voltage_an?: number;
  voltage_bn?: number;
  voltage_cn?: number;
  current_a?: number;
  current_b?: number;
  current_c?: number;
  frequency?: number;
  active_power_kw?: number;
  apparent_power_kva?: number;
  power_factor?: number;
  load_percentage?: number;
  oil_pressure_psi?: number;
  coolant_temperature_c?: number;
  engine_hours?: number;
  fuel_level_percent?: number;
  fuel_volume_litres?: number;
  fuel_consumption_lph?: number;
  estimated_runtime_hours?: number;
  battery_voltage?: number;
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
  transfer_time_seconds?: number;
  time_on_emergency_seconds?: number;
  voltage_ab?: number;
  voltage_bc?: number;
  voltage_ca?: number;
  voltage_an?: number;
  voltage_bn?: number;
  voltage_cn?: number;
  current_a?: number;
  current_b?: number;
  current_c?: number;
  frequency?: number;
  active_power_kw?: number;
  apparent_power_kva?: number;
  power_factor?: number;
  load_percentage?: number;
  fault_active: boolean;
  communication_healthy: boolean;
  timestamp: string;
};

export type FuelTankTelemetry = {
  equipment_id: string;
  equipment_name: string;
  mqtt_topic?: string;
  timestamp?: string;
  communication_healthy: boolean;
  level_percent?: number;
  volume_gallons?: number;
};

export type TelemetrySnapshot = {
  customer: { id: string; name: string };
  site: { id: string; name: string };
  fuel_tanks?: FuelTankTelemetry[];
  system: { id: string; name: string };
  refresh_interval_ms: number;
  generators: GeneratorTelemetry[];
  ats: AtsTelemetry[];
  storage?: {
    engine: string;
    url: string;
    org: string;
    bucket: string;
    measurement: string;
    has_data: boolean;
    mqtt_connected: boolean;
    last_mqtt_topic: string | null;
    mqtt_error: string | null;
  };
};

/** Poll the system-scoped API; the backend enforces hierarchy and queries Influx by system_id. */
export function useTelemetry(systemId?: string) {
  const query = useQuery({
    queryKey: ["telemetry", systemId],
    queryFn: async () =>
      (await api.get<TelemetrySnapshot>(`/api/telemetry/systems/${systemId}/latest`, { timeout: 15_000 })).data,
    enabled: !!systemId,
    // Preserve the last successful snapshot across navigation and refresh it in the background.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 24 * 60 * 60_000,
    refetchInterval: (state) => state.state.data?.refresh_interval_ms || 5000,
    refetchIntervalInBackground: true,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    retry: 5,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });

  return {
    telemetry: query.data ?? null,
    error: query.error ? "Live telemetry refresh failed; showing the last received values." : null,
    isRefreshing: query.isFetching,
  };
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
  "voltage_an", "voltage_bn", "voltage_cn",
  "current_a", "current_b", "current_c", "frequency", "power_factor",
  "fuel_level_percent", "coolant_temperature_c", "oil_pressure_psi",
] as const;
type HistoryField = (typeof HISTORY_FIELDS)[number];
export type TelemetryHistoryPoint = { t: number } & Partial<Record<HistoryField, number>>;
export type TelemetryHistory = Map<string, TelemetryHistoryPoint[]>;

export const historyKey = (type: "generator" | "ats", equipmentId: string) => `${type}:${equipmentId}`;

/** Wraps useTelemetry and accumulates a bounded in-memory trend buffer per equipment, sampled as snapshots arrive. */
export function useTelemetryHistory(systemId?: string, maxPoints = 60) {
  const { telemetry, error } = useTelemetry(systemId);
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
