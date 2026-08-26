import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AtsSwitch } from "./AtsSwitch";
import { useTheme } from "./theme";
import { resolveAtsTelemetry, resolveGeneratorTelemetry } from "./telemetry";

const fmt = (value, digits = 1) => (typeof value === "number" ? value.toFixed(digits) : "000");

export function DeviceFaceplateScreen({ system, ats, generators, initialTab }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [tab, setTab] = useState(initialTab || (generators.length ? "generators" : "ats"));
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>{system.name} · Detail view</Text>
      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, tab === "generators" && styles.tabActive]} onPress={() => setTab("generators")}><Text style={[styles.tabText, tab === "generators" && styles.tabTextActive]}>Generators</Text></Pressable>
        <Pressable style={[styles.tab, tab === "ats" && styles.tabActiveAts]} onPress={() => setTab("ats")}><Text style={[styles.tabText, tab === "ats" && styles.tabTextActiveAts]}>ATS</Text></Pressable>
      </View>
      {tab === "generators" && generators.map((item) => <GeneratorFaceplate key={item.id} item={item} />)}
      {tab === "generators" && generators.length === 0 && <Text style={styles.empty}>No generators registered</Text>}
      {tab === "ats" && ats.map((item) => <AtsFaceplate key={item.id} item={item} />)}
      {tab === "ats" && ats.length === 0 && <Text style={styles.empty}>No ATS units registered</Text>}
    </ScrollView>
  );
}

function GeneratorFaceplate({ item }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const data = resolveGeneratorTelemetry(item.id, item.name);
  const readings = [["VAB", fmt(data?.voltage_ab)], ["VBC", fmt(data?.voltage_bc)], ["VCA", fmt(data?.voltage_ca)], ["Amps A", fmt(data?.current_a)], ["Amps B", fmt(data?.current_b)], ["Amps C", fmt(data?.current_c)], ["Oil pressure", fmt(data?.oil_pressure_psi)], ["Engine temp", fmt(data?.coolant_temperature_c)], ["Engine hours", fmt(data?.engine_hours)]];
  const loadPct = item.rated_kw && data?.active_power_kw ? Math.min(100, Math.round((data.active_power_kw / item.rated_kw) * 100)) : 0;
  return (
    <View style={styles.faceplate}>
      <Text style={styles.faceplateName}>{item.name}</Text>
      <Text style={styles.faceplateMeta}>{[item.make, item.model].filter(Boolean).join(" · ") || "Not configured"}</Text>
      <View style={styles.waitingRow}><View style={styles.waitingDot} /><Text style={styles.waitingLabel}>{data?.status || "WAITING"}</Text></View>
      <View style={styles.grid}>{readings.map(([label, value]) => <Reading key={label} label={label} value={value} wide={label === "Oil pressure" || label === "Engine temp" || label === "Engine hours"} />)}</View>
      <View style={styles.pfRow}>
        <Text style={styles.pfText}>Power factor {fmt(data?.power_factor, 2)}</Text>
        <Text style={styles.pfText}>Current load {fmt(data?.active_power_kw)} kW · {loadPct}%</Text>
      </View>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${loadPct}%` }]} /></View>
      <View style={styles.footerRow}>
        <Footer label="Rated capacity" value={item.rated_kw ? `${item.rated_kw} kW` : "—"} />
        <Footer label="Rated current" value={item.rated_amps ? `${item.rated_amps} A` : "—"} />
        <Footer label="Rated voltage" value={item.rated_volts ? `${item.rated_volts} V` : "—"} />
      </View>
    </View>
  );
}

function AtsFaceplate({ item }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const data = resolveAtsTelemetry(item.id, item.name);
  const onNormal = data?.connected_source !== "GENERATOR";
  const readings = [["VAB", fmt(data?.voltage_ab)], ["VBC", fmt(data?.voltage_bc)], ["VCA", fmt(data?.voltage_ca)], ["Hz", fmt(data?.frequency)], ["Amps A", fmt(data?.current_a)], ["Amps B", fmt(data?.current_b)], ["Amps C", fmt(data?.current_c)], ["kW", fmt(data?.active_power_kw)]];
  return (
    <View style={styles.faceplate}>
      <Text style={styles.faceplateName}>{item.name}</Text>
      <View style={styles.atsTop}>
        <AtsSwitch onNormal={onNormal} />
        <View style={styles.atsSourceLabels}>
          <View style={styles.sourceLabelRow}><View style={[styles.sourceDot, onNormal && styles.sourceDotActive]} /><Text style={styles.sourceLabelText}>Utility{!data ? " (default)" : ""}</Text></View>
          <View style={styles.sourceLabelRow}><View style={[styles.sourceDot, !onNormal && styles.sourceDotActive]} /><Text style={styles.sourceLabelText}>Emergency</Text></View>
        </View>
      </View>
      <Text style={styles.faceplateMeta}>{[item.manufacturer, item.model].filter(Boolean).join(" · ") || "Not configured"}</Text>
      <Text style={styles.faceplateMeta}>{item.serial_number || "Serial pending"}</Text>
      <View style={styles.grid}>{readings.map(([label, value]) => <Reading key={label} label={label} value={value} />)}</View>
      <Text style={styles.equipmentFooter}>{item.rated_amps ?? "—"} A · {item.rated_volts ?? "—"} V{item.branch ? ` · ${item.branch}` : ""}</Text>
    </View>
  );
}

function Reading({ label, value, wide }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return <View style={[styles.readingBox, wide && styles.readingBoxWide]}><Text style={styles.readingBoxLabel}>{label}</Text><Text style={styles.readingBoxValue}>{value}</Text></View>;
}

function Footer({ label, value }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return <View style={styles.footerBox}><Text style={styles.footerBoxLabel}>{label}</Text><Text style={styles.footerBoxValue}>{value}</Text></View>;
}

function makeStyles(theme) {
  return StyleSheet.create({
    screen: { padding: 16, paddingBottom: 28 },
    title: { fontSize: 16, fontWeight: "800", color: theme.text, marginBottom: 12 },
    tabRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center", borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
    tabActive: { backgroundColor: theme.blue, borderColor: theme.blue },
    tabActiveAts: { backgroundColor: theme.purple, borderColor: theme.purple },
    tabText: { fontSize: 12, fontWeight: "700", color: theme.textDim },
    tabTextActive: { color: "#fff" },
    tabTextActiveAts: { color: "#fff" },
    empty: { color: theme.textMuted, textAlign: "center", padding: 24 },
    faceplate: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 16, marginBottom: 14 },
    faceplateName: { fontSize: 15, fontWeight: "800", color: theme.text },
    faceplateMeta: { fontSize: 11.5, color: theme.textDim, marginTop: 3 },
    waitingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, marginBottom: 12 },
    waitingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.green },
    waitingLabel: { fontSize: 10, fontWeight: "800", color: theme.textDim, letterSpacing: 0.4 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    readingBox: { width: "31%", backgroundColor: theme.surface2, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
    readingBoxWide: { width: "31%" },
    readingBoxLabel: { fontSize: 8, color: theme.textMuted, textTransform: "uppercase", textAlign: "center" },
    readingBoxValue: { fontSize: 14, fontWeight: "800", color: theme.text, marginTop: 3 },
    pfRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, marginBottom: 6 },
    pfText: { fontSize: 10.5, color: theme.textDim },
    barTrack: { height: 6, borderRadius: 4, backgroundColor: theme.surface2, overflow: "hidden" },
    barFill: { height: 6, backgroundColor: theme.blue },
    footerRow: { flexDirection: "row", gap: 8, marginTop: 14 },
    footerBox: { flex: 1, backgroundColor: theme.surface2, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
    footerBoxLabel: { fontSize: 8, color: theme.textMuted, textTransform: "uppercase" },
    footerBoxValue: { fontSize: 12, fontWeight: "800", color: theme.blue, marginTop: 3 },
    equipmentFooter: { fontSize: 11, color: theme.textMuted, marginTop: 10 },
    atsTop: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10, marginBottom: 6 },
    atsSourceLabels: { gap: 8 },
    sourceLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    sourceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.border },
    sourceDotActive: { backgroundColor: theme.green },
    sourceLabelText: { fontSize: 11, color: theme.textDim },
  });
}
