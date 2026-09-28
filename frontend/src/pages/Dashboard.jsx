import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { FleetHero } from "../components/common/FleetHero";
import { IconAlert, IconBuilding, IconPanel, IconResellers, IconSettings, IconUsers } from "../components/common/Icons";
import { InfoCard, StatsGrid } from "../components/common/StatCard";
import { usePageHeader } from "../components/layout/HeaderContext";
import { useCompanies } from "../queries/companies";
import { useMe } from "../queries/me";
import { useResellers } from "../queries/resellers";
import { useSites, useSystems } from "../queries/systems";

const REFRESH_MS = 30_000;

export function Dashboard() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: resellers, refetch: refetchResellers } = useResellers();
  const { data: companies, refetch: refetchCompanies } = useCompanies();
  const { data: sites, refetch: refetchSites } = useSites();
  const { data: systems, refetch: refetchSystems } = useSystems();
  usePageHeader("Dashboard");

  useEffect(() => {
    const timer = window.setInterval(() => [refetchResellers, refetchCompanies, refetchSites, refetchSystems].forEach((refetch) => void refetch()), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refetchCompanies, refetchResellers, refetchSites, refetchSystems]);

  if (me && me.role && !me.permissions.manage_resellers) {
    if (me.company_id) return <Navigate to={`/companies/${me.company_id}`} replace />;
    if (me.reseller_id) return <Navigate to={`/resellers/${me.reseller_id}`} replace />;
  }
  if (me && !me.role) return <div className="center-screen">Your account has no role assigned yet.</div>;

  const activeSites = (sites || []).filter((site) => site.status !== "archived");
  return <>
    <FleetHero />
    <StatsGrid stats={[{ label: "Total Resellers", value: resellers?.length ?? 0, color: "var(--purple)", icon: IconResellers, onClick: () => navigate("/resellers") }, { label: "Total Customers", value: companies?.length ?? 0, color: "var(--blue)", icon: IconBuilding, onClick: () => navigate("/companies") }, { label: "Total Sites", value: activeSites.length, color: "var(--amber)", icon: IconPanel }, { label: "Total Systems", value: systems?.length ?? 0, color: "var(--cyan)", icon: IconPanel }]} />
    <div className="section-header" style={{ marginTop: 22 }}><div><div className="section-title">Reseller Overview</div><div className="section-sub">Rollup status by reseller</div></div></div>
    <div className="card-grid dashboard-reseller-grid">{(resellers || []).map((reseller) => {
      const resellerCompanies = (companies || []).filter((company) => company.reseller_id === reseller.id);
      const companyIds = new Set(resellerCompanies.map((company) => company.id));
      const resellerSystems = (systems || []).filter((system) => companyIds.has(system.company_id));
      const offlineDevices = resellerSystems.filter((system) => system.status === "offline").length;
      return <InfoCard key={reseller.id} title={reseller.name} icon={IconResellers} stats={[{ label: "Customers", value: resellerCompanies.length, color: "var(--blue)" }, { label: "Sites", value: activeSites.filter((site) => companyIds.has(site.customer_id)).length, color: "var(--purple)" }, { label: "Total systems", value: resellerSystems.length, color: "var(--cyan)" }, { label: "Offline devices", value: offlineDevices, color: offlineDevices === 0 ? "var(--green)" : "var(--red)" }]} onClick={() => navigate(`/resellers/${reseller.id}`)} />;
    })}</div>
    {me?.permissions.manage_resellers && <><div className="section-header" style={{ marginTop: 22 }}><div><div className="section-title">Quick Actions</div></div></div><div className="quick-actions-grid"><button className="quick-action-btn" style={{ "--qa-color": "#7c3aed" }} onClick={() => navigate("/resellers")}><IconResellers size={18} />Resellers</button><button className="quick-action-btn" style={{ "--qa-color": "#dc2626" }} onClick={() => navigate("/alarms")}><IconAlert size={18} />All Alarms</button><button className="quick-action-btn" style={{ "--qa-color": "#db2777" }} onClick={() => navigate("/users")}><IconUsers size={18} />Users</button><button className="quick-action-btn" style={{ "--qa-color": "#64748b" }} onClick={() => navigate("/settings")}><IconSettings size={18} />Settings</button></div></>}
  </>;
}
