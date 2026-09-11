import { useEffect, useRef } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "./theme";
import { resolveAtsTelemetry, resolveGeneratorTelemetry } from "./telemetry";

const AnimatedG = Animated.createAnimatedComponent(G);

const PAD = 34;
const COLUMN = 100;
const GEN_GAP = 72;
const SWITCH_SIZE = 34;
const MIN_WIDTH = 340;

function truncate(label, max) {
  if (!label) return "";
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

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

/** Generators cluster tightly against the right edge, independent of ATS spacing — matches the
 * web app, where the generator row sits beside the utility regardless of how many ATS units follow. */
function generatorPositions(count, width) {
  if (count <= 0) return [];
  const rightEdge = width - PAD - 12;
  return Array.from({ length: count }, (_, i) => rightEdge - (count - 1 - i) * GEN_GAP);
}

/** Vertical circuit-breaker glyph — an open semicircle bulging off the wire, matching the web app's breaker symbol. */
function BreakerSymbol({ x, y, color }) {
  return (
    <G>
      <Path d={`M${x} ${y - 8} A8 8 0 0 1 ${x} ${y + 8}`} stroke={color} strokeWidth={2.2} fill="none" />
    </G>
  );
}

/** Transformer coil icon — same two-row loop glyph as the web app's TransformerSymbol, translated into place. */
function TransformerSymbol({ x, y, color }) {
  const s = 0.85;
  const ox = x - 11 * s;
  const oy = y - 12 * s;
  return (
    <G transform={`translate(${ox}, ${oy}) scale(${s})`}>
      <Path d="M2 9 a3.2 3.2 0 0 1 6.4 0 a3.2 3.2 0 0 1 6.4 0 a3.2 3.2 0 0 1 6.4 0" stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <Path d="M2 15 a3.2 3.2 0 0 0 6.4 0 a3.2 3.2 0 0 0 6.4 0 a3.2 3.2 0 0 0 6.4 0" stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <Line x1="11" y1="0" x2="11" y2="6" stroke={color} strokeWidth={1.6} />
      <Line x1="11" y1="17.5" x2="11" y2="24" stroke={color} strokeWidth={1.6} />
    </G>
  );
}

export function SLD({ ats, generators, onSelectAts, onSelectGenerator }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  // Layout mirrors the web app's topology: utility (left) + generators (right) feed down into
  // the buses from the top, the normal/emergency buses stack in the middle, and ATS switches
  // hang off the bottom — each connected only to whichever bus currently supplies it.
  const sourceLabelY = 12;
  const sourceY = 40;
  const breakerY = 76;
  const normalBusY = 104;
  const emergencyBusY = 120;
  const atsY = 180;
  const height = 276;

  const atsColumns = Math.max(ats.length, 1);
  const width = Math.max(
    MIN_WIDTH,
    PAD * 2 + (atsColumns - 1) * COLUMN + 70,
    PAD * 2 + generators.length * GEN_GAP + 120
  );

  const atsX = xPositions(ats.length, width);
  const genX = generatorPositions(generators.length, width);

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

      <View style={styles.legendKeys}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: theme.green }]} /><Text style={styles.legendText}>Normal source</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: theme.red }]} /><Text style={styles.legendText}>Emergency source</Text></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {/* Utility source → breaker 52-M1 → normal bus */}
          <TransformerSymbol x={PAD} y={sourceY} color={theme.green} />
          <SvgText x={PAD + 18} y={sourceY - 3} fontSize={7.5} fontWeight="800" fill={theme.text}>UTILITY</SvgText>
          <SvgText x={PAD + 18} y={sourceY + 6} fontSize={6} fill={theme.textDim}>Normal source available</SvgText>
          <Line x1={PAD} y1={sourceY + 12} x2={PAD} y2={breakerY - 9} stroke={theme.green} strokeWidth={3} strokeLinecap="round" />
          <BreakerSymbol x={PAD} y={breakerY} color={theme.green} />
          <SvgText x={PAD + 9} y={breakerY + 3} fontSize={7} fontWeight="bold" fill={theme.green}>52-M1</SvgText>
          <Line x1={PAD} y1={breakerY + 9} x2={PAD} y2={normalBusY} stroke={theme.green} strokeWidth={3} />

          {/* Generators (right side) → breakers 52-G# → emergency bus */}
          {genX.map((x, i) => {
            const item = generators[i];
            const data = resolveGeneratorTelemetry(item.id, item.name);
            const running = Boolean(data?.running);
            return (
              <GeneratorNode
                key={item.id}
                x={x}
                index={i}
                name={item.name}
                running={running}
                sourceLabelY={sourceLabelY}
                sourceY={sourceY}
                breakerY={breakerY}
                emergencyBusY={emergencyBusY}
                theme={theme}
                onPress={() => onSelectGenerator?.(item)}
              />
            );
          })}

          <SvgText x={PAD} y={normalBusY - 6} fontSize={9} fill={theme.textDim}>NORMAL BUS</SvgText>
          <Line x1={PAD} y1={normalBusY} x2={width - PAD} y2={normalBusY} stroke={theme.green} strokeWidth={3} />

          <SvgText x={PAD} y={emergencyBusY + 14} fontSize={9} fill={theme.textDim}>EMERGENCY BUS</SvgText>
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
                branch={item.branch}
                onEmergency={onEmergency}
                normalBusY={normalBusY}
                atsY={atsY}
                emergencyBusY={emergencyBusY}
                theme={theme}
                onPress={() => onSelectAts?.(item)}
              />
            );
          })}
        </Svg>
      </ScrollView>
    </View>
  );
}

function AtsNode({ x, name, branch, onEmergency, normalBusY, atsY, emergencyBusY, theme, onPress }) {
  const pulse = useBlink(onEmergency);
  const accent = onEmergency ? theme.red : theme.green;
  const busY = onEmergency ? emergencyBusY : normalBusY;
  const half = SWITCH_SIZE / 2;
  // Terminals sit fully inside the box near the top corners (not straddling the edge, so no part
  // pokes outside) — sized small relative to the box; the arm is one continuous diagonal down to the load dot.
  const termRadius = 5;
  const termY = atsY - half + termRadius + 5;
  const nX = x - half + 9;
  const eX = x + half - 9;
  const loadX = x;
  const loadY = atsY + half - 8;
  return (
    <AnimatedG opacity={onEmergency ? pulse : 1}>
      {/* Generously-sized hit target — a fully transparent fill doesn't register touches in react-native-svg, so this uses a near-zero (but non-zero) opacity fill; taps anywhere on the switch or its labels open the detail popup */}
      <Rect x={x - half - 6} y={atsY - half - 4} width={SWITCH_SIZE + 12} height={half + 76} fill="#000" fillOpacity={0.001} onPress={onPress} />
      {/* Only the active source connects through — matches the web app's single live drop line */}
      <Line x1={x} y1={busY} x2={x} y2={atsY - half} stroke={accent} strokeWidth={onEmergency ? 3 : 2} />
      {/* Solid-filled switch body — matches the web app's switch symbol exactly (no fill = looked like an empty outline) */}
      <Rect x={x - half} y={atsY - half} width={SWITCH_SIZE} height={SWITCH_SIZE} rx={6} fill={accent} stroke={theme.border} strokeWidth={1} onPress={onPress} />
      {/* Switch arm — one continuous diagonal from the live terminal down to the load dot */}
      <Line x1={onEmergency ? eX : nX} y1={termY} x2={loadX} y2={loadY} stroke="rgba(255,255,255,0.8)" strokeWidth={2} strokeLinecap="round" />
      {/* N/E terminal indicators — sit fully inside the box near the top corners; the live terminal fills dark with white text, the idle one stays white */}
      <Circle cx={nX} cy={termY} r={termRadius} fill={!onEmergency ? "#15803d" : "#ffffff"} stroke="#ffffff" strokeWidth={1.2} />
      <SvgText x={nX} y={termY + 2} fontSize={5.5} fill={!onEmergency ? "#ffffff" : "#183150"} textAnchor="middle" fontWeight="bold">N</SvgText>
      <Circle cx={eX} cy={termY} r={termRadius} fill={onEmergency ? "#b91c1c" : "#ffffff"} stroke="#ffffff" strokeWidth={1.2} />
      <SvgText x={eX} y={termY + 2} fontSize={5.5} fill={onEmergency ? "#ffffff" : "#183150"} textAnchor="middle" fontWeight="bold">E</SvgText>
      {/* Load terminal — sits inside the switch body near the bottom edge, matching the web app */}
      <Circle cx={loadX} cy={loadY} r={3.5} fill="#ffffff" stroke={accent} strokeWidth={1.2} />
      <Line x1={x} y1={atsY + half} x2={x} y2={atsY + half + 18} stroke={theme.textMuted} strokeWidth={2} />
      <SvgText x={x} y={atsY + half + 30} fontSize={8} fill={theme.text} textAnchor="middle">{truncate(name, 13)}</SvgText>
      <SvgText x={x} y={atsY + half + 42} fontSize={7.5} fill={accent} fontWeight="bold" textAnchor="middle">{onEmergency ? "Connected to emergency" : "Connected to normal"}</SvgText>
      {branch && <SvgText x={x} y={atsY + half + 54} fontSize={6.5} fill={theme.textMuted} textAnchor="middle">{branch}</SvgText>}
    </AnimatedG>
  );
}

function GeneratorNode({ x, index, name, running, sourceLabelY, sourceY, breakerY, emergencyBusY, theme, onPress }) {
  const pulse = useBlink(running);
  const accent = running ? theme.red : theme.green;
  return (
    <AnimatedG opacity={running ? pulse : 1}>
      {/* Generously-sized hit target — a fully transparent fill doesn't register touches in react-native-svg, so this uses a near-zero (but non-zero) opacity fill; taps anywhere on the generator or its labels open the detail popup */}
      <Rect x={x - 26} y={sourceLabelY - 8} width={52} height={breakerY - sourceLabelY + 18} fill="#000" fillOpacity={0.001} onPress={onPress} />
      <SvgText x={x} y={sourceLabelY} fontSize={6.5} fill={theme.text} textAnchor="middle" fontWeight="600">{truncate(name, 12)}</SvgText>
      <Circle cx={x} cy={sourceY} r={13} fill={running ? theme.red : theme.greenSoft} stroke={accent} strokeWidth={2} onPress={onPress} />
      <SvgText x={x} y={sourceY + 4} fontSize={9} fill={running ? "#fff" : theme.green} textAnchor="middle" fontWeight="bold">G</SvgText>
      <Line x1={x} y1={sourceY + 13} x2={x} y2={breakerY - 9} stroke={accent} strokeWidth={running ? 3 : 2} />
      <BreakerSymbol x={x} y={breakerY} color={accent} />
      <SvgText x={x + 9} y={breakerY + 2} fontSize={6} fontWeight="bold" fill={accent}>52-G{index + 1}</SvgText>
      <SvgText x={x + 9} y={breakerY + 11} fontSize={6} fontWeight="700" fill={accent}>{running ? "RUNNING" : "READY"}</SvgText>
      <Line x1={x} y1={breakerY + 9} x2={x} y2={emergencyBusY} stroke={accent} strokeWidth={running ? 3 : 2} />
    </AnimatedG>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    wrap: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 16 },
    title: { fontSize: 13, fontWeight: "800", color: theme.text, marginBottom: 10 },
    empty: { color: theme.textMuted, fontSize: 12, textAlign: "center", marginTop: 8 },
    legendKeys: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 10 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    legendDot: { width: 7, height: 7, borderRadius: 4 },
    legendText: { fontSize: 9.5, color: theme.textDim, fontWeight: "600" },
  });
}
