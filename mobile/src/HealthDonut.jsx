import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "./theme";

const SIZE = 108;
const STROKE = 13;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function HealthDonut({ normal, warning, critical }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const total = normal + warning + critical || 1;
  const segments = [
    { value: normal, color: theme.green },
    { value: warning, color: "#f59e0b" },
    { value: critical, color: theme.red },
  ];

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const length = (s.value / total) * CIRCUMFERENCE;
      const arc = (
        <Circle
          key={i}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={s.color}
          strokeWidth={STROKE}
          strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
          strokeDashoffset={-offset}
          strokeLinecap="butt"
          fill="none"
        />
      );
      offset += length;
      return arc;
    });

  return (
    <View style={styles.row}>
      <View style={styles.ringWrap}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={theme.border} strokeWidth={STROKE} fill="none" />
          {arcs}
        </Svg>
        <View style={styles.ringCenter}><Text style={styles.ringValue}>{normal + warning + critical}</Text><Text style={styles.ringLabel}>Systems</Text></View>
      </View>
      <View style={styles.legend}>
        <LegendRow color={theme.green} label="Healthy" value={normal} total={total} />
        <LegendRow color="#f59e0b" label="Warning" value={warning} total={total} />
        <LegendRow color={theme.red} label="Critical" value={critical} total={total} />
      </View>
    </View>
  );
}

function LegendRow({ color, label, value, total }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value} ({pct}%)</Text>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 18, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 16 },
    ringWrap: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
    ringCenter: { position: "absolute", alignItems: "center" },
    ringValue: { fontSize: 22, fontWeight: "800", color: theme.text },
    ringLabel: { fontSize: 9, color: theme.textDim, textTransform: "uppercase" },
    legend: { flex: 1, gap: 8 },
    legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    legendLabel: { fontSize: 12, color: theme.textDim, flex: 1 },
    legendValue: { fontSize: 12, fontWeight: "800", color: theme.text },
  });
}
