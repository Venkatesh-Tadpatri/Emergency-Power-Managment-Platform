import { useMemo } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { MonitoredAsset } from "../../types/entities";

import { QueryState } from "../../components/common/QueryState";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useResellers } from "../../queries/resellers";
import { useAllAts, useAllGenerators, useAllPanels, useSites, useSystems } from "../../queries/systems";

export function DeviceAdministration() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const meQuery = useMe(true);
  const resellerId = params.get("reseller") || "";
  const resellersQuery = useResellers();
  const companiesQuery = useCompanies(resellerId || undefined);
  const resellers = (resellersQuery.data || []).filter((reseller) => reseller.status !== "archived");
  const companies = (companiesQuery.data || []).filter((company) => company.status !== "archived");
  const companyId = params.get("company") || "";
  const siteId = params.get("site") || "";
  const systemId = params.get("system") || "all";
  const sitesQuery = useSites(companyId || undefined);
  const systemsQuery = useSystems(companyId || undefined, siteId || undefined);
  const panelsQuery = useAllPanels(meQuery.data?.role === "superadmin");
  const sites = (sitesQuery.data || []).filter((site) => site.status !== "archived");
  const systems = (systemsQuery.data || []).filter((system) => !system.archived);

  usePageHeader("Device Administration", []);

  const updateScope = (next: { reseller?: string; company?: string; site?: string; system?: string }) => {
    const reseller = next.reseller ?? resellerId;
    const company = next.company ?? companyId;
    const site = next.site ?? siteId;
    const system = next.system ?? systemId;
    const updated = new URLSearchParams();
    if (reseller) updated.set("reseller", reseller);
    if (company) updated.set("company", company);
    if (site) updated.set("site", site);
    if (system && system !== "all") updated.set("system", system);
    setParams(updated);
  };

  const visiblePanels = useMemo(() => {
    const visibleSystemIds = new Set(systems.filter((system) => systemId === "all" || system.id === systemId).map((system) => system.id));
    return (panelsQuery.data || []).filter((panel) => visibleSystemIds.has(panel.system_id));
  }, [panelsQuery.data, systemId, systems]);
  const systemById = new Map(systems.map((system) => [system.id, system]));
  const shownSystems = systems.filter((system) => systemId === "all" || system.id === systemId);
  // Per-panel device counts, using the same sources as the system's own device page: generators and
  // ATS units from their registries, meters from the system's monitored assets.
  const isSuperadmin = meQuery.data?.role === "superadmin";
  const generatorsQuery = useAllGenerators(isSuperadmin);
  const atsQuery = useAllAts(isSuperadmin);
  const allGenerators = generatorsQuery.data || [];
  const allAts = atsQuery.data || [];
  const assetQueries = useQueries({ queries: shownSystems.map((system) => ({
    queryKey: ["monitored-assets", system.id],
    queryFn: async () => (await api.get<MonitoredAsset[]>("/api/monitored-assets", { params: { system_id: system.id }, timeout: 10_000 })).data,
    staleTime: 30_000,
    enabled: isSuperadmin,
  })) });
  // Never show 0 for data that simply hasn't arrived yet.
  const countLoading = { generators: generatorsQuery.isPending, ats: atsQuery.isPending, meters: assetQueries.some((query) => query.isPending) };
  const countsByPanel = useMemo(() => {
    const counts = new Map<string, { generators: number; ats: number; meters: number }>();
    const bump = (panelId: string | null | undefined, key: "generators" | "ats" | "meters") => {
      if (!panelId) return;
      const entry = counts.get(panelId) || { generators: 0, ats: 0, meters: 0 };
      entry[key] += 1;
      counts.set(panelId, entry);
    };
    allGenerators.forEach((item) => bump(item.panel_id, "generators"));
    allAts.forEach((item) => bump(item.panel_id, "ats"));
    assetQueries.forEach((query) => (query.data || []).forEach((asset) => { if (asset.asset_type === "meter") bump(asset.panel_id, "meters"); }));
    return counts;
  }, [generatorsQuery.data, atsQuery.data, assetQueries]); // eslint-disable-line react-hooks/exhaustive-deps
  const siteById = new Map(sites.map((site) => [site.id, site]));

  if (meQuery.isPending) return <QueryState loading title="Checking device administration access…" />;
  if (meQuery.data?.role !== "superadmin") return <Navigate to="/" replace />;

  return <div className="device-admin-portfolio">
    <div className="ma-head">
      <div><h2>Device Administration</h2><p>Select a reseller, customer and site to review every PLC panel, or narrow the view to one system for configuration.</p></div>
    </div>
    <div className="device-admin-selectors">
      <label><span>Reseller</span><select value={resellerId} onChange={(event) => updateScope({ reseller: event.target.value, company: "", site: "", system: "all" })}><option value="">Select reseller</option>{resellers.map((reseller) => <option key={reseller.id} value={reseller.id}>{reseller.name}</option>)}</select></label>
      <label><span>Customer</span><select value={companyId} disabled={!resellerId} onChange={(event) => updateScope({ company: event.target.value, site: "", system: "all" })}><option value="">Select customer</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      <label><span>Site</span><select value={siteId} disabled={!companyId} onChange={(event) => updateScope({ site: event.target.value, system: "all" })}><option value="">Select site</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
      <label><span>System</span><select value={systemId} disabled={!siteId} onChange={(event) => updateScope({ system: event.target.value })}><option value="all">All systems</option>{systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}</select></label>
    </div>
    {!resellerId || !companyId || !siteId ? <div className="ma-empty">Select a reseller, customer and site to view its panels.</div> : panelsQuery.isLoading || systemsQuery.isLoading ? <QueryState loading title="Loading panels…" /> : <>
      <div className="section-header"><div><div className="section-title">{systemId === "all" ? "All Panels" : `${systemById.get(systemId)?.name || "System"} Panels`}</div><div className="section-sub">{visiblePanels.length} panel{visiblePanels.length === 1 ? "" : "s"} across {systemId === "all" ? `${systems.length} systems` : "the selected system"}</div></div></div>
      {/* One block per system: the system is named once in its header, its panels sit inside it, and
          every system — with or without panels — has its own create/manage buttons. */}
      {shownSystems.length ? <div className="device-admin-system-groups">{shownSystems.map((system) => {
        const systemPanels = visiblePanels.filter((panel) => panel.system_id === system.id);
        const siteName = siteById.get(system.site_id)?.name || system.site_name || "Site";
        return <section key={system.id} className="device-admin-system-group" aria-label={`${system.name} panels`}>
          <header className="device-admin-system-head">
            <div className="device-admin-system-title">
              <span className="device-panel-icon">▦</span>
              <div><small>{siteName}</small><h3>{system.name}</h3><span>{systemPanels.length} panel{systemPanels.length === 1 ? "" : "s"}</span></div>
            </div>
            <div className="device-admin-system-actions">
              <button type="button" className="header-btn primary" onClick={() => navigate(`/systems/${system.id}/device-administration?addPanel=1`)}>+ Create panel &amp; manage devices</button>
              {systemPanels.length > 0 && <button type="button" className="header-btn" onClick={() => navigate(`/systems/${system.id}/device-administration`)}>Manage devices →</button>}
            </div>
          </header>
          {systemPanels.length ? <div className="device-admin-panel-table-wrap"><table className="data-table device-admin-panel-table">
            <thead><tr><th>Sl.</th><th>Panel ID</th><th>Panel name</th><th>PLC serial</th><th>Location</th><th>Status</th><th>Configuration</th><th className="device-admin-count-head">Generators</th><th className="device-admin-count-head">ATS</th><th className="device-admin-count-head">Meters</th></tr></thead>
            <tbody>{systemPanels.map((panel, index) => { const online = panel.connection_status === "online"; return <tr key={panel.id} className="device-admin-panel-row" tabIndex={0}
              onClick={() => navigate(`/systems/${panel.system_id}/device-administration`)}
              onKeyDown={(event) => { if (event.key === "Enter") navigate(`/systems/${panel.system_id}/device-administration`); }}>
              <td className="mono">{String(index + 1).padStart(2, "0")}</td>
              <td><code className="device-admin-panel-id">{panel.panel_mqtt_id || "Pending"}</code></td>
              <td><strong>{panel.name}</strong></td>
              <td className="mono">{panel.plc_serial || "Not set"}</td>
              <td>{panel.location || <span className="device-admin-muted">Not set</span>}</td>
              <td><span className={`device-admin-status ${online ? "online" : "offline"}`}><i />{online ? "Online" : (panel.connection_status || "Offline")}</span></td>
              <td><span className={panel.sync_status === "in_sync" ? "sync-ok" : "sync-pending"}>{panel.sync_status === "in_sync" ? "In sync" : "Changes pending"}</span></td>
              {(["generators", "ats", "meters"] as const).map((key) => { const value = countsByPanel.get(panel.id)?.[key] ?? 0; const loading = countLoading[key]; return <td key={key} className="device-admin-count"><span className={value ? "has" : ""}>{loading ? "…" : value}</span></td>; })}
            </tr>; })}</tbody>
          </table></div> : <div className="device-admin-empty-state">
            <span className="device-panel-icon">▦</span>
            <div><strong>No panels configured for {system.name}</strong><p>Create the first PLC panel, then add generators, ATS units, meters, breakers and other monitored assets.</p></div>
          </div>}
        </section>;
      })}</div> : <div className="ma-empty">No active systems in this site.</div>}
    </>}
  </div>;
}
