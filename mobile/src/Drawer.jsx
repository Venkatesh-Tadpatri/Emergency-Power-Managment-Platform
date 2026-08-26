import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SolutionLogo } from "./SolutionLogo";
import { useTheme } from "./theme";

const sections = (isSuperAdmin) => [
  { label: "Overview", items: [["home", "Dashboard"], ["systems", "Systems"]] },
  ...(isSuperAdmin ? [{ label: "Hierarchy", items: [["resellers", "Resellers"], ["customers", "Customers"]] }] : []),
  { label: "Monitoring", items: [["alarms", "Alarms"], ["analytics", "Analytics"]] },
  { label: "Platform", items: [...(isSuperAdmin ? [["users", "Platform users"]] : []), ["reports", "Reports"], ["profile", "Profile"]] },
];

export function Drawer({ visible, screen, isSuperAdmin, onSelect, onClose }) {
  const { theme, toggleTheme } = useTheme();
  const styles = makeStyles(theme);
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.panel}>
        <ScrollView contentContainerStyle={styles.panelContent}>
          <View style={styles.brand}>
            <SolutionLogo width={56} />
            <View>
              <Text style={styles.brandTitle}>CPC</Text>
              <Text style={styles.brandSubtitle}>Critical Power Command</Text>
            </View>
          </View>
          {sections(isSuperAdmin).map((section) => (
            <View key={section.label} style={styles.section}>
              <Text style={styles.sectionLabel}>{section.label}</Text>
              {section.items.map(([key, label]) => (
                <Pressable key={key} style={[styles.item, screen === key && styles.itemActive]} onPress={() => onSelect(key)}>
                  <Text style={[styles.itemText, screen === key && styles.itemTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          ))}
          <Pressable style={styles.themeToggle} onPress={toggleTheme}>
            <Text style={styles.themeToggleText}>{theme.mode === "dark" ? "☀  Light mode" : "◐  Dark mode"}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)" },
    panel: { position: "absolute", top: 0, bottom: 0, left: 0, width: "78%", maxWidth: 300, backgroundColor: theme.surface },
    panelContent: { paddingTop: 56, paddingBottom: 30, paddingHorizontal: 16 },
    brand: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderColor: theme.border },
    brandTitle: { fontSize: 16, fontWeight: "800", color: theme.text },
    brandSubtitle: { fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: 0.4 },
    section: { marginBottom: 18 },
    sectionLabel: { fontSize: 10, fontWeight: "800", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
    item: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: 9 },
    itemActive: { backgroundColor: theme.blueSoft },
    itemText: { fontSize: 14, fontWeight: "600", color: theme.textDim },
    itemTextActive: { color: theme.blue, fontWeight: "800" },
    themeToggle: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: theme.border },
    themeToggleText: { fontSize: 13, fontWeight: "700", color: theme.text },
  });
}
