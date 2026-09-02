import { useEffect, useRef, useState } from "react";
import { Alert, Animated, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { assignUserSystems, getAllAts, getAllGenerators, getAllPanels, getCompanies, getResellers, getSites, getSystems, getUsers } from "./api";
import { roleName } from "./roles";
import { useTheme } from "./theme";
import { resolveAtsTelemetry, resolveGeneratorTelemetry } from "./telemetry";
import { TestWizard } from "./TestWizard";

function useList(loader, deps) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      setItems(await loader());
    } catch (error) {
      Alert.alert("Could not load", error.message);
    }
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, deps);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  return { items, loading, refreshing, refresh };
}

function Avatar({ letter, color, styles }) {
  return <View style={[styles.avatar, { backgroundColor: color }]}><Text style={styles.avatarLetter}>{letter}</Text></View>;
}

function useBlink(active) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) { pulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);
  return pulse;
}

function StatusPill({ status, styles }) {
  const active = status === "active" || status === "normal";
  const emergency = status === "emergency";
  const pulse = useBlink(emergency);
  return (
    <Animated.View style={[styles.status, active ? styles.statusGood : styles.statusBad, emergency && { opacity: pulse }]}>
      <Text style={[styles.statusText, !active && styles.statusBadText]}>{(status || "unknown").toUpperCase()}</Text>
    </Animated.View>
  );
}

export function Resellers({ token, onOpen }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const { items, loading, refreshing, refresh } = useList(() => getResellers(token), [token]);
  return (
    <FlatList
      style={styles.list}
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={<Text style={styles.sectionTitle}>Reseller partners</Text>}
      ListEmptyComponent={!loading && <Text style={styles.empty}>No resellers available</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => onOpen(item)}>
          <View style={styles.cardTop}>
            <View style={styles.cardTitleRow}><Avatar letter="R" color={theme.purple} styles={styles} /><Text style={styles.name}>{item.name}</Text></View>
            <StatusPill status={item.status} styles={styles} />
          </View>
          {item.contact_name && <Text style={styles.muted}>{item.contact_name}</Text>}
          {item.contact_email && <Text style={styles.muted}>{item.contact_email}</Text>}
        </Pressable>
      )}
    />
  );
}

export function ResellerDetail({ reseller, token, onOpenCustomer }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const { items, loading, refreshing, refresh } = useList(() => getCompanies(token, reseller.id), [token, reseller.id]);
  return (
    <FlatList
      style={styles.list}
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={
        <View>
          <Text style={styles.sectionTitle}>{reseller.name}</Text>
          {reseller.contact_email && <Text style={styles.muted}>{reseller.contact_email}</Text>}
          <Text style={styles.subheading}>Customers</Text>
        </View>
      }
      ListEmptyComponent={!loading && <Text style={styles.empty}>No customers under this reseller</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => onOpenCustomer(item)}>
          <View style={styles.cardTop}>
            <View style={styles.cardTitleRow}><Avatar letter="C" color={theme.blue} styles={styles} /><Text style={styles.name}>{item.name}</Text></View>
            <StatusPill status={item.status} styles={styles} />
          </View>
          {item.address && <Text style={styles.muted}>{item.address}</Text>}
        </Pressable>
      )}
    />
  );
}

export function Customers({ token, onOpen }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const { items: resellers } = useList(() => getResellers(token), [token]);
  const { items, loading, refreshing, refresh } = useList(() => getCompanies(token), [token]);
  const [search, setSearch] = useState("");
  const [resellerFilter, setResellerFilter] = useState(null);
  const resellerName = (id) => resellers.find((r) => r.id === id)?.name;
  const filtered = items.filter((item) =>
    (!resellerFilter || item.reseller_id === resellerFilter) &&
    (!search.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase()))
  );
  return (
    <FlatList
      style={styles.list}
      data={filtered}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={
        <View>
          <Text style={styles.sectionTitle}>Customers</Text>
          <TextInput style={styles.search} placeholder="Search customers..." placeholderTextColor={theme.textMuted} value={search} onChangeText={setSearch} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Pressable style={[styles.chip, !resellerFilter && styles.chipActive]} onPress={() => setResellerFilter(null)}><Text style={[styles.chipText, !resellerFilter && styles.chipTextActive]}>All</Text></Pressable>
            {resellers.map((r) => (
              <Pressable key={r.id} style={[styles.chip, resellerFilter === r.id && styles.chipActive]} onPress={() => setResellerFilter(r.id)}>
                <Text style={[styles.chipText, resellerFilter === r.id && styles.chipTextActive]}>{r.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={!loading && <Text style={styles.empty}>No customers match</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => onOpen(item)}>
          <View style={styles.cardTop}>
            <View style={styles.cardTitleRow}><Avatar letter="C" color={theme.blue} styles={styles} /><Text style={styles.name}>{item.name}</Text></View>
            <StatusPill status={item.status} styles={styles} />
          </View>
          <Text style={styles.muted}>{resellerName(item.reseller_id) ? `Reseller: ${resellerName(item.reseller_id)}` : "No reseller assigned"}</Text>
          {item.address && <Text style={styles.muted}>{item.address}</Text>}
        </Pressable>
      )}
    />
  );
}

export function CustomerDetail({ customer, token, onOpenSite, onOpenSystem }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const { items: allSites, loading: loadingSites, refreshing, refresh: refreshSites } = useList(() => getSites(token, customer.id), [token, customer.id]);
  const { items: systems, loading: loadingSystems, refresh: refreshSystems } = useList(() => getSystems(token, { companyId: customer.id }), [token, customer.id]);
  const sites = allSites.filter((s) => s.status !== "archived");
  const unsitedSystems = systems.filter((s) => !s.site_id);
  const loading = loadingSites || loadingSystems;
  const refresh = async () => { await Promise.all([refreshSites(), refreshSystems()]); };
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />} contentContainerStyle={styles.list}>
      <Text style={styles.sectionTitle}>{customer.name}</Text>
      {customer.address && <Text style={styles.muted}>{customer.address}</Text>}
      <Text style={styles.subheading}>Sites</Text>
      {sites.map((site) => (
        <Pressable key={site.id} style={styles.card} onPress={() => onOpenSite(site)}>
          <View style={styles.cardTop}>
            <View style={styles.cardTitleRow}><Avatar letter="S" color={theme.cyan} styles={styles} /><Text style={styles.name}>{site.name}</Text></View>
            <StatusPill status={site.status} styles={styles} />
          </View>
          {site.address && <Text style={styles.muted}>{site.address}</Text>}
        </Pressable>
      ))}
      {!loading && sites.length === 0 && <Text style={styles.empty}>No sites registered</Text>}
      {unsitedSystems.length > 0 && (
        <>
          <Text style={styles.subheading}>Other systems</Text>
          {unsitedSystems.map((system) => (
            <Pressable key={system.id} style={styles.card} onPress={() => onOpenSystem(system)}>
              <View style={styles.cardTop}>
                <View style={styles.cardTitleRow}><Avatar letter="⚡" color={theme.green} styles={styles} /><Text style={styles.name}>{system.name}</Text></View>
                <StatusPill status={system.status} styles={styles} />
              </View>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

export function SiteDetail({ site, token, onOpenSystem }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const { items, loading, refreshing, refresh } = useList(() => getSystems(token, { siteId: site.id }), [token, site.id]);
  const [assetsBySystem, setAssetsBySystem] = useState({});
  const [testTarget, setTestTarget] = useState(null);

  // Bulk-fetch every panel/ATS/generator once and group client-side — mirrors the web app's
  // per-system stat cards (Utility / Generators / ATS) without an N+1 fetch per system.
  useEffect(() => {
    Promise.all([getAllPanels(token), getAllAts(token), getAllGenerators(token)])
      .then(([panels, ats, generators]) => {
        const panelsBySystem = {};
        panels.forEach((p) => { if (!panelsBySystem[p.system_id]) panelsBySystem[p.system_id] = []; panelsBySystem[p.system_id].push(p); });
        const atsByPanel = {};
        ats.forEach((a) => { if (!atsByPanel[a.panel_id]) atsByPanel[a.panel_id] = []; atsByPanel[a.panel_id].push(a); });
        const generatorsByPanel = {};
        generators.forEach((g) => { if (!generatorsByPanel[g.panel_id]) generatorsByPanel[g.panel_id] = []; generatorsByPanel[g.panel_id].push(g); });
        const map = {};
        Object.keys(panelsBySystem).forEach((systemId) => {
          const systemPanels = panelsBySystem[systemId];
          map[systemId] = {
            ats: systemPanels.flatMap((p) => atsByPanel[p.id] || []),
            generators: systemPanels.flatMap((p) => generatorsByPanel[p.id] || []),
          };
        });
        setAssetsBySystem(map);
      })
      .catch(() => {});
  }, [token]);

  return (
    <>
      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.sectionTitle}>{site.name}</Text>
            {site.address && <Text style={styles.muted}>{site.address}</Text>}
            <Text style={styles.subheading}>Equipment systems</Text>
          </View>
        }
        ListEmptyComponent={!loading && <Text style={styles.empty}>No systems registered at this site</Text>}
        renderItem={({ item }) => {
          const assets = assetsBySystem[item.id] || { ats: [], generators: [] };
          const generatorsReady = assets.generators.filter((g) => resolveGeneratorTelemetry(g.id, g.name)?.status !== "FAULT").length;
          const atsNormal = assets.ats.filter((a) => {
            const st = resolveAtsTelemetry(a.id, a.name)?.status || "NORMAL";
            return st !== "EMERGENCY" && st !== "FAULT";
          }).length;
          const utilityAvailable = assets.ats.length
            ? assets.ats.some((a) => resolveAtsTelemetry(a.id, a.name)?.utility_available)
            : item.status !== "offline";
          const onEmergency = assets.ats.some((a) => resolveAtsTelemetry(a.id, a.name)?.connected_source === "GENERATOR");
          const effectiveStatus = onEmergency ? "emergency" : item.status;
          return (
            <View style={styles.card}>
              <Pressable onPress={() => onOpenSystem(item, "details")}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTitleRow}><Avatar letter="⚡" color={theme.green} styles={styles} /><Text style={styles.name}>{item.name}</Text></View>
                  <StatusPill status={effectiveStatus} styles={styles} />
                </View>
              </Pressable>
              <View style={styles.statRow}>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel2}>Utility</Text>
                  <Text style={[styles.statValue2, utilityAvailable ? styles.statGood : styles.statBad]}>{utilityAvailable ? "Available" : "Unavailable"}</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel2}>Generators</Text>
                  <Text style={styles.statValue2}>{generatorsReady} / {assets.generators.length} Ready</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel2}>ATS</Text>
                  <Text style={styles.statValue2}>{atsNormal} / {assets.ats.length} Normal</Text>
                </View>
              </View>
              <View style={styles.actionRow}>
                <Pressable style={styles.actionBtn} onPress={() => onOpenSystem(item, "details")}><Text style={styles.actionBtnText}>Detail</Text></Pressable>
                <Pressable style={styles.actionBtn} onPress={() => onOpenSystem(item, "one-line")}><Text style={styles.actionBtnText}>One-Line</Text></Pressable>
                <Pressable style={styles.actionBtn} onPress={() => setTestTarget({ system: item, ats: assets.ats, generators: assets.generators })}><Text style={styles.actionBtnText}>Test</Text></Pressable>
              </View>
            </View>
          );
        }}
      />
      {testTarget && (
        <TestWizard
          systemName={testTarget.system.name}
          ats={testTarget.ats}
          generators={testTarget.generators}
          onClose={() => setTestTarget(null)}
        />
      )}
    </>
  );
}

const ROLES = [
  { value: "superadmin", label: "Superadmin" },
  { value: "reseller_admin", label: "Reseller Admin" },
  { value: "company_admin", label: "Customer Admin" },
  { value: "system_operator", label: "System Operator" },
  { value: "system_viewer", label: "System Viewer" },
];

export function PlatformUsers({ token, isSuperAdmin, onOpen }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const { items, loading, refreshing, refresh } = useList(() => getUsers(token, isSuperAdmin), [token, isSuperAdmin]);
  const { items: companies } = useList(() => (isSuperAdmin ? getCompanies(token) : Promise.resolve([])), [token, isSuperAdmin]);
  const [roleFilter, setRoleFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [search, setSearch] = useState("");
  const companyName = (id) => companies.find((c) => c.id === id)?.name;
  const filtered = items.filter((u) =>
    (roleFilter === "all" || u.role === roleFilter || (roleFilter === "unassigned" && !u.role)) &&
    (companyFilter === "all" || u.company_id === companyFilter) &&
    (!search.trim() || `${u.display_name || ""} ${u.email}`.toLowerCase().includes(search.trim().toLowerCase()))
  );
  return (
    <FlatList
      style={styles.list}
      data={filtered}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={
        <View>
          <Text style={styles.sectionTitle}>Platform users</Text>
          <TextInput style={styles.search} placeholder="Search by name or email..." placeholderTextColor={theme.textMuted} value={search} onChangeText={setSearch} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Pressable style={[styles.chip, roleFilter === "all" && styles.chipActive]} onPress={() => setRoleFilter("all")}><Text style={[styles.chipText, roleFilter === "all" && styles.chipTextActive]}>All roles</Text></Pressable>
            <Pressable style={[styles.chip, roleFilter === "unassigned" && styles.chipActive]} onPress={() => setRoleFilter("unassigned")}><Text style={[styles.chipText, roleFilter === "unassigned" && styles.chipTextActive]}>Unassigned</Text></Pressable>
            {ROLES.map((r) => (
              <Pressable key={r.value} style={[styles.chip, roleFilter === r.value && styles.chipActive]} onPress={() => setRoleFilter(r.value)}>
                <Text style={[styles.chipText, roleFilter === r.value && styles.chipTextActive]}>{r.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {companies.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Pressable style={[styles.chip, companyFilter === "all" && styles.chipActive]} onPress={() => setCompanyFilter("all")}><Text style={[styles.chipText, companyFilter === "all" && styles.chipTextActive]}>All companies</Text></Pressable>
              {companies.map((c) => (
                <Pressable key={c.id} style={[styles.chip, companyFilter === c.id && styles.chipActive]} onPress={() => setCompanyFilter(c.id)}>
                  <Text style={[styles.chipText, companyFilter === c.id && styles.chipTextActive]}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Text style={styles.countLabel}>{filtered.length} of {items.length} users</Text>
        </View>
      }
      ListEmptyComponent={!loading && <Text style={styles.empty}>{isSuperAdmin ? "No users match" : "Platform user browsing is available to superadmins"}</Text>}
      renderItem={({ item, index }) => (
        <Pressable style={styles.card} onPress={() => onOpen(item)}>
          <View style={styles.cardTop}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.slNo}>{String(index + 1).padStart(2, "0")}</Text>
              <Avatar letter={(item.display_name || item.email || "?").slice(0, 1).toUpperCase()} color={theme.purple} styles={styles} />
              <Text style={styles.name}>{item.display_name || item.email}</Text>
            </View>
            {!item.is_active && <View style={styles.status}><Text style={styles.statusText}>INACTIVE</Text></View>}
          </View>
          <Text style={styles.muted}>{item.email}</Text>
          <Text style={styles.role}>{roleName(item.role)}{item.company_id && companyName(item.company_id) ? ` · ${companyName(item.company_id)}` : ""}</Text>
        </Pressable>
      )}
    />
  );
}

export function UserDetail({ user, token }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const { items: systems, loading } = useList(() => (user.company_id ? getSystems(token, { companyId: user.company_id }) : Promise.resolve([])), [token, user.company_id]);
  const [selected, setSelected] = useState(new Set(user.assigned_system_ids || []));
  const [saving, setSaving] = useState(false);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async () => {
    setSaving(true);
    try {
      await assignUserSystems(token, user.id, Array.from(selected));
      Alert.alert("Saved", "System access updated for this user.");
    } catch (error) {
      Alert.alert("Could not save", error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.cardTitleRow}>
        <Avatar letter={(user.display_name || user.email || "?").slice(0, 1).toUpperCase()} color={theme.purple} styles={styles} />
        <View><Text style={styles.sectionTitle}>{user.display_name || user.email}</Text><Text style={styles.muted}>{user.email}</Text></View>
      </View>
      <Text style={styles.role}>{roleName(user.role)}</Text>
      {!user.company_id ? (
        <Text style={styles.empty}>System access assignment applies to customer-scoped users only.</Text>
      ) : (
        <>
          <Text style={styles.subheading}>System access</Text>
          {loading && <Text style={styles.muted}>Loading systems…</Text>}
          {!loading && systems.map((system) => (
            <Pressable key={system.id} style={styles.checkRow} onPress={() => toggle(system.id)}>
              <View style={[styles.checkbox, selected.has(system.id) && styles.checkboxActive]}>{selected.has(system.id) && <Text style={styles.checkmark}>✓</Text>}</View>
              <Text style={styles.checkLabel}>{system.name}</Text>
            </Pressable>
          ))}
          {!loading && systems.length === 0 && <Text style={styles.empty}>No systems available for this user's customer</Text>}
          <Pressable style={[styles.saveButton, saving && styles.disabled]} onPress={save} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save access"}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    list: { padding: 16 },
    sectionTitle: { fontSize: 17, fontWeight: "800", color: theme.text, marginBottom: 4 },
    subheading: { fontSize: 14, fontWeight: "800", color: theme.text, marginTop: 20, marginBottom: 10 },
    card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 9, shadowColor: "#000", shadowOpacity: theme.mode === "dark" ? 0 : 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
    cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
    avatar: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
    avatarLetter: { color: "#fff", fontSize: 13, fontWeight: "800" },
    name: { fontSize: 14, fontWeight: "700", color: theme.text, flexShrink: 1 },
    muted: { fontSize: 13, color: theme.textDim, marginTop: 3 },
    role: { fontSize: 12, color: theme.blue, fontWeight: "700", marginTop: 6, marginBottom: 6 },
    status: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: theme.redSoft },
    statusGood: { backgroundColor: theme.greenSoft },
    statusBad: { backgroundColor: theme.redSoft },
    statusText: { fontSize: 10, fontWeight: "800", color: theme.green },
    statusBadText: { color: theme.red },
    empty: { color: theme.textMuted, textAlign: "center", padding: 24 },
    search: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: theme.text, fontSize: 13, marginTop: 12, marginBottom: 10 },
    chipRow: { gap: 8, paddingBottom: 14 },
    chip: { borderWidth: 1, borderColor: theme.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: theme.surface },
    chipActive: { backgroundColor: theme.blueSoft, borderColor: theme.blue },
    chipText: { fontSize: 12, color: theme.textDim, fontWeight: "600" },
    chipTextActive: { color: theme.blue, fontWeight: "800" },
    countLabel: { fontSize: 11, color: theme.textDim, fontWeight: "700", marginBottom: 10 },
    slNo: { fontSize: 11, color: theme.textMuted, fontWeight: "700", width: 20 },
    checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.border },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
    checkboxActive: { backgroundColor: theme.blue, borderColor: theme.blue },
    checkmark: { color: "#fff", fontSize: 13, fontWeight: "800" },
    checkLabel: { fontSize: 14, color: theme.text, fontWeight: "600" },
    saveButton: { backgroundColor: theme.blue, paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 20 },
    saveButtonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
    disabled: { opacity: 0.6 },
    statRow: { flexDirection: "row", gap: 8, marginTop: 12 },
    statCol: { flex: 1, backgroundColor: theme.surface2, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 6, alignItems: "center" },
    statLabel2: { fontSize: 8.5, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.3, fontWeight: "700" },
    statValue2: { fontSize: 11.5, color: theme.text, fontWeight: "800", marginTop: 3, textAlign: "center" },
    statGood: { color: theme.green },
    statBad: { color: theme.red },
    actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
    actionBtn: { flex: 1, backgroundColor: theme.blue, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
    actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 11.5 },
  });
}
