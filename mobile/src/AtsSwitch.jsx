import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "./theme";

const TERMINAL_R = 9;

export function AtsSwitch({ onNormal = true, size = 64 }) {
  const { theme } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (onNormal) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [onNormal, pulse]);

  const pivot = { x: 32, y: 50 };
  const normalTerminal = { x: 17, y: 17 };
  const emergencyTerminal = { x: 47, y: 17 };
  const active = onNormal ? normalTerminal : emergencyTerminal;
  const accent = onNormal ? theme.green : theme.red;

  // Stop the pivot line exactly at the terminal circle's edge — touching it without covering the N/E letter inside.
  const dx = active.x - pivot.x;
  const dy = active.y - pivot.y;
  const dist = Math.hypot(dx, dy) || 1;
  const lineEnd = {
    x: pivot.x + (dx / dist) * (dist - TERMINAL_R),
    y: pivot.y + (dy / dist) * (dist - TERMINAL_R),
  };

  return (
    <Animated.View style={{ width: size, height: size, opacity: onNormal ? 1 : pulse }}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Rect x={0} y={0} width={64} height={64} rx={12} fill={accent} />
        <Circle cx={normalTerminal.x} cy={normalTerminal.y} r={TERMINAL_R} fill={onNormal ? "#fff" : "rgba(255,255,255,0.3)"} />
        <SvgText x={normalTerminal.x} y={normalTerminal.y + 4} fontSize={9} fontWeight="bold" fill={onNormal ? accent : "#fff"} textAnchor="middle">N</SvgText>
        <Circle cx={emergencyTerminal.x} cy={emergencyTerminal.y} r={TERMINAL_R} fill={!onNormal ? "#fff" : "rgba(255,255,255,0.3)"} />
        <SvgText x={emergencyTerminal.x} y={emergencyTerminal.y + 4} fontSize={9} fontWeight="bold" fill={!onNormal ? accent : "#fff"} textAnchor="middle">E</SvgText>
        <Line x1={pivot.x} y1={pivot.y} x2={lineEnd.x} y2={lineEnd.y} stroke="#fff" strokeWidth={3} strokeLinecap="round" />
        <Circle cx={pivot.x} cy={pivot.y} r={5} fill="#fff" />
      </Svg>
    </Animated.View>
  );
}
