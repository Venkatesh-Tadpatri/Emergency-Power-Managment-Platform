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

export const getSystems = (token, { companyId, siteId } = {}) => {
  const params = new URLSearchParams();
  if (companyId) params.set("company_id", companyId);
  if (siteId) params.set("site_id", siteId);
  const query = params.toString();
  return api(`/api/systems${query ? `?${query}` : ""}`, token);
};
export const getMe = (token) => api("/api/me", token);
export const getResellers = (token) => api("/api/resellers", token);
export const getCompanies = (token, resellerId) => api(`/api/companies${resellerId ? `?reseller_id=${resellerId}` : ""}`, token);
export const getSites = (token, customerId) => api(`/api/sites${customerId ? `?customer_id=${customerId}` : ""}`, token);
export const getUsers = (token, isSuperAdmin) => (isSuperAdmin ? api("/api/users", token) : Promise.resolve([]));
export const assignUserSystems = (token, userId, systemIds, siteIds = []) =>
  api(`/api/users/${userId}/assigned-systems`, token, { method: "PATCH", body: JSON.stringify({ system_ids: systemIds, site_ids: siteIds }) });
export const getSystem = (id, token) => api(`/api/systems/${id}`, token);
export const getPanels = (systemId, token) => api(`/api/panels?system_id=${systemId}`, token);
export const getAts = (panelId, token) => api(`/api/ats?panel_id=${panelId}`, token);
export const getGenerators = (panelId, token) => api(`/api/generators?panel_id=${panelId}`, token);
// Unfiltered variants — used to compute per-system live status/counts in list views without an N+1 fetch per system.
export const getAllPanels = (token) => api("/api/panels", token);
export const getAllAts = (token) => api("/api/ats", token);
export const getAllGenerators = (token) => api("/api/generators", token);
export const createAts = (token, data) => api("/api/ats", token, { method: "POST", body: JSON.stringify(data) });
export const createGenerator = (token, data) => api("/api/generators", token, { method: "POST", body: JSON.stringify(data) });
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
