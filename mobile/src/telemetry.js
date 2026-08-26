import telemetrySnapshot from "./data/telemetry.json";
import mepstraSnapshot from "./data/mepstra-telemetry.json";

const key = (value) => (value || "").trim().toLowerCase();

function findLive(items, id, name) {
  return items?.find((item) => item.equipment_id === id || key(item.equipment_name) === key(name));
}

const coversMepstra = (deviceId) => Boolean(deviceId && mepstraSnapshot.mepstra_device_ids.includes(deviceId));

function demoGenerator(deviceId) {
  if (!coversMepstra(deviceId)) return null;
  const r = mepstraSnapshot.generator_registers;
  return {
    status: r.GEN1_ALM ? "FAULT" : r.GEN1_RUN ? "RUNNING" : "READY",
    running: r.GEN1_RUN,
    fault_active: r.GEN1_ALM,
    voltage_ab: r.GEN1_VAB, voltage_bc: r.GEN1_VBC, voltage_ca: r.GEN1_VCA,
    current_a: r.GEN1_IA, current_b: r.GEN1_IB, current_c: r.GEN1_IC,
    frequency: r.GEN1_HZ,
    active_power_kw: r.GEN1_KW,
    power_factor: r.GEN1_PF,
    oil_pressure_psi: r.GEN1_OIL_PR,
    coolant_temperature_c: r.GEN1_CLNT_TMP,
    battery_voltage: r.GEN1_BAT_V,
    engine_hours: r.GEN1_RH,
    fuel_level_percent: r.GEN1_FUEL_LEV,
  };
}

function demoAts(deviceId) {
  if (!coversMepstra(deviceId)) return null;
  const r = mepstraSnapshot.ats_registers;
  return {
    status: "NORMAL",
    connected_source: r.ATS_NORM ? "UTILITY" : r.ATS_EMRG ? "GENERATOR" : "OFF",
    utility_available: r.ATS_NORM_AVL,
    generator_available: r.ATS_EMRG_AVL,
    voltage_ab: r.ATS_VAB, voltage_bc: r.ATS_VBC, voltage_ca: r.ATS_VCA,
    current_a: r.ATS_IA, current_b: r.ATS_IB, current_c: r.ATS_IC,
    frequency: r.ATS_HZ,
    active_power_kw: r.ATS_KW,
  };
}

/** Live telemetry fixture first (matched by id or name); falls back to the Mepstra demo register snapshot for the specific devices it covers. */
export function resolveGeneratorTelemetry(id, name) {
  return findLive(telemetrySnapshot.generators, id, name) || demoGenerator(id) || null;
}

export function resolveAtsTelemetry(id, name) {
  return findLive(telemetrySnapshot.ats, id, name) || demoAts(id) || null;
}
