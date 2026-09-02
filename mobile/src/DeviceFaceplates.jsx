import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { TestWizard } from "./TestWizard";
import { useTheme } from "./theme";
import { resolveAtsTelemetry, resolveGeneratorTelemetry } from "./telemetry";

const fmt = (value, digits = 1) => (typeof value === "number" ? value.toFixed(digits) : "000");

function formatDuration(seconds) {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Single-device popup opened by tapping an ATS/generator in the One-Line diagram — mirrors the
 * web app's equipment detail modal, reusing the same faceplate cards shown in the device list. */
export function EquipmentDetailModal({ kind, item, onClose }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  if (!item) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Pressable style={styles.modalClose} onPress={onClose}><Text style={styles.modalCloseText}>×</Text></Pressable>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {kind === "generator" ? <GeneratorFaceplate item={item} /> : <AtsFaceplate item={item} />}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function DeviceFaceplateScreen({ system, ats, generators, initialTab }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [tab, setTab] = useState(initialTab || (generators.length ? "generators" : "ats"));
  const [testTarget, setTestTarget] = useState(null);
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>{system.name} · Detail view</Text>
      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, tab === "generators" && styles.tabActive]} onPress={() => setTab("generators")}><Text style={[styles.tabText, tab === "generators" && styles.tabTextActive]}>Generators</Text></Pressable>
        <Pressable style={[styles.tab, tab === "ats" && styles.tabActiveAts]} onPress={() => setTab("ats")}><Text style={[styles.tabText, tab === "ats" && styles.tabTextActiveAts]}>ATS</Text></Pressable>
      </View>
      {tab === "generators" && generators.map((item) => <GeneratorFaceplate key={item.id} item={item} onTest={() => setTestTarget({ type: "generator", id: item.id })} />)}
      {tab === "generators" && generators.length === 0 && <Text style={styles.empty}>No generators registered</Text>}
      {tab === "ats" && ats.map((item) => <AtsFaceplate key={item.id} item={item} onTest={() => setTestTarget({ type: "ats", id: item.id })} />)}
      {tab === "ats" && ats.length === 0 && <Text style={styles.empty}>No ATS units registered</Text>}
      {testTarget && (
        <TestWizard
          systemName={system.name}
          ats={ats}
          generators={generators}
          initialTarget={testTarget}
          onClose={() => setTestTarget(null)}
        />
      )}
    </ScrollView>
  );
}

function Banner({ text, tone }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return <View style={[styles.banner, styles[`banner_${tone}`]]}><Text style={styles.bannerText}>{text}</Text></View>;
}

function SourceBox({ label, value, on, tone }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return (
    <View style={[styles.sourceBox, on && (tone === "emergency" ? styles.sourceBoxOnEmergency : styles.sourceBoxOnNormal)]}>
      <Text style={[styles.sourceBoxLabel, on && styles.sourceBoxLabelOn]}>{label}</Text>
      <Text style={[styles.sourceBoxValue, on && styles.sourceBoxValueOn]}>{value}</Text>
    </View>
  );
}

function ElecColumn({ title, rows }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return (
    <View style={styles.elecCol}>
      <Text style={styles.elecColHeader}>{title}</Text>
      {rows.map(([label, value]) => (
        <View style={styles.elecRow} key={label}><Text style={styles.elecRowLabel}>{label}</Text><Text style={styles.elecRowValue}>{value}</Text></View>
      ))}
    </View>
  );
}

/** Mirrors the web app's EquipmentFaceplate: status banner → Engine Data → Electrical Data (Voltage / Current / Power columns), with a fuel and a load bar. */
function GeneratorFaceplate({ item, onTest }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const data = resolveGeneratorTelemetry(item.id, item.name);
  const bannerText = data?.status === "RUNNING" ? "RUNNING" : data?.status === "FAULT" ? "FAULT" : data?.status === "TEST" ? "TEST MODE" : data?.status === "OFFLINE" ? "OFFLINE" : "READY";
  const bannerTone = bannerText === "FAULT" ? "emergency" : bannerText === "OFFLINE" ? "offline" : "ready";
  const loadPct = item.rated_kw && data?.active_power_kw ? Math.min(100, Math.round((data.active_power_kw / item.rated_kw) * 100)) : Math.round(data?.load_percentage ?? 0);
  const kva = data?.apparent_power_kva;
  const kw = data?.active_power_kw;
  const kvar = kva != null && kw != null ? Math.sqrt(Math.max(0, kva * kva - kw * kw)) : undefined;
  return (
    <View style={styles.faceplate}>
      <Text style={styles.faceplateName}>{item.name}</Text>
      <Text style={styles.faceplateMeta}>{[item.make, item.model].filter(Boolean).join(" · ") || "Not configured"}</Text>
      <Banner text={bannerText} tone={bannerTone} />

      <Text style={styles.sectionTitle}>Engine Data</Text>
      <View style={styles.grid}>
        <Reading label="Fuel" value={`${fmt(data?.fuel_level_percent, 0)}%`} />
        <Reading label="Hours" value={fmt(data?.engine_hours, 1)} />
        <Reading label="Oil PSI" value={fmt(data?.oil_pressure_psi, 0)} />
        <Reading label="H₂O Temp" value={`${fmt(data?.coolant_temperature_c, 0)}°`} />
        <Reading label="Battery" value={fmt(data?.battery_voltage, 1)} />
      </View>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, data?.fuel_level_percent ?? 0))}%` }]} /></View>
      <Text style={styles.barCaption}>Fuel Level {fmt(data?.fuel_level_percent, 0)}%</Text>

      <Text style={styles.sectionTitle}>Electrical Data</Text>
      <View style={styles.elecGrid}>
        <ElecColumn title="Voltage" rows={[["VAB", `${fmt(data?.voltage_ab, 0)} V`], ["VBC", `${fmt(data?.voltage_bc, 0)} V`], ["VCA", `${fmt(data?.voltage_ca, 0)} V`]]} />
        <ElecColumn title="Current" rows={[["Amps A", fmt(data?.current_a, 0)], ["Amps B", fmt(data?.current_b, 0)], ["Amps C", fmt(data?.current_c, 0)], ["Hz", fmt(data?.frequency, 0)]]} />
        <ElecColumn title="Power" rows={[["kW", fmt(kw, 0)], ["kVA", fmt(kva, 0)], ["kVAR", fmt(kvar, 0)], ["PF", fmt(data?.power_factor, 2)]]} />
      </View>
      <View style={styles.barTrack}><View style={[styles.barFill, styles.barFillBlue, { width: `${loadPct}%` }]} /></View>
      <Text style={styles.barCaption}>{fmt(data?.active_power_kw, 0)} kW ({loadPct}%)</Text>

      <View style={styles.footerRow}>
        <Footer label="Rated capacity" value={item.rated_kw ? `${item.rated_kw} kW` : "—"} />
        <Footer label="Rated current" value={item.rated_amps ? `${item.rated_amps} A` : "—"} />
        <Footer label="Rated voltage" value={item.rated_volts ? `${item.rated_volts} V` : "—"} />
      </View>
      {onTest && <Pressable style={styles.testBtn} onPress={onTest}><Text style={styles.testBtnText}>Test Gen</Text></Pressable>}
    </View>
  );
}

/** Mirrors the web app's EquipmentFaceplate for ATS: status banner → Source Status (Normal/Emergency
 * source, Connected To, Last Transfer or Time on Emergency) → Electrical Data → Connected Load. */
function AtsFaceplate({ item, onTest }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const data = resolveAtsTelemetry(item.id, item.name);
  const onNormal = data?.connected_source !== "GENERATOR";
  const emergencyConnected = !onNormal;
  const bannerText = data?.status === "EMERGENCY" ? "EMERGENCY" : data?.status === "FAULT" ? "FAULT" : data?.status === "TRANSFERING" ? "TRANSFERRING" : data?.status === "OFFLINE" ? "OFFLINE" : "READY";
  const bannerTone = bannerText === "EMERGENCY" || bannerText === "FAULT" ? "emergency" : bannerText === "OFFLINE" ? "offline" : "ready";
  const voltAn = data?.voltage_ab != null ? data.voltage_ab / Math.sqrt(3) : undefined;
  const voltBn = data?.voltage_bc != null ? data.voltage_bc / Math.sqrt(3) : undefined;
  const voltCn = data?.voltage_ca != null ? data.voltage_ca / Math.sqrt(3) : undefined;
  const branchLabel = item.branch === "life-safety" ? "Life Safety" : item.branch === "critical" ? "Critical" : "Equipment";
  return (
    <View style={styles.faceplate}>
      <Text style={styles.faceplateName}>{item.name}</Text>
      <Text style={styles.faceplateMeta}>{[item.manufacturer, item.model].filter(Boolean).join(" · ") || "Not configured"}{item.serial_number ? ` · ${item.serial_number}` : ""}</Text>
      <View style={styles.tagsRow}><Text style={styles.tag}>Branch: {branchLabel}</Text><Text style={styles.tag}>{item.rated_amps ?? "—"} A / {item.rated_volts ?? "—"} V</Text></View>
      <Banner text={bannerText} tone={bannerTone} />

      <Text style={styles.sectionTitle}>Source Status</Text>
      <View style={styles.sourceGrid}>
        <SourceBox label="Normal Source" tone="normal" on={onNormal} value={data && !data.utility_available ? "Unavailable" : onNormal ? "Available" : "Ready"} />
        <SourceBox label="Emergency Source" tone="emergency" on={!onNormal} value={data && !data.generator_available ? "Unavailable" : !onNormal ? "Available" : "Ready"} />
        <SourceBox label="Connected To" value={onNormal ? "Normal" : "Emergency"} />
        <SourceBox label={emergencyConnected ? "Time on Emergency" : "Last Transfer"} value={emergencyConnected ? formatDuration(data?.time_on_emergency_seconds) : "—"} />
      </View>

      <Text style={styles.sectionTitle}>Electrical Data</Text>
      <View style={styles.elecGrid}>
        <ElecColumn title="Voltage" rows={[["VAB", `${fmt(data?.voltage_ab, 0)} V`], ["VBC", `${fmt(data?.voltage_bc, 0)} V`], ["VCA", `${fmt(data?.voltage_ca, 0)} V`], ["VAN", `${fmt(voltAn, 0)} V`], ["VBN", `${fmt(voltBn, 0)} V`], ["VCN", `${fmt(voltCn, 0)} V`]]} />
        <ElecColumn title="Current" rows={[["Amps A", fmt(data?.current_a, 0)], ["Amps B", fmt(data?.current_b, 0)], ["Amps C", fmt(data?.current_c, 0)], ["Hz", fmt(data?.frequency, 0)]]} />
        <ElecColumn title="Power" rows={[["kW", fmt(data?.active_power_kw, 0)]]} />
      </View>

      <Text style={styles.sectionTitle}>Connected Load</Text>
      <View style={styles.loadBox}><Text style={styles.loadBoxText}>{branchLabel}</Text></View>

      {onTest && <Pressable style={styles.testBtn} onPress={onTest}><Text style={styles.testBtnText}>Test ATS</Text></Pressable>}
    </View>
  );
}

function Reading({ label, value }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return <View style={styles.readingBox}><Text style={styles.readingBoxLabel}>{label}</Text><Text style={styles.readingBoxValue}>{value}</Text></View>;
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
    tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 12 },
    tag: { fontSize: 10, fontWeight: "700", color: theme.textDim, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    banner: { borderRadius: 8, paddingVertical: 10, alignItems: "center", marginBottom: 14 },
    banner_ready: { backgroundColor: theme.green },
    banner_emergency: { backgroundColor: theme.red },
    banner_offline: { backgroundColor: theme.textMuted },
    bannerText: { color: "#fff", fontWeight: "800", fontSize: 13, letterSpacing: 0.6 },
    sectionTitle: { fontSize: 9.5, fontWeight: "800", color: theme.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
    readingBox: { width: "31%", backgroundColor: theme.surface2, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
    readingBoxLabel: { fontSize: 8, color: theme.textMuted, textTransform: "uppercase", textAlign: "center" },
    readingBoxValue: { fontSize: 14, fontWeight: "800", color: theme.text, marginTop: 3 },
    sourceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
    sourceBox: { width: "48%", backgroundColor: theme.surface2, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 10 },
    sourceBoxOnNormal: { backgroundColor: theme.green },
    sourceBoxOnEmergency: { backgroundColor: theme.red },
    sourceBoxLabel: { fontSize: 8.5, color: theme.textMuted, textTransform: "uppercase", fontWeight: "700" },
    sourceBoxLabelOn: { color: "rgba(255,255,255,0.85)" },
    sourceBoxValue: { fontSize: 13, fontWeight: "800", color: theme.text, marginTop: 3 },
    sourceBoxValueOn: { color: "#fff" },
    elecGrid: { flexDirection: "row", gap: 10, marginBottom: 4 },
    elecCol: { flex: 1 },
    elecColHeader: { fontSize: 9, fontWeight: "800", color: theme.textDim, textTransform: "uppercase", marginBottom: 6 },
    elecRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderColor: theme.border },
    elecRowLabel: { fontSize: 10.5, color: theme.textDim },
    elecRowValue: { fontSize: 11, fontWeight: "800", color: theme.text },
    barTrack: { height: 6, borderRadius: 4, backgroundColor: theme.surface2, overflow: "hidden", marginTop: 12 },
    barFill: { height: 6, backgroundColor: theme.green },
    barFillBlue: { backgroundColor: theme.blue },
    barCaption: { fontSize: 10, color: theme.textDim, marginTop: 6, marginBottom: 14 },
    loadBox: { backgroundColor: theme.surface2, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, alignSelf: "flex-start" },
    loadBoxText: { fontSize: 12, fontWeight: "800", color: theme.text },
    footerRow: { flexDirection: "row", gap: 8, marginTop: 14 },
    footerBox: { flex: 1, backgroundColor: theme.surface2, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
    footerBoxLabel: { fontSize: 8, color: theme.textMuted, textTransform: "uppercase" },
    footerBoxValue: { fontSize: 12, fontWeight: "800", color: theme.blue, marginTop: 3 },
    testBtn: { alignSelf: "flex-start", marginTop: 14, borderWidth: 1, borderColor: theme.blue, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14 },
    testBtnText: { fontSize: 11, fontWeight: "800", color: theme.blue },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 18 },
    modalCard: { backgroundColor: theme.surface, borderRadius: 16, maxHeight: "85%", borderWidth: 1, borderColor: theme.border, position: "relative", overflow: "hidden" },
    modalClose: { position: "absolute", top: 10, right: 10, zIndex: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: theme.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border },
    modalCloseText: { color: theme.text, fontSize: 16, fontWeight: "800", lineHeight: 18 },
    modalScroll: { padding: 16, paddingTop: 36 },
  });
}
