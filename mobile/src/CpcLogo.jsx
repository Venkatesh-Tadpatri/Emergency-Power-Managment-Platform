import { Image, StyleSheet, Text, View } from "react-native";

const logoSource = require("../assets/cpc-logo.png");

export function CpcLogo({ width = 140, showTagline = false, light = false }) {
  return (
    <View style={[styles.container, { width }]}>
      <Image source={logoSource} accessibilityLabel="CPC" resizeMode="contain" style={{ width, height: width * (213 / 480) }} />
      {showTagline && <Text style={[styles.tagline, light && styles.taglineLight]}>Critical Infrastructure. Managed.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center" },
  tagline: { color: "#475569", fontSize: 8, fontWeight: "700", letterSpacing: 0.25, marginTop: 2, textAlign: "center" },
  taglineLight: { color: "#dbeafe" },
});
