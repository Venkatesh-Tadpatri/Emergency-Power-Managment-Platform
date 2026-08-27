import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, FlatList, ImageBackground, Linking, Modal, Pressable, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { createAts, createGenerator, getAlarms, getAts, getCompanies, getGenerators, getMe, getOnCall, getPanels, getReports, getResellers, getSystems } from "./src/api";
import { HealthDonut } from "./src/HealthDonut";
import { clearToken, exchangeAuthorizationCode, readToken, redirectUri } from "./src/auth";
import { SolutionLogo } from "./src/SolutionLogo";
import { Landing } from "./src/Landing";
import { Customers, CustomerDetail, PlatformUsers, Resellers, ResellerDetail, SiteDetail, UserDetail } from "./src/AdminLists";
import { Analytics } from "./src/Analytics";
import { Drawer } from "./src/Drawer";
import { SLD } from "./src/SLD";
import { DeviceFaceplateScreen } from "./src/DeviceFaceplates";
import { TestWizard } from "./src/TestWizard";
import { roleName } from "./src/roles";
import { resolveAtsTelemetry, resolveGeneratorTelemetry } from "./src/telemetry";
import { ThemeProvider, useTheme } from "./src/theme";

const clientId = process.env.EXPO_PUBLIC_ZITADEL_CLIENT_ID;
WebBrowser.maybeCompleteAuthSession();

const SCREEN_TITLES = { home: "Dashboard", systems: "Systems", alarms: "Alarms", analytics: "Analytics", reports: "Reports", resellers: "Resellers", customers: "Customers", users: "Platform users", profile: "Profile" };

export default function App() {
  return <ThemeProvider><AppInner /></ThemeProvider>;
}

function AppInner() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [token, setToken] = useState(null), [me, setMe] = useState(null), [systems, setSystems] = useState([]), [alarms, setAlarms] = useState([]), [reports, setReports] = useState([]), [onCall, setOnCall] = useState([]);
  const [screen, setScreen] = useState("home"), [stack, setStack] = useState([]), [drawerOpen, setDrawerOpen] = useState(false), [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false);
  const push = (type, data) => setStack((s) => [...s, { type, data }]);
  const pop = () => setStack((s) => s.slice(0, -1));
  const navigate = (nextScreen) => { setScreen(nextScreen); setStack([]); setDrawerOpen(false); };
  const discovery = AuthSession.useAutoDiscovery(process.env.EXPO_PUBLIC_ZITADEL_AUTHORITY || "https://invalid.local");
  const [request, response, promptAsync] = AuthSession.useAuthRequest({ clientId, redirectUri, responseType: AuthSession.ResponseType.Code, scopes: ["openid", "profile", "email"], usePKCE: true, extraParams: { prompt: "login" } }, discovery);

  const load = async (accessToken = token) => {
    if (!accessToken) return;
    const profile = await getMe(accessToken);
    const [nextSystems, nextAlarms, nextReports, nextOnCall] = await Promise.all([
      getSystems(accessToken),
      getAlarms(profile, accessToken),
      getReports(accessToken, profile.company_id, profile.role === "superadmin"),
      getOnCall(profile.company_id, accessToken),
    ]);
    setMe(profile); setSystems(nextSystems); setAlarms(nextAlarms); setReports(nextReports); setOnCall(nextOnCall);
  };

  useEffect(() => { readToken().then(setToken).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (token) load().catch((error) => Alert.alert("Connection error", error.message)); }, [token]);
  useEffect(() => { if (response?.type === "success" && request && discovery) exchangeAuthorizationCode(response, request, discovery).then(setToken).catch((error) => Alert.alert("Sign-in failed", error.message)); }, [response, request, discovery]);

  const refresh = async () => { setRefreshing(true); try { await load(); } catch (error) { Alert.alert("Refresh failed", error.message); } finally { setRefreshing(false); } };
  const isSuperAdmin = me?.role === "superadmin";

  if (loading) return <Loading />;
  if (!token) return <Landing disabled={!request || !discovery} onSignIn={() => promptAsync()} />;
  if (stack.length) return <DetailScreen frame={stack[stack.length - 1]} token={token} onBack={pop} onPush={push} isSuperAdmin={isSuperAdmin} />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={theme.statusBar} />
      <View style={styles.header}>
        <Pressable style={styles.menuButton} onPress={() => setDrawerOpen(true)}><Text style={styles.menuIcon}>☰</Text></Pressable>
        <SolutionLogo width={40} />
        <Text style={styles.headerTitle}>{SCREEN_TITLES[screen]}</Text>
      </View>
      <View style={styles.body}>
        {screen === "home" && <Home me={me} systems={systems} alarms={alarms} reports={reports} onCall={onCall} refresh={refresh} refreshing={refreshing} isSuperAdmin={isSuperAdmin} token={token} onViewAlarms={() => navigate("alarms")} onNavigate={navigate} />}
        {screen === "systems" && <Systems systems={systems} onOpen={(s) => push("systemDetail", s)} refresh={refresh} refreshing={refreshing} isSuperAdmin={isSuperAdmin} token={token} />}
        {screen === "alarms" && <Alarms alarms={alarms} refresh={refresh} refreshing={refreshing} />}
        {screen === "reports" && <Reports reports={reports} onCall={onCall} refresh={refresh} refreshing={refreshing} />}
        {screen === "analytics" && <Analytics />}
        {screen === "resellers" && <Resellers token={token} onOpen={(r) => push("resellerDetail", r)} />}
        {screen === "customers" && <Customers token={token} onOpen={(c) => push("customerDetail", c)} />}
        {screen === "users" && <PlatformUsers token={token} isSuperAdmin={isSuperAdmin} onOpen={(u) => push("userDetail", u)} />}
        {screen === "profile" && <Profile me={me} onSignOut={() => clearToken().then(() => { setToken(null); setMe(null); navigate("home"); })} />}
      </View>
      <Drawer visible={drawerOpen} screen={screen} isSuperAdmin={isSuperAdmin} onSelect={navigate} onClose={() => setDrawerOpen(false)} />
    </SafeAreaView>
  );
}

function Home({ me, systems, alarms, reports, onCall, refresh, refreshing, isSuperAdmin, token, onViewAlarms, onNavigate }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const active = alarms.filter((alarm) => alarm.status === "active");
  const critical = new Set(["alarm", "emergency"]);
  const normalCount = systems.filter((s) => s.status === "normal").length;
  const criticalCount = systems.filter((s) => critical.has(s.status)).length;
  const warningCount = systems.length - normalCount - criticalCount;

  const [resellers, setResellers] = useState([]);
  const [companies, setCompanies] = useState([]);
  useEffect(() => {
    if (!isSuperAdmin) return;
    Promise.all([getResellers(token), getCompanies(token)]).then(([r, c]) => { setResellers(r); setCompanies(c); }).catch(() => {});
  }, [isSuperAdmin, token]);

  const rollups = resellers.map((reseller) => {
    const companyIds = new Set(companies.filter((c) => c.reseller_id === reseller.id).map((c) => c.id));
    const resellerSystems = systems.filter((s) => companyIds.has(s.company_id));
    return {
      reseller,
      customerCount: companyIds.size,
      systemCount: resellerSystems.length,
      normalCount: resellerSystems.filter((s) => s.status === "normal").length,
      eventCount: resellerSystems.filter((s) => s.status !== "normal").length,
    };
  });

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />} contentContainerStyle={styles.screen}>
      <ImageBackground source={require("./assets/power-continuity-hero.png")} style={styles.heroBanner} imageStyle={styles.heroBannerImage}>
        <View style={styles.heroBannerOverlay} />
        <Text style={styles.heroBannerKicker}>Critical Power Command</Text>
        <Text style={styles.heroBannerTitle}>Real-Time Power Visibility.{"\n"}Across Every Facility.</Text>
        <Text style={styles.heroBannerSubtitle}>Monitor and manage your critical power infrastructure — generators, ATS, and meters — from a single live view.</Text>
        <View style={styles.quickLinkRow}>
          <QuickLink label="Systems" icon="⚡" onPress={() => onNavigate("systems")} />
          {isSuperAdmin && <QuickLink label="Resellers" icon="◈" onPress={() => onNavigate("resellers")} />}
          {isSuperAdmin && <QuickLink label="Customers" icon="▦" onPress={() => onNavigate("customers")} />}
          <QuickLink label="Alarms" icon="⚠" onPress={() => onNavigate("alarms")} />
        </View>
      </ImageBackground>

      <Text style={styles.greeting}>Hello, {me?.display_name || me?.email || "there"}</Text>
      <Text style={styles.muted}>{roleName(me?.role)}</Text>
      <View style={styles.cardRow}>
        <Stat label="Systems" value={systems.length} />
        <Stat label="Normal" value={normalCount} green />
        <Stat label="Active" value={active.length} danger={active.length > 0} />
      </View>

      <Text style={styles.sectionTitle}>System health overview</Text>
      <HealthDonut normal={normalCount} warning={warningCount} critical={criticalCount} />

      {isSuperAdmin && rollups.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Reseller overview</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {rollups.map(({ reseller, customerCount, systemCount, normalCount: n, eventCount }) => (
              <View key={reseller.id} style={styles.rollupCard}>
                <Text style={styles.rollupName} numberOfLines={1}>{reseller.name}</Text>
                <View style={styles.rollupRow}><Text style={styles.rollupLabel}>Customers</Text><Text style={styles.rollupValue}>{customerCount}</Text></View>
                <View style={styles.rollupRow}><Text style={styles.rollupLabel}>Systems</Text><Text style={styles.rollupValue}>{systemCount}</Text></View>
                <View style={styles.rollupRow}><Text style={styles.rollupLabel}>Normal</Text><Text style={[styles.rollupValue, styles.green]}>{n}</Text></View>
                <View style={[styles.rollupRow, styles.rollupRowLast]}><Text style={styles.rollupLabel}>Events</Text><Text style={[styles.rollupValue, eventCount > 0 && styles.danger]}>{eventCount}</Text></View>
              </View>
            ))}
          </ScrollView>
        </>
      )}

      <View style={styles.sectionHeadRow}>
        <Text style={styles.sectionTitle}>Recent alarms</Text>
        {onViewAlarms && <Pressable onPress={onViewAlarms}><Text style={styles.viewAll}>View all</Text></Pressable>}
      </View>
      {active.slice(0, 3).map((alarm) => <AlarmCard key={alarm.id} alarm={alarm} />)}
      {active.length === 0 && <Empty text="No active alarms" />}
      <Text style={styles.sectionTitle}>Latest report</Text>
      {reports[0] ? <ReportCard report={reports[0]} /> : <Empty text="No reports available" />}
      {onCall[0] && <><Text style={styles.sectionTitle}>On-call coverage</Text><OnCallCard shift={onCall[0]} /></>}
    </ScrollView>
  );
}

function Systems({ systems, onOpen, refresh, refreshing, isSuperAdmin, token }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [resellers, setResellers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [resellerFilter, setResellerFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  useEffect(() => {
    if (!isSuperAdmin) return;
    Promise.all([getResellers(token), getCompanies(token)]).then(([r, c]) => { setResellers(r); setCompanies(c); }).catch(() => {});
  }, [isSuperAdmin, token]);

  const companyIdsForReseller = resellerFilter === "all" ? null : new Set(companies.filter((c) => c.reseller_id === resellerFilter).map((c) => c.id));
  const visibleCompanies = resellerFilter === "all" ? companies : companies.filter((c) => c.reseller_id === resellerFilter);
  const filtered = systems.filter((s) =>
    (companyFilter === "all" || s.company_id === companyFilter) &&
    (!companyIdsForReseller || companyIdsForReseller.has(s.company_id))
  );

  return (
    <FlatList
      style={styles.screen}
      data={filtered}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={
        <View>
          <Text style={styles.sectionTitle}>Authorized systems</Text>
          {resellers.length > 0 && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
                <Pressable style={[styles.filterChip, resellerFilter === "all" && styles.filterChipActive]} onPress={() => { setResellerFilter("all"); setCompanyFilter("all"); }}><Text style={[styles.filterChipText, resellerFilter === "all" && styles.filterChipTextActive]}>All resellers</Text></Pressable>
                {resellers.map((r) => (
                  <Pressable key={r.id} style={[styles.filterChip, resellerFilter === r.id && styles.filterChipActive]} onPress={() => { setResellerFilter(r.id); setCompanyFilter("all"); }}>
                    <Text style={[styles.filterChipText, resellerFilter === r.id && styles.filterChipTextActive]}>{r.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
                <Pressable style={[styles.filterChip, companyFilter === "all" && styles.filterChipActive]} onPress={() => setCompanyFilter("all")}><Text style={[styles.filterChipText, companyFilter === "all" && styles.filterChipTextActive]}>All companies</Text></Pressable>
                {visibleCompanies.map((c) => (
                  <Pressable key={c.id} style={[styles.filterChip, companyFilter === c.id && styles.filterChipActive]} onPress={() => setCompanyFilter(c.id)}>
                    <Text style={[styles.filterChipText, companyFilter === c.id && styles.filterChipTextActive]}>{c.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      }
      ListEmptyComponent={<Empty text="No systems match" />}
      renderItem={({ item }) => (
        <Pressable style={styles.listCard} onPress={() => onOpen(item)}>
          <View style={styles.cardCopy}><Text style={styles.listTitle}>{item.name}</Text><Text style={styles.muted}>{item.address || "No address configured"}</Text></View>
          <Status status={item.status} />
        </Pressable>
      )}
    />
  );
}

function Alarms({ alarms, refresh, refreshing }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return (
    <FlatList
      style={styles.screen}
      data={alarms}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={<Text style={styles.sectionTitle}>Alarms</Text>}
      ListEmptyComponent={<Empty text="No alarms available" />}
      renderItem={({ item }) => <AlarmCard alarm={item} />}
    />
  );
}

function Reports({ reports, onCall, refresh, refreshing }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />} contentContainerStyle={styles.screen}>
      <Text style={styles.sectionTitle}>Reports</Text>
      {reports.map((report) => <ReportCard key={report.id} report={report} />)}
      {reports.length === 0 && <Empty text="No reports available for your scope" />}
      <Text style={styles.sectionTitle}>On-call coverage</Text>
      {onCall.map((shift) => <OnCallCard key={shift.id} shift={shift} />)}
      {onCall.length === 0 && <Empty text="On-call coverage is available for customer-scoped users" />}
    </ScrollView>
  );
}

function SystemDetail({ system, token, isSuperAdmin, onPush }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [panelId, setPanelId] = useState(null);
  const [devices, setDevices] = useState({ ats: [], generators: [] });
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(null);
  const [testTarget, setTestTarget] = useState(null);

  const loadDevices = async (panel) => {
    const [ats, generators] = await Promise.all([getAts(panel, token), getGenerators(panel, token)]);
    setDevices({ ats, generators });
  };

  useEffect(() => {
    (async () => {
      try {
        const panels = await getPanels(system.id, token);
        const panel = panels[0];
        if (panel) {
          setPanelId(panel.id);
          await loadDevices(panel.id);
        }
      } catch (error) {
        Alert.alert("Could not load devices", error.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [system.id, token]);

  const openDirections = () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(system.lat && system.lng ? `${system.lat},${system.lng}` : system.address || system.name)}`);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {(system.address || system.lat) && <Pressable style={styles.directionsButton} onPress={openDirections}><Text style={styles.directionsText}>Open directions</Text></Pressable>}
      {loading ? <Loading /> : <SLD ats={devices.ats} generators={devices.generators} />}

      <View style={styles.sectionHeadRow}>
        <Text style={styles.sectionTitle}>Generators</Text>
        <View style={styles.headActions}>
          {!loading && devices.generators.length > 0 && <Pressable onPress={() => onPush("deviceFaceplate", { system, ats: devices.ats, generators: devices.generators, initialTab: "generators" })}><Text style={styles.viewAll}>View details</Text></Pressable>}
          {isSuperAdmin && panelId && <Pressable onPress={() => setAddModal("generator")}><Text style={styles.viewAll}>+ Add</Text></Pressable>}
        </View>
      </View>
      {!loading && devices.generators.map((item) => <GeneratorReadingCard key={item.id} item={item} onTest={() => setTestTarget({ type: "generator", id: item.id })} />)}
      {!loading && devices.generators.length === 0 && <Empty text="No generators" />}

      <View style={styles.sectionHeadRow}>
        <Text style={styles.sectionTitle}>Automatic transfer switches</Text>
        <View style={styles.headActions}>
          {!loading && devices.ats.length > 0 && <Pressable onPress={() => onPush("deviceFaceplate", { system, ats: devices.ats, generators: devices.generators, initialTab: "ats" })}><Text style={styles.viewAll}>View details</Text></Pressable>}
          {isSuperAdmin && panelId && <Pressable onPress={() => setAddModal("ats")}><Text style={styles.viewAll}>+ Add</Text></Pressable>}
        </View>
      </View>
      {!loading && devices.ats.map((item) => <AtsReadingCard key={item.id} item={item} onTest={() => setTestTarget({ type: "ats", id: item.id })} />)}
      {!loading && devices.ats.length === 0 && <Empty text="No ATS units" />}

      {addModal && (
        <AddDeviceModal
          kind={addModal}
          token={token}
          panelId={panelId}
          onClose={() => setAddModal(null)}
          onCreated={() => { setAddModal(null); loadDevices(panelId); }}
        />
      )}
      {testTarget && (
        <TestWizard
          systemName={system.name}
          ats={devices.ats}
          generators={devices.generators}
          initialTarget={testTarget}
          onClose={() => setTestTarget(null)}
        />
      )}
    </ScrollView>
  );
}

const fmt = (value, digits = 1) => (typeof value === "number" ? value.toFixed(digits) : "—");
const CRITICAL_STATUSES = new Set(["EMERGENCY", "FAULT", "ALARM"]);

function useBlink(active) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);
  return pulse;
}

function StatusPill({ status, live }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const critical = live && CRITICAL_STATUSES.has(status);
  const pulse = useBlink(critical);
  return (
    <Animated.View style={[styles.waitingPill, live && (critical ? styles.statusPillCritical : styles.statusPillLive), critical && { opacity: pulse }]}>
      <Text style={[styles.waitingText, live && (critical ? styles.statusTextCritical : styles.statusTextLive)]}>{status || "WAITING"}</Text>
    </Animated.View>
  );
}

function AtsReadingCard({ item, onTest }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const data = resolveAtsTelemetry(item.id, item.name);
  const onNormal = data?.connected_source !== "GENERATOR";
  const emergencyPulse = useBlink(!onNormal);
  const readings = [["VAB", fmt(data?.voltage_ab)], ["VBC", fmt(data?.voltage_bc)], ["VCA", fmt(data?.voltage_ca)], ["Hz", fmt(data?.frequency)], ["Amps A", fmt(data?.current_a)], ["Amps B", fmt(data?.current_b)], ["Amps C", fmt(data?.current_c)], ["kW", fmt(data?.active_power_kw)]];
  return (
    <View style={styles.readingCard}>
      <View style={styles.sectionHeadRow}>
        <Text style={styles.readingName}>{item.name}</Text>
        <StatusPill status={data?.status} live={Boolean(data)} />
      </View>
      <Text style={styles.muted}>{[item.manufacturer, item.model].filter(Boolean).join(" · ") || "Equipment not configured"}</Text>
      <View style={styles.sourceRow}>
        <View style={[styles.sourceBadge, onNormal && styles.sourceBadgeActiveNormal]}><Text style={onNormal ? styles.sourceBadgeText : styles.sourceBadgeTextDim}>N</Text></View>
        <Text style={[styles.sourceLabel, !onNormal && styles.sourceLabelEmergency]}>{data ? `Connected to ${onNormal ? "Normal" : "Emergency"}` : "Connected to Normal (default)"}</Text>
        <Animated.View style={[styles.sourceBadge, !onNormal && styles.sourceBadgeActiveEmergency, !onNormal && { opacity: emergencyPulse }]}><Text style={!onNormal ? styles.sourceBadgeText : styles.sourceBadgeTextDim}>E</Text></Animated.View>
      </View>
      <View style={styles.readingGrid}>{readings.map(([label, value]) => <ReadingCell key={label} label={label} value={value} />)}</View>
      <View style={styles.cardFooterRow}>
        <Text style={styles.equipmentMeta}>{item.rated_amps ?? "—"} A · {item.rated_volts ?? "—"} V{item.branch ? ` · ${item.branch}` : ""}</Text>
        {onTest && <Pressable style={styles.testBtn} onPress={onTest}><Text style={styles.testBtnText}>Test ATS</Text></Pressable>}
      </View>
    </View>
  );
}

function GeneratorReadingCard({ item, onTest }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const data = resolveGeneratorTelemetry(item.id, item.name);
  const readings = [["Oil PSI", fmt(data?.oil_pressure_psi)], ["H₂O temp", fmt(data?.coolant_temperature_c)], ["Batt volts", fmt(data?.battery_voltage)], ["Eng hours", fmt(data?.engine_hours)], ["VAB", fmt(data?.voltage_ab)], ["VBC", fmt(data?.voltage_bc)], ["VCA", fmt(data?.voltage_ca)], ["kW", fmt(data?.active_power_kw)]];
  return (
    <View style={styles.readingCard}>
      <View style={styles.sectionHeadRow}>
        <Text style={styles.readingName}>{item.name}</Text>
        <StatusPill status={data?.status} live={Boolean(data)} />
      </View>
      <Text style={styles.muted}>{[item.make, item.model].filter(Boolean).join(" · ") || "Equipment not configured"}</Text>
      <View style={styles.readingGrid}>{readings.map(([label, value]) => <ReadingCell key={label} label={label} value={value} />)}</View>
      <View style={styles.cardFooterRow}>
        <Text style={styles.equipmentMeta}>Rated {item.rated_kw ?? "—"} kW · {item.rated_amps ?? "—"} A · {item.rated_volts ?? "—"} V</Text>
        {onTest && <Pressable style={styles.testBtn} onPress={onTest}><Text style={styles.testBtnText}>Test Gen</Text></Pressable>}
      </View>
    </View>
  );
}

function ReadingCell({ label, value }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return <View style={styles.readingCell}><Text style={styles.readingCellLabel}>{label}</Text><Text style={styles.readingCellValue}>{value}</Text></View>;
}

const BRANCHES = [["equipment", "Equipment"], ["critical", "Critical"], ["life-safety", "Life Safety"]];

function AddDeviceModal({ kind, token, panelId, onClose, onCreated }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const isAts = kind === "ats";
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("equipment");
  const [makeOrManufacturer, setMakeOrManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [ratedKw, setRatedKw] = useState("");
  const [ratedVolts, setRatedVolts] = useState("");
  const [ratedAmps, setRatedAmps] = useState("");
  const [saving, setSaving] = useState(false);

  const num = (value) => (value.trim() ? Number(value) : null);

  const save = async () => {
    if (!name.trim()) { Alert.alert("Name is required"); return; }
    setSaving(true);
    try {
      if (isAts) {
        await createAts(token, {
          name: name.trim(), branch, manufacturer: makeOrManufacturer || null, model: model || null,
          serial_number: serialNumber || null, rated_amps: num(ratedAmps), rated_volts: num(ratedVolts), panel_id: panelId,
        });
      } else {
        await createGenerator(token, {
          name: name.trim(), make: makeOrManufacturer || null, model: model || null, serial_number: serialNumber || null,
          rated_kw: num(ratedKw), rated_volts: num(ratedVolts), rated_amps: num(ratedAmps), panel_id: panelId,
        });
      }
      onCreated();
    } catch (error) {
      Alert.alert("Could not add device", error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{isAts ? "Add ATS" : "Add generator"}</Text>
          <Text style={styles.inputLabel}>Name *</Text>
          <TextInput style={styles.input} placeholder={isAts ? "e.g. ATS-LS" : "e.g. GEN-1"} placeholderTextColor={theme.textMuted} value={name} onChangeText={setName} />
          {isAts && (
            <>
              <Text style={styles.inputLabel}>Branch *</Text>
              <View style={styles.branchRow}>
                {BRANCHES.map(([value, label]) => (
                  <Pressable key={value} style={[styles.branchChip, branch === value && styles.branchChipActive]} onPress={() => setBranch(value)}>
                    <Text style={[styles.branchChipText, branch === value && styles.branchChipTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <Text style={styles.inputLabel}>{isAts ? "Manufacturer" : "Make"}</Text>
          <TextInput style={styles.input} placeholderTextColor={theme.textMuted} value={makeOrManufacturer} onChangeText={setMakeOrManufacturer} />
          <Text style={styles.inputLabel}>Model</Text>
          <TextInput style={styles.input} placeholderTextColor={theme.textMuted} value={model} onChangeText={setModel} />
          <Text style={styles.inputLabel}>Serial number</Text>
          <TextInput style={styles.input} placeholderTextColor={theme.textMuted} value={serialNumber} onChangeText={setSerialNumber} />
          {!isAts && (
            <>
              <Text style={styles.inputLabel}>Rated kW</Text>
              <TextInput style={styles.input} placeholderTextColor={theme.textMuted} value={ratedKw} onChangeText={setRatedKw} keyboardType="numeric" />
            </>
          )}
          <View style={styles.fieldPairRow}>
            <View style={styles.fieldPair}>
              <Text style={styles.inputLabel}>Rated volts</Text>
              <TextInput style={styles.input} placeholderTextColor={theme.textMuted} value={ratedVolts} onChangeText={setRatedVolts} keyboardType="numeric" />
            </View>
            <View style={styles.fieldPair}>
              <Text style={styles.inputLabel}>Rated amps</Text>
              <TextInput style={styles.input} placeholderTextColor={theme.textMuted} value={ratedAmps} onChangeText={setRatedAmps} keyboardType="numeric" />
            </View>
          </View>
          <Pressable style={[styles.primaryButtonInline, saving && styles.disabled]} onPress={save} disabled={saving}><Text style={styles.primaryButtonInlineText}>{saving ? "Saving…" : "Add device"}</Text></Pressable>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></Pressable>
        </View>
      </ScrollView>
    </Modal>
  );
}

const DETAIL_TITLES = {
  resellerDetail: (d) => d.name,
  customerDetail: (d) => d.name,
  siteDetail: (d) => d.name,
  systemDetail: (d) => d.name,
  userDetail: (d) => d.display_name || d.email,
  deviceFaceplate: (d) => d.system.name,
};

function DetailScreen({ frame, token, onBack, onPush, isSuperAdmin }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.detailHeader}><Pressable onPress={onBack}><Text style={styles.back}>Back</Text></Pressable><Text style={styles.detailTitle}>{DETAIL_TITLES[frame.type](frame.data)}</Text></View>
      <View style={styles.body}>
        {frame.type === "resellerDetail" && <ResellerDetail reseller={frame.data} token={token} onOpenCustomer={(c) => onPush("customerDetail", c)} />}
        {frame.type === "customerDetail" && <CustomerDetail customer={frame.data} token={token} onOpenSite={(s) => onPush("siteDetail", s)} onOpenSystem={(s) => onPush("systemDetail", s)} />}
        {frame.type === "siteDetail" && <SiteDetail site={frame.data} token={token} onOpenSystem={(s) => onPush("systemDetail", s)} />}
        {frame.type === "systemDetail" && <SystemDetail system={frame.data} token={token} isSuperAdmin={isSuperAdmin} onPush={onPush} />}
        {frame.type === "userDetail" && <UserDetail user={frame.data} token={token} />}
        {frame.type === "deviceFaceplate" && <DeviceFaceplateScreen system={frame.data.system} ats={frame.data.ats} generators={frame.data.generators} initialTab={frame.data.initialTab} />}
      </View>
    </SafeAreaView>
  );
}

function Profile({ me, onSignOut }) {
  const { theme, toggleTheme } = useTheme();
  const styles = makeStyles(theme);
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.profileAvatar}><Text style={styles.avatarText}>{(me?.display_name || me?.email || "?").slice(0, 1).toUpperCase()}</Text></View>
      <Text style={styles.profileName}>{me?.display_name || "CPC user"}</Text>
      <Text style={styles.muted}>{me?.email}</Text>
      <View style={styles.profileCard}>
        <Text style={styles.muted}>ROLE</Text>
        <Text style={styles.listTitle}>{roleName(me?.role)}</Text>
        <Text style={styles.permission}>{me?.permissions?.manage_oncall ? "Can manage on-call schedules" : "Read-only mobile access"}</Text>
      </View>
      <Pressable style={styles.secondaryButton} onPress={toggleTheme}><Text style={styles.secondaryText}>{theme.mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}</Text></Pressable>
      <Pressable style={styles.secondaryButton} onPress={onSignOut}><Text style={styles.secondaryText}>Sign out</Text></Pressable>
    </ScrollView>
  );
}

function QuickLink({ label, icon, onPress }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return (
    <Pressable style={styles.quickLink} onPress={onPress}>
      <Text style={styles.quickLinkIcon}>{icon}</Text>
      <Text style={styles.quickLinkLabel}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value, green, danger }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return <View style={styles.stat}><Text style={[styles.statValue, green && styles.green, danger && styles.danger]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function Status({ status }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return <View style={[styles.status, status === "normal" ? styles.statusGood : styles.statusBad]}><Text style={[styles.statusText, status !== "normal" && styles.statusBadText]}>{(status || "unknown").toUpperCase()}</Text></View>;
}

function AlarmCard({ alarm }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return <View style={styles.alarm}><View style={styles.cardCopy}><Text style={styles.listTitle}>{alarm.device_label || "System alarm"}</Text><Text style={styles.muted}>{alarm.message}</Text></View><Status status={alarm.severity === "normal" ? "normal" : "alarm"} /></View>;
}

function ReportCard({ report }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return <View style={styles.listCard}><View style={styles.cardCopy}><Text style={styles.listTitle}>{report.report_code || "Power report"}</Text><Text style={styles.muted}>{report.type?.replace(/-/g, " ")} · {report.report_date}</Text>{report.duration_label && <Text style={styles.muted}>{report.duration_label}{report.peak_kw ? ` · Peak ${report.peak_kw} kW` : ""}</Text>}</View></View>;
}

function OnCallCard({ shift }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return <View style={styles.listCard}><View style={styles.cardCopy}><Text style={styles.listTitle}>{shift.primary_name}</Text><Text style={styles.muted}>{shift.day_label} · {shift.shift_label}</Text>{shift.secondary_name && <Text style={styles.muted}>Backup: {shift.secondary_name}</Text>}</View></View>;
}

function Empty({ text }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return <Text style={styles.empty}>{text}</Text>;
}

function Loading() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return <View style={styles.loading}><ActivityIndicator size="large" color={theme.blue} /></View>;
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    header: { height: 62, backgroundColor: theme.surface, borderBottomWidth: 1, borderColor: theme.border, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
    menuButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
    menuIcon: { fontSize: 20, color: theme.text },
    headerTitle: { fontWeight: "700", fontSize: 17, color: theme.text },
    body: { flex: 1 },
    screen: { padding: 16, paddingBottom: 28 },
    greeting: { fontSize: 22, fontWeight: "800", color: theme.text },
    muted: { fontSize: 13, color: theme.textDim, marginTop: 3 },
    cardRow: { flexDirection: "row", gap: 8, marginVertical: 20 },
    stat: { flex: 1, backgroundColor: theme.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
    statValue: { fontSize: 23, fontWeight: "800", color: theme.text },
    statLabel: { fontSize: 11, color: theme.textDim, marginTop: 5 },
    green: { color: theme.green },
    danger: { color: theme.red },
    sectionTitle: { fontSize: 17, fontWeight: "800", color: theme.text, marginTop: 16, marginBottom: 10 },
    sectionHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    viewAll: { color: theme.blue, fontWeight: "700", fontSize: 12 },
    headActions: { flexDirection: "row", gap: 14 },
    filterChipRow: { gap: 8, paddingBottom: 10 },
    filterChip: { borderWidth: 1, borderColor: theme.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: theme.surface },
    filterChipActive: { backgroundColor: theme.blueSoft, borderColor: theme.blue },
    filterChipText: { fontSize: 12, color: theme.textDim, fontWeight: "600" },
    filterChipTextActive: { color: theme.blue, fontWeight: "800" },
    heroBanner: { minHeight: 210, borderRadius: 16, overflow: "hidden", padding: 18, justifyContent: "flex-end", marginBottom: 6 },
    heroBannerImage: { resizeMode: "cover" },
    heroBannerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(2,12,29,0.72)" },
    heroBannerKicker: { fontSize: 10, fontWeight: "800", color: "#5ba7ff", letterSpacing: 0.6, textTransform: "uppercase" },
    heroBannerTitle: { fontSize: 21, fontWeight: "800", color: "#fff", marginTop: 6, lineHeight: 26 },
    heroBannerSubtitle: { fontSize: 12, color: "#cbd7e9", marginTop: 8, lineHeight: 17 },
    quickLinkRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
    quickLink: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
    quickLinkIcon: { fontSize: 13, color: "#fff" },
    quickLinkLabel: { fontSize: 11.5, color: "#fff", fontWeight: "700" },
    rollupCard: { width: 172, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 14 },
    rollupName: { fontSize: 13, fontWeight: "800", color: theme.text, marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderColor: theme.border },
    rollupRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderColor: theme.surface2 },
    rollupRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
    rollupValue: { fontSize: 14, fontWeight: "800", color: theme.text, minWidth: 26, textAlign: "right" },
    rollupLabel: { fontSize: 10.5, color: theme.textDim, textTransform: "uppercase", letterSpacing: 0.3 },
    listCard: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 9, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    cardCopy: { flex: 1 },
    listTitle: { fontSize: 14, fontWeight: "700", color: theme.text },
    status: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
    statusGood: { backgroundColor: theme.greenSoft },
    statusBad: { backgroundColor: theme.redSoft },
    statusText: { fontSize: 10, fontWeight: "800", color: theme.green },
    statusBadText: { color: theme.red },
    alarm: { backgroundColor: theme.surface, borderRadius: 12, padding: 14, marginBottom: 9, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderLeftWidth: 3, borderLeftColor: theme.red },
    empty: { color: theme.textMuted, textAlign: "center", padding: 24 },
    loading: { flex: 1, justifyContent: "center", alignItems: "center", minHeight: 120 },
    detailHeader: { backgroundColor: theme.surface, padding: 16, borderBottomWidth: 1, borderColor: theme.border },
    back: { color: theme.blue, fontWeight: "700", marginBottom: 8 },
    detailTitle: { fontSize: 20, fontWeight: "800", color: theme.text },
    directionsButton: { borderWidth: 1, borderColor: theme.blue, backgroundColor: theme.blueSoft, padding: 12, borderRadius: 10, alignItems: "center", marginBottom: 16 },
    directionsText: { color: theme.blue, fontWeight: "700" },
    profileAvatar: { backgroundColor: "#8b5cf6", width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginTop: 18 },
    avatarText: { color: "#fff", fontSize: 28, fontWeight: "800" },
    profileName: { fontSize: 20, fontWeight: "800", marginTop: 12, color: theme.text },
    profileCard: { backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 16, marginTop: 24 },
    permission: { fontSize: 13, color: theme.textDim, marginTop: 8 },
    secondaryButton: { borderWidth: 1, borderColor: theme.border, padding: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
    secondaryText: { fontWeight: "700", color: theme.text },
    readingCard: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 10 },
    readingName: { fontSize: 14, fontWeight: "800", color: theme.text },
    waitingPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
    waitingText: { fontSize: 10, fontWeight: "800", color: theme.textDim },
    statusPillLive: { backgroundColor: theme.greenSoft, borderColor: theme.green },
    statusTextLive: { color: theme.green },
    statusPillCritical: { backgroundColor: theme.redSoft, borderColor: theme.red },
    statusTextCritical: { color: theme.red },
    sourceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
    sourceBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
    sourceBadgeActiveNormal: { backgroundColor: theme.green, borderColor: theme.green },
    sourceBadgeActiveEmergency: { backgroundColor: theme.red, borderColor: theme.red },
    sourceBadgeText: { fontSize: 11, fontWeight: "800", color: "#fff" },
    sourceBadgeTextDim: { fontSize: 11, fontWeight: "800", color: theme.textMuted },
    sourceLabel: { fontSize: 11, color: theme.textDim, flex: 1 },
    sourceLabelEmergency: { color: theme.red, fontWeight: "800" },
    readingGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    readingCell: { width: "23%", backgroundColor: theme.surface2, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
    readingCellLabel: { fontSize: 8.5, color: theme.textMuted, textTransform: "uppercase" },
    readingCellValue: { fontSize: 13, fontWeight: "800", color: theme.text, marginTop: 3 },
    equipmentMeta: { fontSize: 11, color: theme.textMuted, marginTop: 10 },
    cardFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
    testBtn: { borderWidth: 1, borderColor: theme.blue, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
    testBtnText: { fontSize: 10.5, fontWeight: "800", color: theme.blue },
    modalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
    modalScroll: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    modalScrollContent: { flexGrow: 1, justifyContent: "center", padding: 20 },
    modalCard: { backgroundColor: theme.surface, borderRadius: 14, padding: 20 },
    modalTitle: { fontSize: 16, fontWeight: "800", color: theme.text, marginBottom: 14 },
    inputLabel: { fontSize: 11, fontWeight: "700", color: theme.textDim, marginBottom: 5 },
    input: { borderWidth: 1, borderColor: theme.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: theme.text, fontSize: 14, marginBottom: 12, backgroundColor: theme.surface2 },
    branchRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    branchChip: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 9, alignItems: "center", backgroundColor: theme.surface2 },
    branchChipActive: { backgroundColor: theme.blueSoft, borderColor: theme.blue },
    branchChipText: { fontSize: 11, color: theme.textDim, fontWeight: "700" },
    branchChipTextActive: { color: theme.blue },
    fieldPairRow: { flexDirection: "row", gap: 10 },
    fieldPair: { flex: 1 },
    primaryButtonInline: { backgroundColor: theme.blue, paddingVertical: 13, borderRadius: 9, alignItems: "center", marginTop: 4 },
    primaryButtonInlineText: { color: "#fff", fontWeight: "800" },
    modalCancel: { textAlign: "center", color: theme.textDim, fontWeight: "700", marginTop: 14 },
  });
}
