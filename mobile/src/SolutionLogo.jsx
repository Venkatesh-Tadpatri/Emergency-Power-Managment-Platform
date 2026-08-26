import Svg, { Path, Circle, Text as SvgText } from "react-native-svg";
import { useTheme } from "./theme";

const NODES = [
  { cx: 341, cy: 29, r: 14 },
  { cx: 521, cy: 25, r: 23 },
  { cx: 716, cy: 50, r: 12 },
  { cx: 312, cy: 219, r: 20 },
  { cx: 648, cy: 203, r: 35 },
  { cx: 504, cy: 247, r: 17 },
  { cx: 518, cy: 133, r: 72 },
];

export function SolutionLogo({ width = 140, ink }) {
  const { theme } = useTheme();
  const inkColor = ink || (theme.mode === "dark" ? "#fff" : "#000");
  const height = (width * 306) / 730;
  return (
    <Svg width={width} height={height} viewBox="0 0 730 306">
      <Path
        d="M341 29 465 110M521 47v47M716 50 580 106M312 219 447 159M648 202 581 158M504 246v-41"
        fill="none"
        stroke={inkColor}
        strokeWidth={4}
        strokeLinecap="round"
      />
      {NODES.map((node, index) => (
        <Circle key={index} cx={node.cx} cy={node.cy} r={node.r} fill="#00b34f" stroke={inkColor} strokeWidth={4} />
      ))}
      <SvgText x={46} y={158} fontFamily="Times New Roman" fontSize={75} fill={inkColor}>SOLUTION</SvgText>
      <SvgText x={478} y={157} fontFamily="Times New Roman" fontSize={76} fill={inkColor}>61</SvgText>
    </Svg>
  );
}
