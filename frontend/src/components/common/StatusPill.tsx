import { IconAlert, IconCheckCircle, IconFlask } from "./Icons";

const PILL_MAP: Record<string, string> = {
  normal: "pill-normal",
  emergency: "pill-emergency",
  alarm: "pill-alarm",
  warning: "pill-alarm",
  test: "pill-test",
  info: "pill-test",
  critical: "pill-emergency",
  online: "pill-normal",
  offline: "pill-offline",
};

const PILL_ICON: Record<string, typeof IconCheckCircle | null> = {
  normal: IconCheckCircle,
  emergency: IconAlert,
  critical: IconAlert,
  online: null,
  alarm: IconAlert,
  warning: IconAlert,
  test: IconFlask,
  info: null,
  offline: null,
};

// "active" here is an entity's own on/off status (company, reseller, site — see InfoCard),
// not an alarm's active/cleared state (alarms pass severity, not status, into this component)
// — shown as "Online" for now; once this is backed by real telemetry it can distinguish
// online from offline instead of only ever being "active".
const DEFAULT_LABEL: Record<string, string> = {
  normal: "Online",
  active: "Online",
  online: "Online",
  offline: "Offline",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const cls = PILL_MAP[status] || "pill-normal";
  const text = label || DEFAULT_LABEL[status] || status.charAt(0).toUpperCase() + status.slice(1);
  const Icon = PILL_ICON[status];
  return (
    <span className={`status-pill ${cls}`}>
      {Icon ? <Icon size={10} strokeWidth={2.5} /> : <span className="pill-dot" />}
      {text}
    </span>
  );
}
