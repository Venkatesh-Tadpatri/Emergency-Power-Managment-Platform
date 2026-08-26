import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";
import { useTheme } from "./theme";
import { resolveAtsTelemetry, resolveGeneratorTelemetry } from "./telemetry";

const PAD = 30;
const WIDTH = 340;

function xPositions(count) {
  if (count <= 0) return [];
  if (count === 1) return [WIDTH / 2];
  const usable = WIDTH - PAD * 2;
  return Array.from({ length: count }, (_, i) => PAD + (usable / (count - 1)) * i);
}

export function SLD({ ats, generators }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const normalBusY = 46;
  const atsY = 100;
  const emergencyBusY = 156;
  const genY = 210;
  const height = 252;

  const atsX = xPositions(ats.length);
  const genX = xPositions(generators.length);

  if (!ats.length && !generators.length) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Single line diagram</Text>
        <Text style={styles.empty}>No equipment registered for this system</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Single line diagram</Text>
      <Svg width="100%" height={height} viewBox={`0 0 ${WIDTH} ${height}`}>
        <SvgText x={PAD} y={normalBusY - 10} fontSize={9} fill={theme.textDim}>NORMAL BUS</SvgText>
        <Line x1={PAD} y1={normalBusY} x2={WIDTH - PAD} y2={normalBusY} stroke={theme.blue} strokeWidth={3} />

        <SvgText x={PAD} y={emergencyBusY + 16} fontSize={9} fill={theme.textDim}>EMERGENCY BUS</SvgText>
        <Line x1={PAD} y1={emergencyBusY} x2={WIDTH - PAD} y2={emergencyBusY} stroke={theme.green} strokeWidth={3} />

        {atsX.map((x, i) => {
          const item = ats[i];
          const data = resolveAtsTelemetry(item.id, item.name);
          const onEmergency = data?.connected_source === "GENERATOR";
          const accent = onEmergency ? theme.red : theme.blue;
          return (
            <G key={item.id}>
              <Line x1={x} y1={normalBusY} x2={x} y2={emergencyBusY} stroke={theme.border} strokeWidth={2} />
              <Circle cx={x} cy={atsY} r={12} fill={onEmergency ? theme.redSoft : theme.surface} stroke={accent} strokeWidth={2} />
              <SvgText x={x} y={atsY + 4} fontSize={9} fill={accent} textAnchor="middle" fontWeight="bold">ATS</SvgText>
              <Line x1={x} y1={atsY + 12} x2={x} y2={atsY + 34} stroke={theme.textMuted} strokeWidth={2} />
              <SvgText x={x} y={atsY + 46} fontSize={8} fill={theme.text} textAnchor="middle">{item.name}</SvgText>
            </G>
          );
        })}

        {genX.map((x, i) => {
          const item = generators[i];
          const data = resolveGeneratorTelemetry(item.id, item.name);
          const running = Boolean(data?.running);
          return (
            <G key={item.id}>
              <Line x1={x} y1={emergencyBusY} x2={x} y2={genY} stroke={theme.green} strokeWidth={running ? 3 : 2} />
              <Circle cx={x} cy={genY + 14} r={13} fill={running ? theme.green : theme.greenSoft} stroke={theme.green} strokeWidth={2} />
              <SvgText x={x} y={genY + 18} fontSize={9} fill={running ? "#fff" : theme.green} textAnchor="middle" fontWeight="bold">G</SvgText>
              <SvgText x={x} y={genY + 42} fontSize={8} fill={theme.text} textAnchor="middle">{item.name}</SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    wrap: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 16 },
    title: { fontSize: 13, fontWeight: "800", color: theme.text, marginBottom: 6 },
    empty: { color: theme.textMuted, fontSize: 12, textAlign: "center", marginTop: 8 },
  });
}
