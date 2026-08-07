import { useEffect, useRef } from "react";

export function LoadProfileChart({
  loadProfile,
  ratedKw,
  peakKw,
  durationMin,
}: {
  loadProfile: number[];
  ratedKw: number;
  peakKw: number;
  durationMin: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || loadProfile.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = (canvas.width = canvas.offsetWidth * 2);
    const H = (canvas.height = canvas.offsetHeight * 2);
    ctx.scale(2, 2);
    const w = W / 2;
    const h2 = H / 2;
    const pad = { top: 30, right: 20, bottom: 40, left: 55 };
    const cw = w - pad.left - pad.right;
    const ch = h2 - pad.top - pad.bottom;
    const maxKW = Math.max(ratedKw, ...loadProfile) * 1.1;
    const pts = loadProfile;
    const xStep = cw / (pts.length - 1 || 1);
    const durationPerPoint = durationMin / (pts.length - 1 || 1);
    const toX = (i: number) => pad.left + i * xStep;
    const toY = (v: number) => pad.top + ch - (v / maxKW) * ch;
    const threshold = ratedKw * 0.3;

    ctx.clearRect(0, 0, w, h2);

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 0.5;
    for (let g = 0; g <= 5; g++) {
      const y = pad.top + (ch / 5) * g;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + cw, y);
      ctx.stroke();
      ctx.fillStyle = "#64748b";
      ctx.font = "9px JetBrains Mono";
      ctx.textAlign = "right";
      ctx.fillText(`${Math.round(maxKW - (maxKW / 5) * g)} kW`, pad.left - 6, y + 3);
    }

    ctx.fillStyle = "#64748b";
    ctx.font = "9px JetBrains Mono";
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(pts.length / 6));
    for (let i = 0; i < pts.length; i += step) {
      ctx.fillText(`${Math.round(i * durationPerPoint)}m`, toX(i), h2 - pad.bottom + 18);
    }

    const refY = toY(threshold);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pad.left, refY);
    ctx.lineTo(pad.left + cw, refY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 9px Inter";
    ctx.textAlign = "left";
    ctx.fillText(`30% Rated (${Math.round(threshold)} kW)`, pad.left + 4, refY - 5);

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    pts.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
    ctx.lineTo(toX(pts.length - 1), toY(0));
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, "rgba(6,182,212,0.25)");
    grad.addColorStop(1, "rgba(6,182,212,0.02)");
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#06b6d4";
    ctx.beginPath();
    pts.forEach((v, i) => (i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v))));
    ctx.stroke();

    const pi = pts.indexOf(Math.max(...pts));
    ctx.fillStyle = "#06b6d4";
    ctx.beginPath();
    ctx.arc(toX(pi), toY(pts[pi]), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 10px JetBrains Mono";
    ctx.textAlign = "center";
    ctx.fillText(`${peakKw} kW`, toX(pi), toY(pts[pi]) - 10);
  }, [loadProfile, ratedKw, peakKw, durationMin]);

  return <canvas ref={canvasRef} className="report-chart-canvas" />;
}
