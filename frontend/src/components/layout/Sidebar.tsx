import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/LocalAuth";

import {
  IconAlert,
  IconBuilding,
  IconDashboard,
  IconMap,
  IconPanel,
  IconPhone,
  IconReport,
  IconResellers,
  IconSettings,
  IconUsers,
} from "../common/Icons";
import { useMe } from "../../queries/me";
import { useCompanies, useCompany } from "../../queries/companies";
import { useAlarms } from "../../queries/alarms";
import { useReseller, useResellers } from "../../queries/resellers";
import { useSite, useSites, useSystem, useSystems } from "../../queries/systems";
import { activeAlarmOnly } from "../../utils/alarmClassification";
import { useTelemetrySnapshots } from "../../hooks/useTelemetry";
import { setCurrentNavContext, useNavContext } from "./navContext";

const DOT: Record<string, string> = {
  normal: "dot-green",
  online: "dot-green",
  emergency: "dot-red",
  alarm: "dot-amber",
  test: "dot-purple",
  offline: "dot-gray",
};

function NavItem({
  label,
  onClick,
  active,
  badge,
  icon: Icon,
  color = "#6366f1",
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  badge?: number | null;
  icon?: ComponentType<{ size?: number }>;
  color?: string;
}) {
  return (
    <div className={`nav-item${active ? " active" : ""}`} onClick={onClick} title={label}>
      {Icon && (
        <span className="nav-icon-badge" style={{ background: `${color}18`, color }}>
          <Icon size={13} />
        </span>
      )}
      <span className="nav-item-label">{label}</span>
      {!!badge && <span className="nav-badge">{badge}</span>}
    </div>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const { data: me } = useMe(auth.isAuthenticated);
  // Keep the Super Admin hierarchy available while /api/me is loading or
  // recovering from a backend restart; the API still enforces authorization.
  const canManageHierarchy = me?.permissions.manage_resellers || (auth.isAuthenticated && !me);

  const path = location.pathname;
  const navContext = useNavContext();
  const savedContextPath = navContext?.contextPath;
  // A sidebar click carries the context it was made from (reseller → customer → site → system) in
  // router state, so the sidebar and header keep that context on whichever page it opens. Context
  // only changes through explicit hierarchy links (site/system items, the back link, breadcrumbs),
  // which navigate without this state.
  const hierarchyPath = savedContextPath || path;
  const borrowedContext = Boolean(savedContextPath) && savedContextPath !== path;
  const resellerMatch = matchPath("/resellers/:resellerId/*", hierarchyPath);
  const companyMatch = matchPath("/companies/:companyId/*", hierarchyPath);
  const siteMatch = matchPath("/companies/:companyId/sites/:siteId/*", hierarchyPath);
  const systemMatch = matchPath("/systems/:systemId/*", hierarchyPath);

  const routeResellerId =
    resellerMatch?.params.resellerId === "archived" ? undefined : resellerMatch?.params.resellerId;
  // A reseller administrator always keeps the reseller navigation shell, including while
  // drilling into one of their customers, sites, or systems.
  const resellerId = routeResellerId || (me?.role === "reseller_admin" ? me.reseller_id ?? undefined : undefined);
  const companyIdFromRoute = companyMatch?.params.companyId;
  const systemId = systemMatch?.params.systemId;
  const siteId = siteMatch?.params.siteId;

  const { data: systemForNav } = useSystem(systemId);
  const companyId = companyIdFromRoute || systemForNav?.company_id;
  const activeSiteId = (siteId === "archived" ? undefined : siteId) || systemForNav?.site_id;

  const { data: resellers } = useResellers();
  const { data: companiesForNav } = useCompanies(resellerId);
  const { data: company } = useCompany(companyId);
  const { data: reseller } = useReseller(resellerId || company?.reseller_id);
  const { data: activeSite } = useSite(activeSiteId);
  const { data: sites } = useSites(companyId);
  const { data: systems } = useSystems(companyId, activeSiteId, Boolean(activeSiteId));
  const { data: companyAlarms } = useAlarms({ companyId: companyId });
  const { data: resellerAlarms } = useAlarms({ resellerId });
  const activeSystemsForTelemetry = (systems || []).filter((system) => !system.archived);
  const sidebarTelemetry = useTelemetrySnapshots(activeSiteId ? activeSystemsForTelemetry.map((system) => system.id) : []);
  const [rememberedCompanyId, setRememberedCompanyId] = useState<string>();
  const companyMemoryKey = resellerId ? `cpc:reseller:${resellerId}:selected-company` : "";
  useEffect(() => {
    if (!companyMemoryKey) return;
    if (companyId) {
      localStorage.setItem(companyMemoryKey, companyId);
      setRememberedCompanyId(companyId);
      return;
    }
    setRememberedCompanyId(localStorage.getItem(companyMemoryKey) || undefined);
  }, [companyId, companyMemoryKey]);
  const activeCompaniesForNav = (companiesForNav || []).filter((item) => item.status !== "archived");
  const settingsCompanyId = companyId
    || activeCompaniesForNav.find((item) => item.id === rememberedCompanyId)?.id
    || activeCompaniesForNav[0]?.id;

  const contextBreadcrumb = [
    reseller && { label: "Active Resellers", path: "/resellers" },
    reseller && { label: reseller.name, path: `/resellers/${reseller.id}/companies` },
    company && { label: company.name, path: `/companies/${company.id}` },
    activeSite && { label: activeSite.name, path: `/companies/${companyId}/sites/${activeSite.id}` },
    systemForNav && { label: systemForNav.name, path: `/systems/${systemForNav.id}` },
  ].filter(Boolean);
  const platformNavigationState = borrowedContext && navContext
    ? navContext
    : { contextPath: hierarchyPath, contextBreadcrumb };
  // Only a real hierarchy context (reseller/customer/site/system) is worth carrying elsewhere.
  setCurrentNavContext(platformNavigationState.contextBreadcrumb.length ? platformNavigationState as { contextPath: string; contextBreadcrumb: { label: string; path: string }[] } : null);
  /** Navigate to a sidebar destination while keeping the current hierarchy context. */
  const go = (to: string) => navigate(to, { state: platformNavigationState });

  // Platform-wide links stay pinned at the bottom of the sidebar in every
  // context (global, reseller, customer) so they never disappear while drilling down.
  // Reseller Users lives here too, so it stays reachable from the reseller pages and while drilled
  // into any of that reseller's customers, sites or systems. A reseller admin always gets their own
  // reseller's users; a superadmin gets the reseller currently in context.
  const usersResellerId = me?.role === "reseller_admin"
    ? me.reseller_id ?? undefined
    : me?.role === "superadmin" ? resellerId || company?.reseller_id || undefined : undefined;
  const platformSection = (
    <div className="nav-section">
      <div className="nav-section-label">Platform</div>
      {canManageHierarchy && (
        <NavItem icon={IconUsers} color="#db2777" label="Users" active={path === "/users"} onClick={() => go("/users")} />
      )}
      {usersResellerId && (
        <NavItem icon={IconUsers} color="#7c3aed" label="Reseller Users" active={path === `/resellers/${usersResellerId}/users`} onClick={() => go(`/resellers/${usersResellerId}/users`)} />
      )}
      <NavItem icon={IconSettings} color="#64748b" label="Settings" active={path === "/settings"} onClick={() => go("/settings")} />
    </div>
  );

  const sidebarSystemStatus = (system: { id: string; status: string }) => {
    const telemetry = sidebarTelemetry.get(system.id);
    if (!telemetry?.storage?.has_data || !telemetry.storage.mqtt_connected) return "offline";
    if (activeAlarmOnly(companyAlarms).some((alarm) => alarm.system_id === system.id)) return "alarm";
    if (telemetry.ats?.some((item) => item.status === "EMERGENCY" || item.connected_source === "GENERATOR")) return "emergency";
    if (telemetry.generators?.some((item) => item.test_mode || item.status === "TEST")) return "test";
    if (telemetry.generators?.some((item) => item.fault_active || !item.communication_healthy || item.status === "FAULT") || telemetry.ats?.some((item) => item.fault_active || !item.communication_healthy || item.status === "FAULT")) return "alarm";
    return "normal";
  };

  if (companyId && company) {
    const activeSystemsForNav = (systems || []).filter((system) => !system.archived);
    const archivedSystemsForNav = (systems || []).filter((system) => system.archived);
    const visibleSystemIds = new Set(activeSystemsForNav.map((system) => system.id));
    const activeAlarms = activeAlarmOnly(companyAlarms).filter((alarm) =>
      !activeSiteId || visibleSystemIds.has(alarm.system_id));
    // Only superadmin/reseller_admin can actually view a reseller dashboard — for
    // company-scoped roles, don't link back to a page the backend will 403/404 on.
    const canViewReseller = me?.role === "superadmin" || me?.role === "reseller_admin";
    const backTarget = systemId && activeSiteId
      ? `/companies/${companyId}/sites/${activeSiteId}`
      : activeSiteId
        ? `/companies/${companyId}`
        : company.reseller_id
          ? `/resellers/${company.reseller_id}`
          : "/resellers";
    const backLabel = systemId && activeSiteId
      ? activeSite?.name || "Site"
      : activeSiteId
        ? company.name
        : reseller?.name || "Back";
    const showBack = Boolean(activeSiteId) || canViewReseller;
    return (
      <div className="sidebar-nav">
        {showBack && (
          <div className="scope-header" onClick={() => navigate(backTarget)}>
            <span className="scope-back-label">&larr; {backLabel}</span>
          </div>
        )}
        <div className="scope-title">{company.name}</div>
        <div className="scope-subtitle">{company.address}</div>
        <div className="nav-section">
          <div className="nav-section-label">Overview</div>
          <NavItem icon={IconDashboard} color="#4f46e5" label="Dashboard" active={path === `/companies/${companyId}`} onClick={() => go(`/companies/${companyId}`)} />
          <NavItem icon={IconMap} color="#2563eb" label="Map View" active={path.endsWith("/map")} onClick={() => go(`/companies/${companyId}/map`)} />
        </div>
        <div className="nav-section">
          <div className="nav-section-label">{activeSiteId ? "Active Systems" : "Active Sites"}</div>
          {!activeSiteId && (sites || []).filter((site) => site.status !== "archived").map((site) => (
            <div key={site.id} className={`nav-item sys-nav-item${!borrowedContext && activeSiteId === site.id ? " active" : ""}`} onClick={() => navigate(`/companies/${companyId}/sites/${site.id}`)} title={site.name}>
              <span className="sys-dot dot-green" />
              <span className="sys-nav-name">{site.name}</span>
            </div>
          ))}
          {!activeSiteId && <NavItem icon={IconMap} color="#64748b" label="Archived Sites" active={path === `/companies/${companyId}/sites/archived`} badge={(sites || []).filter((site) => site.status === "archived").length} onClick={() => go(`/companies/${companyId}/sites/archived`)} />}
          {activeSiteId && activeSystemsForNav.map((s) => (
            <div
              key={s.id}
              className={`nav-item sys-nav-item${!borrowedContext && systemId === s.id ? " active" : ""}`}
              onClick={() => navigate(`/systems/${s.id}`)}
              title={s.name}
            >
              <span className={`sys-dot ${DOT[sidebarSystemStatus(s)] || "dot-gray"}`} />
              <span className="sys-nav-name">{s.name}</span>
            </div>
          ))}
          {activeSiteId && <NavItem icon={IconPanel} color="#64748b" label="Archived Systems" active={path === `/companies/${companyId}/sites/${activeSiteId}/systems/archived`} badge={archivedSystemsForNav.length} onClick={() => go(`/companies/${companyId}/sites/${activeSiteId}/systems/archived`)} />}
        </div>
        <div className="nav-section">
          <div className="nav-section-label">Monitoring</div>
          <NavItem icon={IconAlert} color="#dc2626" label="Alarms" active={path.endsWith("/alarms")} badge={activeAlarms.length} onClick={() => go(activeSiteId ? `/companies/${companyId}/sites/${activeSiteId}/alarms` : `/companies/${companyId}/alarms`)} />
          <NavItem icon={IconPhone} color="#0e7490" label="On-Call" active={path.endsWith("/oncall")} onClick={() => go(`/companies/${companyId}/oncall`)} />
          <NavItem icon={IconReport} color="#2563eb" label="Analytics" active={path === "/analytics"} onClick={() => go(`/analytics?companyId=${companyId}${activeSiteId ? `&siteId=${activeSiteId}` : ""}`)} />
          <NavItem icon={IconReport} color="#0891b2" label="Reports" active={path.includes("/reports")} onClick={() => go(`/companies/${companyId}/reports`)} />
        </div>
        {(me?.permissions.manage_company_users || me?.role === "superadmin" || me?.role === "reseller_admin") && <div className="nav-section">
          <div className="nav-section-label">Administration</div>
          {me?.permissions.manage_company_users && <NavItem icon={IconSettings} color="#7c3aed" label="Customer Settings" active={path.endsWith("/settings") && path.startsWith("/companies/")} onClick={() => go(`/companies/${companyId}/settings`)} />}
          {me?.role === "reseller_admin" && resellerId && <NavItem icon={IconSettings} color="#0891b2" label="Branding" active={path.endsWith("/branding")} onClick={() => go(`/resellers/${resellerId}/branding`)} />}
          {me?.role === "superadmin" && <NavItem icon={IconSettings} color="#0891b2" label="Device Administration" active={path.endsWith("/device-administration")} onClick={() => go(`/device-administration?${company.reseller_id ? `reseller=${company.reseller_id}&` : ""}company=${companyId}${activeSiteId ? `&site=${activeSiteId}` : ""}${systemId ? `&system=${systemId}` : ""}`)} />}
        </div>}
        {platformSection}
      </div>
    );
  }

  if (resellerId && reseller) {
    const activeAlarms = activeAlarmOnly(resellerAlarms);
    return (
      <div className="sidebar-nav">
        {me?.role === "superadmin" && (
          <div className="scope-header" onClick={() => navigate("/resellers")}>
            <span className="scope-back-label">&larr; Back</span>
          </div>
        )}
        <div className="scope-title">{reseller.name}</div>
        <div className="scope-subtitle">Reseller Context</div>
        <div className="nav-section">
          <div className="nav-section-label">Overview</div>
          <NavItem icon={IconDashboard} color="#4f46e5" label="Dashboard" active={path === "/"} onClick={() => navigate("/")} />
          <NavItem icon={IconMap} color="#2563eb" label="Map View" active={path.endsWith("/map")} onClick={() => navigate(`/resellers/${resellerId}/map`)} />
        </div>
        <div className="nav-section">
          <div className="nav-section-label">Portfolio</div>
          <NavItem icon={IconBuilding} color="#16a34a" label="Active Customers" active={path === `/resellers/${resellerId}/companies`} onClick={() => navigate(`/resellers/${resellerId}/companies`)} />
          <NavItem icon={IconBuilding} color="#64748b" label="Archived Customers" active={path === `/resellers/${resellerId}/companies/archived`} badge={(companiesForNav || []).filter((company) => company.status === "archived").length} onClick={() => navigate(`/resellers/${resellerId}/companies/archived`)} />
        </div>
        <div className="nav-section">
          <div className="nav-section-label">Monitoring</div>
          <NavItem icon={IconAlert} color="#dc2626" label="Alarms" active={path.endsWith("/alarms")} badge={activeAlarms.length} onClick={() => navigate(`/resellers/${resellerId}/alarms`)} />
        </div>
        {me?.role === "superadmin" && <div className="nav-section">
          <div className="nav-section-label">Administration</div>
          <NavItem icon={IconSettings} color="#0891b2" label="Device Administration" active={path === "/device-administration"} onClick={() => navigate(`/device-administration?reseller=${resellerId}`)} />
        </div>}
        {me?.role === "reseller_admin" && me.reseller_id === resellerId && <div className="nav-section">
          <div className="nav-section-label">Administration</div>
          {settingsCompanyId && me.permissions.manage_company_users && <NavItem icon={IconSettings} color="#7c3aed" label="Customer Settings" active={path.endsWith("/settings") && path.startsWith("/companies/")} onClick={() => navigate(`/companies/${settingsCompanyId}/settings`)} />}
          <NavItem icon={IconSettings} color="#0891b2" label="Branding" active={path.endsWith("/branding")} onClick={() => go(`/resellers/${resellerId}/branding`)} />
        </div>}
        {platformSection}
      </div>
    );
  }

  return (
    <div className="sidebar-nav">
      <div className="nav-section">
        <div className="nav-section-label">Overview</div>
        <NavItem icon={IconDashboard} color="#4f46e5" label="Dashboard" active={path === "/"} onClick={() => navigate("/")} />
        <NavItem icon={IconMap} color="#2563eb" label="Map View" active={path === "/map"} onClick={() => navigate("/map")} />
      </div>
      {canManageHierarchy && (
        <div className="nav-section">
          <div className="nav-section-label">Hierarchy</div>
          <NavItem icon={IconResellers} color="#7c3aed" label="Active Resellers" active={path === "/resellers"} onClick={() => navigate("/resellers")} />
          <NavItem icon={IconBuilding} color="#2563eb" label="Active Customers" active={path === "/companies"} onClick={() => navigate("/companies")} />
          <NavItem icon={IconBuilding} color="#64748b" label="Archived Customers" active={path === "/companies/archived"} badge={(companiesForNav || []).filter((company) => company.status === "archived").length} onClick={() => navigate("/companies/archived")} />
          <NavItem
            icon={IconResellers}
            color="#64748b"
            label="Archived Resellers"
            active={path === "/resellers/archived"}
            badge={(resellers || []).filter((r) => r.status === "archived").length}
            onClick={() => navigate("/resellers/archived")}
          />
        </div>
      )}
      <div className="nav-section">
        <div className="nav-section-label">Monitoring</div>
        <NavItem icon={IconAlert} color="#dc2626" label="All Alarms" active={path === "/alarms"} onClick={() => navigate("/alarms")} />
        <NavItem icon={IconReport} color="#2563eb" label="Analytics" active={path === "/analytics"} onClick={() => navigate("/analytics")} />
      </div>
      {me?.role === "superadmin" && <div className="nav-section">
        <div className="nav-section-label">Administration</div>
        <NavItem icon={IconSettings} color="#0891b2" label="Device Administration" active={path === "/device-administration"} onClick={() => navigate("/device-administration")} />
      </div>}
      {platformSection}
    </div>
  );
}
