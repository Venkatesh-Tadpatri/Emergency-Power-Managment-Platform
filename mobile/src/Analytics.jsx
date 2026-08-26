import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useTheme } from "./theme";

const GRAFANA_BASE = (process.env.EXPO_PUBLIC_GRAFANA_URL || "").replace(/\/$/, "");
const DASHBOARD_URL = `${GRAFANA_BASE}/d/empm-system-overview/cpc-system-overview?orgId=1&kiosk=tv`;

export function Analytics() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [failed, setFailed] = useState(false);

  if (!GRAFANA_BASE || failed) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.title}>Analytics</Text>
        <Text style={styles.muted}>
          {!GRAFANA_BASE ? "Configure EXPO_PUBLIC_GRAFANA_URL in .env to view analytics." : "Could not load the embedded dashboard."}
        </Text>
        {!!GRAFANA_BASE && (
          <Pressable style={styles.button} onPress={() => Linking.openURL(DASHBOARD_URL)}>
            <Text style={styles.buttonText}>Open in Grafana ↗</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <WebView source={{ uri: DASHBOARD_URL }} onError={() => setFailed(true)} onHttpError={() => setFailed(true)} startInLoadingState style={styles.flex} />
      <Pressable style={styles.linkRow} onPress={() => Linking.openURL(DASHBOARD_URL)}>
        <Text style={styles.linkText}>Open full dashboard in Grafana ↗</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    fallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: theme.bg },
    title: { fontSize: 18, fontWeight: "800", color: theme.text, marginBottom: 8 },
    muted: { fontSize: 13, color: theme.textDim, textAlign: "center", marginBottom: 16 },
    button: { backgroundColor: theme.blue, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
    buttonText: { color: "#fff", fontWeight: "800" },
    linkRow: { padding: 12, alignItems: "center", borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
    linkText: { color: theme.blue, fontWeight: "700", fontSize: 12 },
  });
}
