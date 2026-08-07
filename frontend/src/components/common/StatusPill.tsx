import { IconAlert, IconCheckCircle, IconFlask } from "./Icons";

const PILL_MAP: Record<string, string> = {
  normal: "pill-normal",
  emergency: "pill-emergency",
  alarm: "pill-alarm",
  warning: "pill-alarm",
  test: "pill-test",
  info: "pill-test",
  critical: "pill-emergency",
  offline: "pill-offline",
};

const PILL_ICON: Record<string, typeof IconCheckCircle | null> = {
  normal: IconCheckCircle,
  emergency: IconAlert,
  critical: IconAlert,
  alarm: IconAlert,
  warning: IconAlert,
  test: IconFlask,
  info: null,
  offline: null,
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const cls = PILL_MAP[status] || "pill-normal";
  const text = label || status.charAt(0).toUpperCase() + status.slice(1);
  const Icon = PILL_ICON[status];
  return (
    <span className={`status-pill ${cls}`}>
      {Icon ? <Icon size={10} strokeWidth={2.5} /> : <span className="pill-dot" />}
      {text}
    </span>
  );
}
