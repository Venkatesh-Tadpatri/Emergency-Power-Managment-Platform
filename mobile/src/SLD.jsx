import { useEffect, useRef } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";
import { useTheme } from "./theme";
import { resolveAtsTelemetry, resolveGeneratorTelemetry } from "./telemetry";

const AnimatedG = Animated.createAnimatedComponent(G);

const PAD = 34;
const COLUMN = 100;
const MIN_WIDTH = 340;

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

function xPositions(count, width) {
  if (count <= 0) return [];
  if (count === 1) return [width / 2];
  const usable = width - PAD * 2;
  return Array.from({ length: count }, (_, i) => PAD + (usable / (count - 1)) * i);
}

export function SLD({ ats, generators }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const utilityY = 3;
  const normalBusY = 44;
  const atsY = 102;
  const emergencyBusY = 188;
  const genY = 242;
  const height = 320;

  const columns = Math.max(ats.length, generators.length, 1);
  const width = Math.max(MIN_WIDTH, PAD * 2 + (columns - 1) * COLUMN + 70);

  const atsX = xPositions(ats.length, width);
  const genX = xPositions(generators.length, width);

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

      <View style={styles.legendRow}>
        <View style={styles.utilityBadge}>
          <View style={styles.utilityIconBox}><Text style={styles.utilityIcon}>⚡</Text></View>
          <View>
            <Text style={styles.utilityTitle}>UTILITY</Text>
            <Text style={styles.utilitySubtitle}>Normal source available</Text>
          </View>
        </View>
        <View style={styles.legendKeys}>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: theme.green }]} /><Text style={styles.legendText}>Normal source</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: theme.red }]} /><Text style={styles.legendText}>Emergency source</Text></View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <Line x1={PAD} y1={utilityY} x2={PAD} y2={normalBusY + 2} stroke={theme.green} strokeWidth={3} strokeLinecap="round" />
          <Circle cx={PAD} cy={utilityY} r={3} fill={theme.green} />

          <SvgText x={PAD} y={normalBusY - 10} fontSize={9} fill={theme.textDim}>NORMAL BUS</SvgText>
          <Line x1={PAD} y1={normalBusY} x2={width - PAD} y2={normalBusY} stroke={theme.green} strokeWidth={3} />

          <SvgText x={PAD} y={emergencyBusY + 16} fontSize={9} fill={theme.textDim}>EMERGENCY BUS</SvgText>
          <Line x1={PAD} y1={emergencyBusY} x2={width - PAD} y2={emergencyBusY} stroke={theme.red} strokeWidth={3} />

          {atsX.map((x, i) => {
            const item = ats[i];
            const data = resolveAtsTelemetry(item.id, item.name);
            const onEmergency = data?.connected_source === "GENERATOR";
            return (
              <AtsNode
                key={item.id}
                x={x}
                name={item.name}
                onEmergency={onEmergency}
                normalBusY={normalBusY}
                atsY={atsY}
                emergencyBusY={emergencyBusY}
                theme={theme}
              />
            );
          })}

          {genX.map((x, i) => {
            const item = generators[i];
            const data = resolveGeneratorTelemetry(item.id, item.name);
            const running = Boolean(data?.running);
            return (
              <GeneratorNode
                key={item.id}
                x={x}
                name={item.name}
                running={running}
                emergencyBusY={emergencyBusY}
                genY={genY}
                theme={theme}
              />
            );
          })}
        </Svg>
      </ScrollView>
    </View>
  );
}

function AtsNode({ x, name, onEmergency, normalBusY, atsY, emergencyBusY, theme }) {
  const pulse = useBlink(onEmergency);
  const accent = onEmergency ? theme.red : theme.green;
  return (
    <AnimatedG opacity={onEmergency ? pulse : 1}>
      <Line x1={x} y1={normalBusY} x2={x} y2={emergencyBusY} stroke={accent} strokeWidth={onEmergency ? 3 : 2} />
      <Circle cx={x} cy={atsY} r={12} fill={onEmergency ? theme.redSoft : theme.surface} stroke={accent} strokeWidth={2} />
      <SvgText x={x} y={atsY + 4} fontSize={9} fill={accent} textAnchor="middle" fontWeight="bold">ATS</SvgText>
      <Line x1={x} y1={atsY + 12} x2={x} y2={atsY + 34} stroke={theme.textMuted} strokeWidth={2} />
      <SvgText x={x} y={atsY + 46} fontSize={8} fill={theme.text} textAnchor="middle">{name}</SvgText>
      <SvgText x={x} y={atsY + 58} fontSize={7.5} fill={accent} fontWeight="bold" textAnchor="middle">{onEmergency ? "Emergency source" : "Normal source"}</SvgText>
    </AnimatedG>
  );
}

function GeneratorNode({ x, name, running, emergencyBusY, genY, theme }) {
  const pulse = useBlink(running);
  const accent = running ? theme.red : theme.green;
  return (
    <AnimatedG opacity={running ? pulse : 1}>
      <Line x1={x} y1={emergencyBusY} x2={x} y2={genY} stroke={accent} strokeWidth={running ? 3 : 2} />
      <Circle cx={x} cy={genY + 14} r={13} fill={running ? theme.red : theme.greenSoft} stroke={accent} strokeWidth={2} />
      <SvgText x={x} y={genY + 18} fontSize={9} fill={running ? "#fff" : theme.green} textAnchor="middle" fontWeight="bold">G</SvgText>
      <SvgText x={x} y={genY + 42} fontSize={8} fill={theme.text} textAnchor="middle">{name}</SvgText>
      <SvgText x={x} y={genY + 54} fontSize={7.5} fill={accent} fontWeight="bold" textAnchor="middle">{running ? "Running" : "Ready"}</SvgText>
    </AnimatedG>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    wrap: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 16 },
    title: { fontSize: 13, fontWeight: "800", color: theme.text, marginBottom: 10 },
    empty: { color: theme.textMuted, fontSize: 12, textAlign: "center", marginTop: 8 },
    legendRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 0 },
    utilityBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
    utilityIconBox: { width: 26, height: 26, borderRadius: 7, backgroundColor: theme.greenSoft, alignItems: "center", justifyContent: "center" },
    utilityIcon: { fontSize: 13, color: theme.green },
    utilityTitle: { fontSize: 9.5, fontWeight: "800", color: theme.text, letterSpacing: 0.4 },
    utilitySubtitle: { fontSize: 9, color: theme.textDim },
    legendKeys: { gap: 4 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    legendDot: { width: 7, height: 7, borderRadius: 4 },
    legendText: { fontSize: 9.5, color: theme.textDim, fontWeight: "600" },
  });
}
