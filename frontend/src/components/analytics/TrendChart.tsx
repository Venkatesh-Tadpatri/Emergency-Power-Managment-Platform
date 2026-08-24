import { useMemo, useRef, useState } from "react";

export type TrendSeries = { key: string; label: string; color: string; points: number[] };

const VIEW_W = 320;
const PAD_X = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 8;

const fmt = (value: number, decimals: number) => (Number.isFinite(value) ? value.toFixed(decimals) : "—");

function pathFor(points: number[], min: number, max: number, plotW: number, plotH: number) {
  const span = max - min || 1;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  return points
    .map((value, index) => {
      const x = PAD_X + index * step;
      const y = PAD_TOP + plotH - ((value - min) / span) * plotH;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function TrendChart({ title, series, unit = "", decimals = 1, height = 108, emptyHint = "Collecting live trend…" }: {
  title: string;
  series: TrendSeries[];
  unit?: string;
  decimals?: number;
  height?: number;
  emptyHint?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pointCount = series[0]?.points.length ?? 0;
  const plotW = VIEW_W - PAD_X * 2;
  const plotH = height - PAD_TOP - PAD_BOTTOM;

  const { min, max } = useMemo(() => {
    const all = series.flatMap((s) => s.points).filter((v) => Number.isFinite(v));
    if (!all.length) return { min: 0, max: 1 };
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    if (lo === hi) return { min: lo - 1, max: hi + 1 };
    const pad = (hi - lo) * 0.12;
    return { min: lo - pad, max: hi + pad };
  }, [series]);

  const gridLines = [max, (max + min) / 2, min];

  const handleMove = (clientX: number) => {
    const el = wrapRef.current;
    if (!el || pointCount < 2) return;
    const rect = el.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHoverIndex(Math.round(fraction * (pointCount - 1)));
  };

  const isMulti = series.length > 1;
  const hoverX = hoverIndex != null && pointCount > 1 ? PAD_X + (hoverIndex / (pointCount - 1)) * plotW : null;
  const hoverFraction = hoverX != null ? hoverX / VIEW_W : null;

  return (
    <div className="trend-card">
      <div className="trend-card-head">
        <span>{title}</span>
        <div className="trend-card-head-actions">
          {!isMulti && series[0] && (() => {
            const last = [...series[0].points].reverse().find((v) => Number.isFinite(v));
            return <b className="trend-head-value">{fmt(last ?? NaN, decimals)}{unit}</b>;
          })()}
          {pointCount > 0 && (
            <button type="button" className="trend-table-toggle" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
              {showTable ? "Chart" : "Table"}
            </button>
          )}
        </div>
      </div>
      {isMulti && (
        <div className="trend-legend">
          {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
        </div>
      )}
      {pointCount < 2 ? (
        <div className="trend-empty" style={{ height }}>{emptyHint}</div>
      ) : showTable ? (
        <div className="trend-table-wrap" style={{ maxHeight: height }}>
          <table className="trend-table">
            <thead><tr><th>#</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
            <tbody>
              {series[0].points.map((_, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  {series.map((s) => <td key={s.key}>{fmt(s.points[index], decimals)}{unit}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="trend-chart-wrap"
          ref={wrapRef}
          onPointerMove={(e) => handleMove(e.clientX)}
          onPointerLeave={() => setHoverIndex(null)}
        >
          <svg viewBox={`0 0 ${VIEW_W} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={`${title} trend`}>
            {gridLines.map((value, index) => {
              const y = PAD_TOP + plotH - ((value - min) / ((max - min) || 1)) * plotH;
              return <g key={index}><line x1={PAD_X} x2={VIEW_W - PAD_X} y1={y} y2={y} className="trend-grid-line" /></g>;
            })}
            {series.length === 1 && (
              <path
                d={`${pathFor(series[0].points, min, max, plotW, plotH)} L${(PAD_X + plotW).toFixed(2)},${(PAD_TOP + plotH).toFixed(2)} L${PAD_X},${(PAD_TOP + plotH).toFixed(2)} Z`}
                fill={series[0].color}
                opacity={0.1}
                stroke="none"
              />
            )}
            {series.map((s) => (
              <path key={s.key} d={pathFor(s.points, min, max, plotW, plotH)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {series.map((s) => {
              const last = s.points[s.points.length - 1];
              if (!Number.isFinite(last)) return null;
              const x = PAD_X + plotW;
              const y = PAD_TOP + plotH - ((last - min) / ((max - min) || 1)) * plotH;
              return <circle key={s.key} cx={x} cy={y} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
            })}
            {hoverX != null && <line x1={hoverX} x2={hoverX} y1={PAD_TOP} y2={PAD_TOP + plotH} className="trend-crosshair" />}
            {hoverX != null && series.map((s) => {
              const value = s.points[hoverIndex!];
              if (!Number.isFinite(value)) return null;
              const y = PAD_TOP + plotH - ((value - min) / ((max - min) || 1)) * plotH;
              return <circle key={s.key} cx={hoverX} cy={y} r={3.5} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} />;
            })}
          </svg>
          {hoverIndex != null && hoverFraction != null && (
            <div
              className="trend-tooltip"
              style={{
                left: `${hoverFraction * 100}%`,
                transform: hoverFraction < 0.18 ? "translateX(0)" : hoverFraction > 0.82 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {series.map((s) => (
                <div key={s.key} className="trend-tooltip-row">
                  <span><i style={{ background: s.color }} />{s.label}</span>
                  <b>{fmt(s.points[hoverIndex], decimals)}{unit}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
