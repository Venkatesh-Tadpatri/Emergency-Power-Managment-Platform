import { useEffect, useMemo, useRef, useState } from "react";

export type TrendSeries = { key: string; label: string; color: string; points: number[] };

const PAD_RIGHT = 8;
const PAD_LEFT = 38;
const PAD_TOP = 10;
const PAD_BOTTOM = 8;
const AXIS_H = 14;

const fmt = (value: number | undefined, decimals: number) => (value != null && Number.isFinite(value) ? value.toFixed(decimals) : "—");

/** Clock time for spans up to a day, otherwise a short date (+ hour for spans up to a week). */
function timeLabel(ms: number, spanMs: number) {
  const date = new Date(ms);
  if (spanMs <= 26 * 60 * 60_000) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (spanMs <= 8 * 24 * 60 * 60_000) return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "2-digit" })}`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function tooltipTime(ms: number) {
  return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function TrendChart({ title, series, unit = "", decimals = 1, height = 120, emptyHint = "No data in this time range", times, domain, step = false }: {
  title: string;
  series: TrendSeries[];
  unit?: string;
  decimals?: number;
  height?: number;
  emptyHint?: string;
  /** Sample timestamps (epoch ms), same length/order as each series' points. Enables a true time axis. */
  times?: number[];
  /** Fixed time window [start, end] (epoch ms) so every chart on a page shares one x-axis. */
  domain?: [number, number];
  /** Draw as a step line (state/count data) instead of straight segments. */
  step?: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Draw at the card's real pixel width (no viewBox stretching) so axis text keeps its shape.
  const [VIEW_W, setViewW] = useState(320);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => setViewW(Math.max(200, Math.round(el.clientWidth - 24)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const pointCount = series[0]?.points.length ?? 0;
  const chartH = height + AXIS_H;
  const plotX = PAD_LEFT;
  const plotW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const hasTime = Boolean(times && times.length === pointCount && pointCount > 0);
  const finiteCount = series.reduce((total, s) => total + s.points.filter((v) => Number.isFinite(v)).length, 0);

  const [x0, x1] = useMemo<[number, number]>(() => {
    if (!hasTime) return [0, Math.max(1, pointCount - 1)];
    const lo = domain?.[0] ?? times![0];
    const hi = domain?.[1] ?? times![times!.length - 1];
    return hi > lo ? [lo, hi] : [lo - 1, hi + 1];
  }, [hasTime, domain, times, pointCount]);
  const xOf = (index: number) => plotX + (((hasTime ? times![index] : index) - x0) / (x1 - x0)) * plotW;

  const { min, max } = useMemo(() => {
    const all = series.flatMap((s) => s.points).filter((v) => Number.isFinite(v));
    if (!all.length) return { min: 0, max: 1 };
    // State/count (step) charts start at zero — a negative count is meaningless.
    if (step) return { min: 0, max: Math.max(1, ...all) * 1.1 };
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    if (lo === hi) return { min: lo - 1, max: hi + 1 };
    const pad = (hi - lo) * 0.12;
    return { min: lo - pad, max: hi + pad };
  }, [series, step]);
  const yOf = (value: number) => PAD_TOP + plotH - ((value - min) / ((max - min) || 1)) * plotH;

  // Break the line where samples are missing (device offline) instead of bridging the gap.
  const gapMs = useMemo(() => {
    if (!hasTime || pointCount < 3) return Number.POSITIVE_INFINITY;
    const deltas = times!.slice(1).map((t, i) => t - times![i]).sort((a, b) => a - b);
    return deltas[Math.floor(deltas.length / 2)] * 3;
  }, [hasTime, times, pointCount]);

  const pathFor = (points: number[]) => {
    let d = "";
    let penDown = false;
    points.forEach((value, index) => {
      if (!Number.isFinite(value)) { penDown = false; return; }
      const gap = hasTime && index > 0 && times![index] - times![index - 1] > gapMs;
      const x = xOf(index);
      const y = yOf(value);
      if (!penDown || gap) d += `M${x.toFixed(2)},${y.toFixed(2)} `;
      else d += step ? `H${x.toFixed(2)} V${y.toFixed(2)} ` : `L${x.toFixed(2)},${y.toFixed(2)} `;
      penDown = true;
    });
    return d.trim();
  };

  const handleMove = (clientX: number) => {
    const el = wrapRef.current;
    if (!el || pointCount < 1) return;
    const rect = el.getBoundingClientRect();
    const viewBoxX = ((clientX - rect.left) / rect.width) * VIEW_W;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let index = 0; index < pointCount; index += 1) {
      const dist = Math.abs(xOf(index) - viewBoxX);
      if (dist < bestDist) { bestDist = dist; best = index; }
    }
    setHoverIndex(best);
  };

  const isMulti = series.length > 1;
  const hoverX = hoverIndex != null ? xOf(hoverIndex) : null;
  const hoverFraction = hoverX != null ? hoverX / VIEW_W : null;

  const xTicks = useMemo(() => {
    if (!hasTime) return [];
    const span = x1 - x0;
    return [0, 0.5, 1].map((fraction) => ({
      x: plotX + fraction * plotW,
      label: timeLabel(x0 + fraction * span, span),
      anchor: fraction === 0 ? "start" as const : fraction === 1 ? "end" as const : "middle" as const,
    }));
  }, [hasTime, x0, x1, plotW, plotX]);

  // Step (state/count) charts only get whole-number gridlines; a "0.5 generators" line is noise.
  const stepTop = Math.max(1, Math.round(max / 1.1));
  const gridLines = step ? [...new Set([stepTop, Math.round(stepTop / 2), 0])].filter((v, i, all) => v !== 0 || all.length === 1 || i === all.length - 1) : [max, (max + min) / 2, min];
  const latest = !isMulti && series[0] ? [...series[0].points].reverse().find((v) => Number.isFinite(v)) : undefined;

  return (
    <div className="trend-card" ref={cardRef}>
      <div className="trend-card-head">
        <span>{title}</span>
        <div className="trend-card-head-actions">
          {!isMulti && series[0] && <b className="trend-head-value">{fmt(latest, decimals)}{latest != null ? unit : ""}</b>}
          {finiteCount > 0 && (
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
      {finiteCount === 0 ? (
        <div className="trend-empty" style={{ height: chartH }}>{emptyHint}</div>
      ) : showTable ? (
        <div className="trend-table-wrap" style={{ maxHeight: chartH }}>
          <table className="trend-table">
            <thead><tr><th>{hasTime ? "Time" : "#"}</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
            <tbody>
              {series[0].points.map((_, index) => (
                <tr key={index}>
                  <td>{hasTime ? tooltipTime(times![index]) : index + 1}</td>
                  {series.map((s) => <td key={s.key}>{fmt(s.points[index], decimals)}{Number.isFinite(s.points[index]) ? unit : ""}</td>)}
                </tr>
              )).reverse()}
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
          <svg viewBox={`0 0 ${VIEW_W} ${chartH}`} width="100%" height={chartH} role="img" aria-label={`${title} trend`}>
            {gridLines.map((value, index) => (
              <g key={index}>
                <line x1={plotX} x2={VIEW_W - PAD_RIGHT} y1={yOf(value)} y2={yOf(value)} className="trend-grid-line" />
                <text x={plotX - 5} y={yOf(value)} textAnchor="end" dominantBaseline="middle" className="trend-axis-label">{fmt(value, decimals)}</text>
              </g>
            ))}
            {series.map((s) => (
              <path key={s.key} d={pathFor(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {/* A lone sample has no segment to draw — mark it so it is still visible. */}
            {series.map((s) => s.points.map((value, index) => {
              if (!Number.isFinite(value)) return null;
              const prev = s.points[index - 1];
              const next = s.points[index + 1];
              const isolated = !Number.isFinite(prev) && !Number.isFinite(next);
              return isolated ? <circle key={`${s.key}-${index}`} cx={xOf(index)} cy={yOf(value)} r={2.5} fill={s.color} /> : null;
            }))}
            {hoverX != null && <line x1={hoverX} x2={hoverX} y1={PAD_TOP} y2={PAD_TOP + plotH} className="trend-crosshair" />}
            {hoverX != null && series.map((s) => {
              const value = s.points[hoverIndex!];
              if (!Number.isFinite(value)) return null;
              return <circle key={s.key} cx={hoverX} cy={yOf(value)} r={3.5} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} />;
            })}
            <line x1={plotX} x2={VIEW_W - PAD_RIGHT} y1={PAD_TOP + plotH} y2={PAD_TOP + plotH} className="trend-axis-line" />
            {xTicks.map((tick) => (
              <text key={tick.x} x={tick.x} y={PAD_TOP + plotH + AXIS_H - 3} textAnchor={tick.anchor} className="trend-axis-label">{tick.label}</text>
            ))}
          </svg>
          {hoverIndex != null && hoverFraction != null && (
            <div
              className="trend-tooltip"
              style={{
                left: `${hoverFraction * 100}%`,
                transform: hoverFraction < 0.25 ? "translateX(0)" : hoverFraction > 0.75 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {hasTime && <div className="trend-tooltip-time">{tooltipTime(times![hoverIndex])}</div>}
              {series.map((s) => (
                <div key={s.key} className="trend-tooltip-row">
                  <span><i style={{ background: s.color }} />{s.label}</span>
                  <b>{fmt(s.points[hoverIndex], decimals)}{Number.isFinite(s.points[hoverIndex]) ? unit : ""}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
