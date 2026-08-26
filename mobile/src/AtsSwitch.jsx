import { View } from "react-native";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "./theme";

export function AtsSwitch({ onNormal = true, size = 64 }) {
  const { theme } = useTheme();
  const pivot = { x: 32, y: 50 };
  const normalTerminal = { x: 17, y: 17 };
  const emergencyTerminal = { x: 47, y: 17 };
  const active = onNormal ? normalTerminal : emergencyTerminal;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Rect x={0} y={0} width={64} height={64} rx={12} fill={theme.green} />
        <Circle cx={normalTerminal.x} cy={normalTerminal.y} r={9} fill={onNormal ? "#fff" : "rgba(255,255,255,0.3)"} />
        <SvgText x={normalTerminal.x} y={normalTerminal.y + 4} fontSize={9} fontWeight="bold" fill={onNormal ? theme.green : "#fff"} textAnchor="middle">N</SvgText>
        <Circle cx={emergencyTerminal.x} cy={emergencyTerminal.y} r={9} fill={!onNormal ? "#fff" : "rgba(255,255,255,0.3)"} />
        <SvgText x={emergencyTerminal.x} y={emergencyTerminal.y + 4} fontSize={9} fontWeight="bold" fill={!onNormal ? theme.green : "#fff"} textAnchor="middle">E</SvgText>
        <Line x1={pivot.x} y1={pivot.y} x2={active.x} y2={active.y} stroke="#fff" strokeWidth={3} strokeLinecap="round" />
        <Circle cx={pivot.x} cy={pivot.y} r={5} fill="#fff" />
      </Svg>
    </View>
  );
}
