import { useEffect, useRef, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { getOneLine } from "./api";
import { resolveAtsTelemetry, resolveGeneratorTelemetry } from "./telemetry";
import { useTheme } from "./theme";

const AnimatedG = Animated.createAnimatedComponent(G);

// Pass-through equipment (a breaker/container/transformer) can't be a dead end in the web app's wizard,
// so a generator's own chain always resolves down to either an ATS or "End" — matching that same walk
// here (see WIZARD_PASS_THROUGH_TYPES in the web app and mobile's own OneLineWizard.jsx) is what lets
// this pick the right glyph for a generator's first/second breaker instead of guessing.
const PASS_THROUGH_TYPES = ["breaker", "container", "transformer"];

const COL = 110;
const PAD = 40;
const MIN_WIDTH = 360;

function useBlink(active) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.3, duration: 550, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]));
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

/** Open semicircle breaker glyph — matches SLD.jsx's own BreakerSymbol. */
function BreakerArc({ x, y, color }) {
  return <Path d={`M${x} ${y - 8} A8 8 0 0 1 ${x} ${y + 8}`} stroke={color} strokeWidth={2.2} fill="none" />;
}

/** Square, up/down-arrow drawout breaker glyph — matches the web app's DrawoutBreakerGlyph. */
function DrawoutGlyph({ x, y, color }) {
  const half = 9;
  return (
    <G>
      <Rect x={x - half} y={y - half} width={half * 2} height={half * 2} rx={2} stroke={color} strokeWidth={1.8} fill="none" />
      <Path d={`M${x} ${y - half - 7} L${x} ${y - half + 1} M${x - 3} ${y - half - 3} L${x} ${y - half - 7} L${x + 3} ${y - half - 3}`} stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={`M${x} ${y + half - 1} L${x} ${y + half + 7} M${x - 3} ${y + half + 3} L${x} ${y + half + 7} L${x + 3} ${y + half + 3}`} stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
}

export function OneLineResult({ systemId, ats, generators, token }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOneLine(systemId, token)
      .then((row) => { if (!cancelled) { setData(row?.data || null); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [systemId, token]);

  if (loading) return <View style={styles.wrap}><Text style={styles.empty}>Loading…</Text></View>;
  if (loadError) return <View style={styles.wrap}><Text style={styles.empty}>Could not load the one-line.</Text></View>;

  const pieces = data?.pieces || [];
  const sourceLinks = data?.sourceLinks || {};
  const rawPieceDownstream = data?.pieceDownstream || {};
  const pieceDownstream = Object.fromEntries(Object.entries(rawPieceDownstream).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]));
  const generated = Boolean(data?.generated);

  if (!pieces.length || !generated) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Generated one-line</Text>
        <Text style={styles.empty}>Nothing generated yet — build your one-line and connections in the Wizard tab, then tap Finish &amp; Generate.</Text>
      </View>
    );
  }

  const switchgear = pieces.find((p) => p.type === "container");

  // Same chain-walk as the web app's ResultTab: the first breaker in a generator's chain renders above
  // the switchgear's dashed border, a second one (if any) renders inside it — a container/ATS/"End"
  // stops the walk. Only a generator that's actually wired to something renders at all.
  const generatorViews = generators
    .filter((g) => Boolean(sourceLinks[g.id]))
    .map((generator, index) => {
      const telemetry = resolveGeneratorTelemetry(generator.id, generator.name);
      const running = Boolean(telemetry?.running);
      let leadBreaker, entryBreaker;
      const seen = new Set();
      let current = sourceLinks[generator.id];
      while (current && !seen.has(current)) {
        seen.add(current);
        const piece = pieces.find((p) => p.name === current);
        if (piece?.type !== "breaker") break;
        if (!leadBreaker) leadBreaker = piece;
        else { entryBreaker = piece; break; }
        current = (pieceDownstream[current] || [])[0];
      }
      return { generator, running, leadBreaker, entryBreaker, index };
    });

  // Which ATS units a wired source's chain actually reaches (walking sourceLinks -> pieceDownstream) —
  // an ATS shows here only once something really feeds it, same as the web app.
  const reachable = new Set();
  const stack = Object.values(sourceLinks);
  while (stack.length) {
    const name = stack.pop();
    if (!name || name === "End" || reachable.has(name)) continue;
    reachable.add(name);
    stack.push(...(pieceDownstream[name] || []));
  }
  const wiredAts = ats.filter((item) => reachable.has(item.name));

  const width = Math.max(MIN_WIDTH, PAD * 2 + (Math.max(generatorViews.length, wiredAts.length, 1) - 1) * COL);
  const genX = xPositions(generatorViews.length, width);
  const atsX = xPositions(wiredAts.length, width);

  const yGenLabel = 12, yGenIcon = 40, yLeadBreaker = 72, yBoxTop = 100, yEntryBreaker = 140, yBus = 176, yFeeder = 206, yBoxBottom = 232, yAts = 284;
  const height = yAts + 90;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Generated one-line</Text>
      <Text style={styles.subtitle}>Generators → {switchgear ? switchgear.name : "Switchgear"} → ATS</Text>
      {!generatorViews.length && !wiredAts.length && <Text style={styles.empty}>No connections wired yet.</Text>}
      {(generatorViews.length > 0 || wiredAts.length > 0) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            {switchgear && (
              <>
                <Rect x={PAD - 20} y={yBoxTop} width={width - (PAD - 20) * 2} height={yBoxBottom - yBoxTop} fill="none" stroke={theme.blue} strokeWidth={1.4} strokeDasharray="5,4" rx={8} />
                <SvgText x={PAD - 12} y={yBoxTop + 16} fontSize={9} fontWeight="800" fill={theme.blue}>{switchgear.name.toUpperCase()}</SvgText>
              </>
            )}
            {generatorViews.map(({ generator, running, leadBreaker, entryBreaker }, i) => {
              const x = genX[i];
              const accent = running ? theme.red : theme.green;
              return (
                <GeneratorColumn
                  key={generator.id}
                  x={x}
                  name={generator.name}
                  running={running}
                  accent={accent}
                  leadBreaker={leadBreaker}
                  entryBreaker={entryBreaker}
                  yGenLabel={yGenLabel}
                  yGenIcon={yGenIcon}
                  yLeadBreaker={yLeadBreaker}
                  yBoxTop={yBoxTop}
                  yEntryBreaker={yEntryBreaker}
                  yBus={yBus}
                  theme={theme}
                />
              );
            })}
            {switchgear && generatorViews.length > 0 && (
              <Line x1={PAD - 12} y1={yBus} x2={width - PAD + 12} y2={yBus} stroke={theme.red} strokeWidth={3} />
            )}
            {switchgear && wiredAts.map((item, i) => (
              <G key={`feeder-${item.id}`}>
                <Line x1={atsX[i]} y1={yBus} x2={atsX[i]} y2={yFeeder - 9} stroke={theme.red} strokeWidth={2} />
                <BreakerArc x={atsX[i]} y={yFeeder} color={theme.red} />
                <SvgText x={atsX[i] + 9} y={yFeeder + 3} fontSize={7} fontWeight="800" fill={theme.red}>F{i + 1}</SvgText>
                <Line x1={atsX[i]} y1={yFeeder + 9} x2={atsX[i]} y2={yBoxBottom} stroke={theme.red} strokeWidth={2} />
              </G>
            ))}
            {wiredAts.map((item, i) => (
              <AtsColumn key={item.id} x={atsX[i]} item={item} yTop={yBoxBottom} yAts={yAts} theme={theme} />
            ))}
          </Svg>
        </ScrollView>
      )}
    </View>
  );
}

function GeneratorColumn({ x, name, running, accent, leadBreaker, entryBreaker, yGenLabel, yGenIcon, yLeadBreaker, yBoxTop, yEntryBreaker, yBus, theme }) {
  const pulse = useBlink(running);
  return (
    <AnimatedG opacity={running ? pulse : 1}>
      <SvgText x={x} y={yGenLabel} fontSize={7.5} fontWeight="700" fill={theme.text} textAnchor="middle">{name}</SvgText>
      <Circle cx={x} cy={yGenIcon} r={13} fill={running ? theme.red : theme.greenSoft} stroke={accent} strokeWidth={2} />
      <SvgText x={x} y={yGenIcon + 4} fontSize={9} fill={running ? "#fff" : theme.green} textAnchor="middle" fontWeight="bold">G</SvgText>
      <Line x1={x} y1={yGenIcon + 13} x2={x} y2={yLeadBreaker - 9} stroke={accent} strokeWidth={2} />
      {leadBreaker?.meta?.style === "draw-out" ? <DrawoutGlyph x={x} y={yLeadBreaker} color={accent} /> : <BreakerArc x={x} y={yLeadBreaker} color={accent} />}
      {leadBreaker && <SvgText x={x + 12} y={yLeadBreaker + 3} fontSize={6.5} fontWeight="800" fill={accent}>{leadBreaker.name}</SvgText>}
      <Line x1={x} y1={yLeadBreaker + 9} x2={x} y2={yBoxTop} stroke={accent} strokeWidth={2} />
      <Line x1={x} y1={yBoxTop} x2={x} y2={yEntryBreaker - 9} stroke={accent} strokeWidth={2} />
      {entryBreaker && (entryBreaker.meta?.style === "draw-out" ? <DrawoutGlyph x={x} y={yEntryBreaker} color={accent} /> : <BreakerArc x={x} y={yEntryBreaker} color={accent} />)}
      {entryBreaker && <SvgText x={x + 12} y={yEntryBreaker + 3} fontSize={6.5} fontWeight="800" fill={accent}>{entryBreaker.name}</SvgText>}
      <Line x1={x} y1={yEntryBreaker + 9} x2={x} y2={yBus} stroke={accent} strokeWidth={2} />
    </AnimatedG>
  );
}

function AtsColumn({ x, item, yTop, yAts, theme }) {
  const telemetry = resolveAtsTelemetry(item.id, item.name);
  const emergency = telemetry?.connected_source === "GENERATOR";
  const pulse = useBlink(emergency);
  const accent = emergency ? theme.red : theme.green;
  const half = 17;
  const termRadius = 5;
  const termY = yAts - half + termRadius + 5;
  const nX = x - half + 9, eX = x + half - 9;
  const loadY = yAts + half - 8;
  return (
    <AnimatedG opacity={emergency ? pulse : 1}>
      <Line x1={x} y1={yTop} x2={x} y2={yAts - half} stroke={accent} strokeWidth={2} />
      <Rect x={x - half} y={yAts - half} width={half * 2} height={half * 2} rx={6} fill={accent} stroke={theme.border} strokeWidth={1} />
      <Line x1={emergency ? eX : nX} y1={termY} x2={x} y2={loadY} stroke="rgba(255,255,255,0.8)" strokeWidth={2} strokeLinecap="round" />
      <Circle cx={nX} cy={termY} r={termRadius} fill={theme.green} stroke="#ffffff" strokeWidth={1.2} />
      <SvgText x={nX} y={termY + 2} fontSize={5.5} fill="#ffffff" textAnchor="middle" fontWeight="bold">N</SvgText>
      <Circle cx={eX} cy={termY} r={termRadius} fill={theme.red} stroke="#ffffff" strokeWidth={1.2} />
      <SvgText x={eX} y={termY + 2} fontSize={5.5} fill="#ffffff" textAnchor="middle" fontWeight="bold">E</SvgText>
      <Circle cx={x} cy={loadY} r={3.5} fill="#ffffff" stroke={accent} strokeWidth={1.2} />
      <SvgText x={x} y={yAts + half + 16} fontSize={8} fill={theme.text} textAnchor="middle" fontWeight="700">{item.name}</SvgText>
      <SvgText x={x} y={yAts + half + 28} fontSize={7} fill={accent} fontWeight="bold" textAnchor="middle">{emergency ? "Emergency" : "Normal"}</SvgText>
    </AnimatedG>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    wrap: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 16 },
    title: { fontSize: 13, fontWeight: "800", color: theme.text, marginBottom: 4 },
    subtitle: { fontSize: 10.5, color: theme.textDim, marginBottom: 12 },
    empty: { color: theme.textMuted, fontSize: 12, textAlign: "center", marginVertical: 12 },
  });
}
