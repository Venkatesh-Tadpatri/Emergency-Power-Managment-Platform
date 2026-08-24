export type DeviceKind = "generator" | "ats";

const slugify = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const grafanaBaseUrl = () =>
  (import.meta.env.VITE_GRAFANA_URL || `http://${window.location.hostname}:3000`).replace(/\/$/, "");

const DASHBOARDS = {
  overview: { uid: "empm-system-overview", title: "CPC | System Overview" },
  generator: { uid: "empm-generator-trends", title: "CPC | Generator Performance Trending", panel: 1 },
  quality: { uid: "empm-power-quality", title: "CPC | Power Quality Analysis", panel: 1 },
} as const;

function dashboardUrl(key: keyof typeof DASHBOARDS, params: Record<string, string> = {}) {
  const dashboard = DASHBOARDS[key];
  const query = new URLSearchParams({ orgId: "1", ...params });
  return `${grafanaBaseUrl()}/d/${dashboard.uid}/${slugify(dashboard.title)}?${query.toString()}`;
}

/** Deep link to the dashboard covering a given Analytics tab. */
export function viewGrafanaUrl(view: "System overview" | "Generator performance" | "Power quality") {
  if (view === "Generator performance") return dashboardUrl("generator");
  if (view === "Power quality") return dashboardUrl("quality");
  return dashboardUrl("overview");
}

/** Deep link to a single device's full trend, zoomed into its primary panel and scoped by the equipment variable. */
export function deviceGrafanaUrl(kind: DeviceKind, equipmentId: string, equipmentName: string) {
  const key = kind === "generator" ? "generator" : "quality";
  const dashboard = DASHBOARDS[key];
  return dashboardUrl(key, {
    "var-equipment": equipmentId,
    "var-equipment_name": equipmentName,
    viewPanel: String(dashboard.panel),
  });
}
