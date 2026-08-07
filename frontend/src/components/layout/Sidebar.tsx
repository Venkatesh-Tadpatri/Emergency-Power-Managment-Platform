import type { ComponentType } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";

import {
  IconAlert,
  IconBuilding,
  IconDashboard,
  IconMap,
  IconPhone,
  IconReport,
  IconResellers,
  IconSettings,
  IconUsers,
} from "../common/Icons";
import { useMe } from "../../queries/me";
import { useCompany } from "../../queries/companies";
import { useAlarms } from "../../queries/alarms";
import { useReseller } from "../../queries/resellers";
import { useSystem, useSystems } from "../../queries/systems";

const DOT: Record<string, string> = {
  normal: "dot-green",
  emergency: "dot-red",
  alarm: "dot-amber",
  test: "dot-purple",
  offline: "dot-green",
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
    <div className={`nav-item${active ? " active" : ""}`} onClick={onClick}>
      {Icon && (
        <span className="nav-icon-badge" style={{ background: `${color}18`, color }}>
          <Icon size={13} />
        </span>
      )}
      {label}
      {!!badge && <span className="nav-badge">{badge}</span>}
    </div>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: me } = useMe(auth.isAuthenticated);

  const resellerMatch = useMatch("/resellers/:resellerId/*");
  const companyMatch = useMatch("/companies/:companyId/*");
  const systemMatch = useMatch("/systems/:systemId");

  const resellerId = resellerMatch?.params.resellerId;
  const companyIdFromRoute = companyMatch?.params.companyId;
  const systemId = systemMatch?.params.systemId;

  const { data: systemForNav } = useSystem(systemId);
  const companyId = companyIdFromRoute || systemForNav?.company_id;

  const { data: reseller } = useReseller(resellerId);
  const { data: company } = useCompany(companyId);
  const { data: systems } = useSystems(companyId);
  const { data: companyAlarms } = useAlarms({ companyId: companyId });
  const { data: resellerAlarms } = useAlarms({ resellerId });

  const path = window.location.pathname;

  if (companyId && company) {
    const activeAlarms = (companyAlarms || []).filter((a) => a.status === "active");
    // Only superadmin/reseller_admin can actually view a reseller dashboard — for
    // company-scoped roles, don't link back to a page the backend will 403/404 on.
    const canViewReseller = me?.role === "superadmin" || me?.role === "reseller_admin";
    return (
      <div className="sidebar-nav">
        {canViewReseller ? (
          <div className="scope-header" onClick={() => navigate(company.reseller_id ? `/resellers/${company.reseller_id}` : "/resellers")}>
            <span className="scope-back-label">&larr; {reseller?.name || "Back"}</span>
          </div>
        ) : (
          <div className="scope-header" style={{ cursor: "default" }} onClick={() => navigate("/")}>
            <span className="scope-back-label">&larr; Dashboard</span>
          </div>
        )}
        <div className="scope-title">{company.name}</div>
        <div className="scope-subtitle">{company.address}</div>
        <div className="nav-section">
          <div className="nav-section-label">Overview</div>
          <NavItem icon={IconDashboard} color="#4f46e5" label="Dashboard" active={path === `/companies/${companyId}`} onClick={() => navigate(`/companies/${companyId}`)} />
          <NavItem icon={IconMap} color="#2563eb" label="Map View" active={path.endsWith("/map")} onClick={() => navigate(`/companies/${companyId}/map`)} />
        </div>
        <div className="nav-section">
          <div className="nav-section-label">Systems</div>
          {(systems || []).map((s) => (
            <div
              key={s.id}
              className={`nav-item sys-nav-item${systemId === s.id ? " active" : ""}`}
              onClick={() => navigate(`/systems/${s.id}`)}
            >
              <span className={`sys-dot ${DOT[s.status] || "dot-green"}`} />
              <span className="sys-nav-name">{s.name}</span>
            </div>
          ))}
        </div>
        <div className="nav-section">
          <div className="nav-section-label">Monitoring</div>
          <NavItem icon={IconAlert} color="#dc2626" label="Alarms" active={path.endsWith("/alarms")} badge={activeAlarms.length} onClick={() => navigate(`/companies/${companyId}/alarms`)} />
          <NavItem icon={IconPhone} color="#0e7490" label="On-Call" active={path.endsWith("/oncall")} onClick={() => navigate(`/companies/${companyId}/oncall`)} />
          <NavItem icon={IconReport} color="#2563eb" label="Analytics" active={path === "/analytics"} onClick={() => navigate("/analytics")} />
        </div>
        <div className="nav-section">
          <div className="nav-section-label">Administration</div>
          <NavItem icon={IconUsers} color="#7c3aed" label="Users" active={path.endsWith("/users")} onClick={() => navigate(`/companies/${companyId}/users`)} />
          <NavItem icon={IconReport} color="#2563eb" label="Reports" active={path.includes("/reports")} onClick={() => navigate(`/companies/${companyId}/reports`)} />
        </div>
      </div>
    );
  }

  if (resellerId && reseller) {
    const activeAlarms = (resellerAlarms || []).filter((a) => a.status === "active");
    return (
      <div className="sidebar-nav">
        <div className="scope-header" onClick={() => navigate("/resellers")}>
          <span className="scope-back-label">&larr; All Resellers</span>
        </div>
        <div className="scope-title">{reseller.name}</div>
        <div className="scope-subtitle">Reseller Context</div>
        <div className="nav-section">
          <div className="nav-section-label">Overview</div>
          <NavItem icon={IconDashboard} color="#4f46e5" label="Dashboard" active={path === `/resellers/${resellerId}`} onClick={() => navigate(`/resellers/${resellerId}`)} />
          <NavItem icon={IconMap} color="#2563eb" label="Map View" active={path.endsWith("/map")} onClick={() => navigate(`/resellers/${resellerId}/map`)} />
        </div>
        <div className="nav-section">
          <div className="nav-section-label">Portfolio</div>
          <NavItem icon={IconBuilding} color="#16a34a" label="Companies" active={path.endsWith("/companies")} onClick={() => navigate(`/resellers/${resellerId}/companies`)} />
          <NavItem icon={IconUsers} color="#7c3aed" label="Users" active={path.endsWith("/users")} onClick={() => navigate(`/resellers/${resellerId}/users`)} />
        </div>
        <div className="nav-section">
          <div className="nav-section-label">Monitoring</div>
          <NavItem icon={IconAlert} color="#dc2626" label="Alarms" active={path.endsWith("/alarms")} badge={activeAlarms.length} onClick={() => navigate(`/resellers/${resellerId}/alarms`)} />
        </div>
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
      {me?.permissions.manage_resellers && (
        <div className="nav-section">
          <div className="nav-section-label">Hierarchy</div>
          <NavItem icon={IconResellers} color="#7c3aed" label="Resellers" active={path.startsWith("/resellers")} onClick={() => navigate("/resellers")} />
          <NavItem icon={IconBuilding} color="#2563eb" label="Companies" active={path === "/companies"} onClick={() => navigate("/companies")} />
        </div>
      )}
      <div className="nav-section">
        <div className="nav-section-label">Monitoring</div>
        <NavItem icon={IconAlert} color="#dc2626" label="All Alarms" active={path === "/alarms"} onClick={() => navigate("/alarms")} />
        <NavItem icon={IconReport} color="#2563eb" label="Analytics" active={path === "/analytics"} onClick={() => navigate("/analytics")} />
      </div>
      <div className="nav-section">
        <div className="nav-section-label">Platform</div>
        {me?.permissions.manage_resellers && (
          <NavItem icon={IconUsers} color="#db2777" label="Users" active={path === "/users"} onClick={() => navigate("/users")} />
        )}
        <NavItem icon={IconSettings} color="#64748b" label="Settings" active={path === "/settings"} onClick={() => navigate("/settings")} />
      </div>
    </div>
  );
}
