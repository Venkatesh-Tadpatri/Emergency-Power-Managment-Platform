import { ImageBackground, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SolutionLogo } from "./SolutionLogo";

const FEATURES = [
  ["◉", "Live Monitoring", "See generator, ATS, fuel, and utility status in real time across every location.", "#2563eb", "#dbeafe"],
  ["♧", "Smart Alerts", "Route fault, low-fuel, and test notifications to the right people before issues escalate.", "#dc2626", "#fee2e2"],
  ["◇", "Remote Control", "Securely start, stop, and exercise supported equipment without travelling to the site.", "#7c3aed", "#ede9fe"],
  ["▣", "Compliance Reports", "Create audit-ready NFPA 110 records and recurring reports with a complete activity history.", "#16a34a", "#dcfce7"],
  ["□", "Test Management", "Plan scheduled tests, track completion, and keep every generator and ATS inspection on time.", "#ea580c", "#ffedd5"],
  ["◔", "Analytics Dashboard", "Compare uptime, alarms, load trends, and maintenance needs to make confident fleet decisions.", "#0891b2", "#cffafe"],
];

const PROOF = [
  ["99.8%", "Fleet uptime", "⏻", "#16a34a", "#dcfce7"],
  ["NFPA 110", "Compliant", "⛨", "#2563eb", "#dbeafe"],
  ["24/7", "Monitoring", "◔", "#7c3aed", "#ede9fe"],
  ["Multi-site", "Fleet view", "▣", "#c2410c", "#ffedd5"],
];

export function Landing({ disabled, onSignIn }) {
  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.navSafe}>
        <View style={styles.nav}>
          <SolutionLogo width={60} ink="#000" />
          <View>
            <Text style={styles.navTitle}>CPC</Text>
            <Text style={styles.navSubtitle}>Critical Power Command</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ImageBackground source={require("../assets/power-continuity-hero.png")} style={styles.hero} imageStyle={styles.heroImage}>
          <LinearGradient colors={["rgba(1,9,24,0.95)", "rgba(1,9,24,0.72)", "rgba(1,9,24,0.28)"]} style={StyleSheet.absoluteFill} />
          <View style={styles.heroContent}>
            <Text style={styles.kicker}>Critical Power Command</Text>
            <Text style={styles.headline}>Power Continuity.{"\n"}Complete <Text style={styles.headlineAccent}>Confidence.</Text></Text>
            <Text style={styles.lede}>Real-time monitoring, compliance reporting, and intelligent alerts for generators and transfer switches across every facility you manage — from a single sign-in.</Text>

            <View style={styles.liveRow}>
              <LiveCard icon="⌁" title="Generator-01" status="Running" detail="75% Load" />
              <LiveCard icon="⚡" title="Grid" status="Online" />
              <LiveCard icon="↕" title="ATS-01" status="Normal" />
            </View>

            <Pressable disabled={disabled} style={[styles.primaryButton, disabled && styles.disabled]} onPress={onSignIn}>
              <Text style={styles.primaryText}>Sign in securely</Text>
            </Pressable>
          </View>
        </ImageBackground>

        <View style={styles.body}>
          <View style={styles.proofGrid}>
            {PROOF.map(([value, label, icon, accent, soft]) => (
              <View key={label} style={[styles.proofCard, { borderTopColor: accent }]}>
                <View style={[styles.proofIconBox, { backgroundColor: soft }]}>
                  <Text style={[styles.proofIcon, { color: accent }]}>{icon}</Text>
                </View>
                <Text style={[styles.proofValue, { color: accent }]}>{value}</Text>
                <Text style={styles.proofLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionKicker}>Powering reliability</Text>
          <Text style={styles.sectionTitle}>Everything you need in one platform</Text>
          {FEATURES.map(([icon, title, text, accent, soft]) => (
            <View key={title} style={[styles.featureCard, { borderLeftColor: accent }]}>
              <View style={[styles.featureIconBox, { backgroundColor: soft }]}>
                <Text style={[styles.featureIcon, { color: accent }]}>{icon}</Text>
              </View>
              <Text style={styles.featureTitle}>{title}</Text>
              <Text style={styles.featureText}>{text}</Text>
            </View>
          ))}

          <View style={styles.quote}>
            <Text style={styles.quoteKicker}>Trusted by facility managers worldwide</Text>
            <Text style={styles.quoteText}>
              "CPC has transformed the way we manage our critical power systems. The visibility, alerts, and reporting help us stay compliant and prepared — always."
            </Text>
            <Text style={styles.quoteName}>Tadzi Radecki</Text>
            <Text style={styles.quoteRole}>Facilities Manager, Solution 61</Text>
          </View>

          <Pressable disabled={disabled} style={[styles.primaryButton, disabled && styles.disabled]} onPress={onSignIn}>
            <Text style={styles.primaryText}>Sign in to get started →</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <SolutionLogo width={110} ink="#fff" />
          <Text style={styles.footerBrand}>CPC</Text>
          <Text style={styles.footerTagline}>The most advanced platform for monitoring and managing generators, ATS, and critical power systems.</Text>
          <View style={styles.footerDivider} />
          <Text style={styles.footerCopy}>© 2026 CPC — Critical Power Command. All rights reserved.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function LiveCard({ icon, title, status, detail }) {
  return (
    <View style={styles.liveCard}>
      <Text style={styles.liveIcon}>{icon}</Text>
      <View>
        <Text style={styles.liveTitle}>{title}</Text>
        <Text style={styles.liveStatus}>{status}</Text>
        {detail && <Text style={styles.liveDetail}>{detail}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#020c1d" },
  navSafe: { backgroundColor: "#fff" },
  nav: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#e2e8f0" },
  navTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a" },
  navSubtitle: { fontSize: 9, color: "#64748b", letterSpacing: 0.4, textTransform: "uppercase" },
  scrollContent: { paddingBottom: 40, backgroundColor: "#f6f8fc" },
  hero: { minHeight: 560 },
  heroImage: { resizeMode: "cover" },
  heroContent: { padding: 20, paddingTop: 36, paddingBottom: 32 },
  kicker: { fontSize: 11, fontWeight: "800", color: "#5ba7ff", letterSpacing: 0.6, textTransform: "uppercase" },
  headline: { fontSize: 30, fontWeight: "800", color: "#fff", marginTop: 10, lineHeight: 36 },
  headlineAccent: { color: "#2278ff" },
  lede: { fontSize: 13.5, color: "#cbd7e9", marginTop: 14, lineHeight: 20 },
  liveRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 22 },
  liveCard: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(4,25,62,0.77)", borderWidth: 1, borderColor: "rgba(41,131,255,0.4)", borderRadius: 12, paddingVertical: 9, paddingHorizontal: 11 },
  liveIcon: { fontSize: 17, color: "#2db7ff" },
  liveTitle: { fontSize: 10, fontWeight: "800", color: "#fff", textTransform: "uppercase" },
  liveStatus: { fontSize: 11, color: "#21dd86", fontWeight: "700", marginTop: 2 },
  liveDetail: { fontSize: 9.5, color: "#9db0cd" },
  primaryButton: { backgroundColor: "#1469f5", paddingVertical: 15, borderRadius: 10, alignItems: "center", marginTop: 24, shadowColor: "#0052ff", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  disabled: { opacity: 0.5 },
  body: { padding: 20 },
  proofGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingBottom: 24, borderBottomWidth: 1, borderColor: "#e2e8f0" },
  proofCard: { width: "47%", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", borderTopWidth: 3, padding: 14, shadowColor: "#0f172a", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  proofIconBox: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  proofIcon: { fontSize: 15, fontWeight: "800" },
  proofValue: { fontSize: 18, fontWeight: "800" },
  proofLabel: { fontSize: 11, color: "#64748b", marginTop: 2, fontWeight: "600" },
  sectionKicker: { fontSize: 11, fontWeight: "800", color: "#1875ff", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 32 },
  sectionTitle: { fontSize: 21, fontWeight: "800", color: "#0f172a", marginTop: 6, marginBottom: 16 },
  featureCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderLeftWidth: 4, borderRadius: 12, padding: 16, marginBottom: 10, shadowColor: "#0f172a", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  featureIconBox: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  featureIcon: { fontSize: 17 },
  featureTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  featureText: { fontSize: 12.5, color: "#64748b", lineHeight: 18 },
  quote: { backgroundColor: "#f8fbff", borderWidth: 1, borderColor: "#dbe6f5", borderRadius: 14, padding: 20, marginTop: 28, alignItems: "center" },
  quoteKicker: { fontSize: 10.5, fontWeight: "800", color: "#1875ff", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10, textAlign: "center" },
  quoteText: { color: "#0f172a", fontSize: 15, lineHeight: 22, fontWeight: "700", textAlign: "center" },
  quoteName: { color: "#0f172a", fontSize: 13, fontWeight: "800", marginTop: 14 },
  quoteRole: { color: "#71819a", fontSize: 11, marginTop: 2 },
  footer: { backgroundColor: "#041227", padding: 24, alignItems: "flex-start" },
  footerBrand: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 10 },
  footerTagline: { color: "#91a8cb", fontSize: 12, lineHeight: 18, marginTop: 8 },
  footerDivider: { height: 1, backgroundColor: "rgba(171,205,255,0.15)", width: "100%", marginTop: 20, marginBottom: 14 },
  footerCopy: { color: "#91a8cb", fontSize: 10.5 },
});
