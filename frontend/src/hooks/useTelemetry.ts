import { useQueries, useQuery } from "@tanstack/react-query";
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
      (await api.get<TelemetrySnapshot>(`/api/telemetry/systems/${systemId}/latest`, { timeout: 5_000 })).data,
    enabled: !!systemId,
    // Preserve the last successful snapshot across navigation and refresh it in the background.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 24 * 60 * 60_000,
    refetchInterval: (state) => Math.max(state.state.data?.refresh_interval_ms || 10_000, 10_000),
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    retry: 1,
    retryDelay: 1_000,
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

/** Poll telemetry for overview screens that render more than one system. */
export function useTelemetrySnapshots(systemIds: string[]) {
  const ids = [...new Set(systemIds.filter(Boolean))];
  const queries = useQueries({
    queries: ids.map((systemId) => ({
      queryKey: ["telemetry", systemId],
      queryFn: async () =>
        (await api.get<TelemetrySnapshot>(`/api/telemetry/systems/${systemId}/latest`, { timeout: 5_000 })).data,
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: 24 * 60 * 60_000,
      refetchInterval: (state: { state: { data?: TelemetrySnapshot } }) => Math.max(state.state.data?.refresh_interval_ms || 30_000, 30_000),
      refetchIntervalInBackground: false,
      refetchOnMount: "always" as const,
      refetchOnReconnect: "always" as const,
      retry: 0,
    })),
  });

  return new Map(ids.map((id, index) => [id, queries[index]?.data ?? null]));
}

export function telemetryFor<T extends { equipment_id: string; equipment_name: string }>(items: T[] | undefined, id: string, name: string) {
  const key = (value: string) => value.trim().toLowerCase();
  return items?.find((item) => item.equipment_id === id || key(item.equipment_name) === key(name));
}

// ---------------------------------------------------------------------------
// Stored history (InfluxDB, bucketed by the backend) for the in-app analytics.
// ---------------------------------------------------------------------------

export const HISTORY_RANGES = [
  { key: "1h", label: "1H", ms: 60 * 60_000 },
  { key: "6h", label: "6H", ms: 6 * 60 * 60_000 },
  { key: "24h", label: "24H", ms: 24 * 60 * 60_000 },
  { key: "7d", label: "7D", ms: 7 * 24 * 60 * 60_000 },
  { key: "30d", label: "30D", ms: 30 * 24 * 60 * 60_000 },
] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number]["key"];

export type HistoryPoint = {
  t: number;
  voltage_ab?: number; voltage_bc?: number; voltage_ca?: number;
  voltage_an?: number; voltage_bn?: number; voltage_cn?: number;
  current_a?: number; current_b?: number; current_c?: number;
  active_power_kw?: number; apparent_power_kva?: number; reactive_power_kvar?: number;
  frequency?: number; power_factor?: number; load_percentage?: number;
  fuel_level_percent?: number; coolant_temperature_c?: number; oil_pressure_psi?: number;
  battery_voltage?: number; engine_hours?: number; transfer_time_seconds?: number;
  running?: 0 | 1; fault?: 0 | 1; on_emergency?: 0 | 1; utility_available?: 0 | 1;
};

export type DeviceHistory = {
  equipment_id: string;
  equipment_type: "generator" | "ats";
  equipment_name: string;
  system_id: string;
  rated_kw?: number | null;
  points: HistoryPoint[];
};

export type HistoryResponse = { range: HistoryRange; window_seconds: number; devices: DeviceHistory[] };

const MAX_HISTORY_SYSTEMS = 50;

/** Bucketed history for every monitored device in `systemIds` (or just `deviceId`). */
export function useDeviceHistory(systemIds: string[], range: HistoryRange, deviceId?: string) {
  const ids = [...new Set(systemIds.filter(Boolean))].sort().slice(0, MAX_HISTORY_SYSTEMS);
  const windowMs = HISTORY_RANGES.find((item) => item.key === range)!.ms;
  return useQuery({
    queryKey: ["telemetry-history", ids, range, deviceId ?? null],
    queryFn: async () => (await api.get<HistoryResponse>("/api/telemetry/history", {
      params: { system_ids: ids.join(","), range, ...(deviceId ? { device_id: deviceId } : {}) },
      timeout: 45_000,
    })).data,
    enabled: ids.length > 0,
    // Short ranges move quickly; long ranges barely change between refreshes.
    refetchInterval: windowMs <= 6 * 60 * 60_000 ? 60_000 : 5 * 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}
