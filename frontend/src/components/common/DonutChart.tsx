export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ segments, centerValue, centerLabel }: { segments: DonutSegment[]; centerValue: string | number; centerLabel: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={radius} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const dash = frac * circumference;
          const el = (
            <circle
              key={i}
              cx="55"
              cy="55"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="14"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 55 55)"
              strokeLinecap={segments.length > 1 ? "butt" : "round"}
            />
          );
          offset += dash;
          return el;
        })}
        <text x="55" y="52" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="20" fontWeight="700" fill="var(--text)">
          {centerValue}
        </text>
        <text x="55" y="68" textAnchor="middle" fontFamily="Inter" fontSize="8" fill="var(--text-dim)">
          {centerLabel}
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {segments.map((seg) => (
          <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: seg.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "var(--text-dim)", minWidth: 60 }}>{seg.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono", color: "var(--text)" }}>
              {seg.value} <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>({Math.round((seg.value / total) * 100)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
