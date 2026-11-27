import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { getTelemetryHistory } from "./api";
import { useTheme } from "./theme";

const RANGES = [["1h", "1H", 3600e3], ["6h", "6H", 6 * 3600e3], ["24h", "24H", 24 * 3600e3], ["7d", "7D", 7 * 24 * 3600e3], ["30d", "30D", 30 * 24 * 3600e3]];

const fmt = (value, decimals = 1, unit = "") => (value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(decimals)}${unit}`);
const hours = (h) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(h < 10 ? 1 : 0)} h`);
const values = (points, field) => points.map((p) => p[field]).filter((v) => typeof v === "number" && Number.isFinite(v));
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : undefined);

function summarize(device, windowSeconds, rangeMs) {
  const points = device.points;
  const bucketHours = windowSeconds / 3600;
  const kw = values(points, "active_power_kw");
  const summary = {
    availability: Math.min(100, (points.length / Math.max(1, Math.round(rangeMs / (windowSeconds * 1000)))) * 100),
    avgLoad: avg(values(points, "load_percentage")),
    peakKw: kw.length ? Math.max(...kw) : undefined,
    avgFrequency: avg(values(points, "frequency")),
  };
  if (device.equipment_type === "generator") {
    const states = points.filter((p) => p.running != null);
    summary.runHours = states.length ? states.filter((p) => p.running === 1).length * bucketHours : undefined;
  } else {
    const states = points.filter((p) => p.on_emergency != null);
    summary.emergencyHours = states.length ? states.filter((p) => p.on_emergency === 1).length * bucketHours : undefined;
    summary.transfers = states.length ? states.reduce((n, p, i) => n + (i > 0 && p.on_emergency === 1 && states[i - 1].on_emergency === 0 ? 1 : 0), 0) : undefined;
  }
  return summary;
}

/** Minimal line trend; gaps where readings are missing. */
function Sparkline({ points, field, color, start, end }) {
  const width = 300, height = 56;
  const data = points.filter((p) => typeof p[field] === "number");
  if (data.length < 2) return null;
  const vs = data.map((p) => p[field]);
  const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const x = (t) => ((t - start) / (end - start || 1)) * width;
  const y = (v) => height - 4 - ((v - lo) / span) * (height - 8);
  const d = data.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[field]).toFixed(1)}`).join(" ");
  return <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"><Path d={d} stroke={color} strokeWidth={2} fill="none" /></Svg>;
}

export function Analytics({ token, systems = [] }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const active = useMemo(() => systems.filter((s) => !s.archived), [systems]);
  const [systemId, setSystemId] = useState(null);
  const [range, setRange] = useState("24h");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!systemId && active.length) setSystemId(active[0].id); }, [active, systemId]);

  const load = async () => {
    if (!systemId) return;
    setLoading(true); setError(null);
    try { setData(await getTelemetryHistory(token, [systemId], range)); }
    catch (err) { setError(err.message); setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [systemId, range]); // eslint-disable-line react-hooks/exhaustive-deps

  const rangeMs = RANGES.find(([key]) => key === range)[2];
  const end = Date.now(), start = end - rangeMs;

  if (!active.length) return <View style={styles.center}><Text style={styles.muted}>No systems available for analytics.</Text></View>;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
        {active.map((s) => <Pressable key={s.id} onPress={() => setSystemId(s.id)} style={[styles.chip, s.id === systemId && styles.chipActive]}><Text style={[styles.chipText, s.id === systemId && styles.chipTextActive]}>{s.name}</Text></Pressable>)}
      </ScrollView>
      <View style={styles.rangeRow}>
        {RANGES.map(([key, label]) => <Pressable key={key} onPress={() => setRange(key)} style={[styles.rangeBtn, key === range && styles.rangeActive]}><Text style={[styles.rangeText, key === range && styles.chipTextActive]}>{label}</Text></Pressable>)}
      </View>
      {loading && !data && <ActivityIndicator style={{ marginTop: 24 }} />}
      {error && <Text style={styles.error}>{error}</Text>}
      {data && !data.devices.length && <Text style={styles.muted}>No monitored equipment on this system.</Text>}
      {data?.devices.map((device) => {
        const s = summarize(device, data.window_seconds, rangeMs);
        const isGen = device.equipment_type === "generator";
        return (
          <View key={device.equipment_id} style={styles.card}>
            <Text style={styles.kind}>{isGen ? "GENERATOR" : "TRANSFER SWITCH"}</Text>
            <Text style={styles.title}>{device.equipment_name}</Text>
            <View style={styles.statRow}>
              {isGen ? <>
                <Stat styles={styles} label="Run time" value={hours(s.runHours)} />
                <Stat styles={styles} label="Avg load" value={fmt(s.avgLoad, 1, "%")} />
              </> : <>
                <Stat styles={styles} label="Transfers" value={s.transfers == null ? "—" : String(s.transfers)} />
                <Stat styles={styles} label="On emergency" value={hours(s.emergencyHours)} />
              </>}
              <Stat styles={styles} label="Peak" value={fmt(s.peakKw, 1, " kW")} />
              <Stat styles={styles} label="Data" value={fmt(s.availability, 0, "%")} />
            </View>
            <Text style={styles.chartLabel}>Active power · last {range}</Text>
            <Sparkline points={device.points} field="active_power_kw" color={theme.blue} start={start} end={end} />
            {!device.points.some((p) => typeof p.active_power_kw === "number") && <Text style={styles.muted}>No power readings in this range.</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Stat({ styles, label, value }) {
  return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>;
}

function makeStyles(theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    content: { padding: 14, paddingBottom: 32 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: theme.bg },
    muted: { fontSize: 13, color: theme.textDim, textAlign: "center", marginVertical: 10 },
    error: { color: "#dc2626", fontSize: 13, marginVertical: 10, textAlign: "center" },
    chips: { flexGrow: 0, marginBottom: 10 },
    chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, marginRight: 8 },
    chipActive: { backgroundColor: theme.blue, borderColor: theme.blue },
    chipText: { color: theme.textDim, fontWeight: "700", fontSize: 12 },
    chipTextActive: { color: "#fff" },
    rangeRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
    rangeBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
    rangeActive: { backgroundColor: theme.blue, borderColor: theme.blue },
    rangeText: { color: theme.textDim, fontWeight: "800", fontSize: 12 },
    card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 12 },
    kind: { color: theme.textDim, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
    title: { color: theme.text, fontSize: 16, fontWeight: "800", marginTop: 2, marginBottom: 10 },
    statRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
    stat: { width: "50%", paddingVertical: 6 },
    statLabel: { color: theme.textDim, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
    statValue: { color: theme.text, fontSize: 15, fontWeight: "800", marginTop: 2 },
    chartLabel: { color: theme.textDim, fontSize: 11, fontWeight: "700", marginBottom: 4 },
  });
}
