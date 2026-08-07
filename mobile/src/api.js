const API_BASE = process.env.EXPO_PUBLIC_API_BASE?.replace(/\/$/, "");

export async function api(path, token, options = {}) {
  if (!API_BASE) throw new Error("EXPO_PUBLIC_API_BASE is not configured");

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "The request could not be completed.");
  }
  return response.status === 204 ? null : response.json();
}

export const getSystems = (token) => api("/api/systems", token);
export const getMe = (token) => api("/api/me", token);
export const getSystem = (id, token) => api(`/api/systems/${id}`, token);
export const getPanels = (systemId, token) => api(`/api/panels?system_id=${systemId}`, token);
export const getAts = (panelId, token) => api(`/api/ats?panel_id=${panelId}`, token);
export const getGenerators = (panelId, token) => api(`/api/generators?panel_id=${panelId}`, token);
export const getReports = (token, companyId, isSuperAdmin) =>
  companyId ? api(`/api/reports?company_id=${companyId}`, token) : isSuperAdmin ? api("/api/reports", token) : Promise.resolve([]);
export const getOnCall = (companyId, token) => companyId ? api(`/api/oncall?company_id=${companyId}`, token) : Promise.resolve([]);

export function getAlarms(me, token) {
  const params = me.role === "superadmin"
    ? ""
    : me.company_id
      ? `?company_id=${me.company_id}`
      : me.reseller_id
        ? `?reseller_id=${me.reseller_id}`
        : "";
  return params ? api(`/api/alarms${params}`, token) : Promise.resolve([]);
}
