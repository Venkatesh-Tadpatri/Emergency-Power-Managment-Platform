import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";

import { IconAlert, IconBell, IconBuilding, IconDashboard, IconMap, IconResellers, IconSearch, IconSettings, IconUsers } from "../common/Icons";
import { useAlarms } from "../../queries/alarms";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { useHeader } from "./HeaderContext";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  reseller_admin: "Reseller Admin",
  company_admin: "Company Admin",
  system_operator: "System Operator",
  system_viewer: "System Viewer",
};

export function Header() {
  const { title, breadcrumb } = useHeader();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: reseller } = useReseller(me?.reseller_id || undefined);
  const { data: company } = useCompany(me?.company_id || undefined);
  const { data: alarms } = useAlarms(
    {
      resellerId: me?.role === "reseller_admin" ? me.reseller_id ?? undefined : undefined,
      companyId: me?.role && ["company_admin", "system_operator", "system_viewer"].includes(me.role) ? me.company_id ?? undefined : undefined,
    },
    { enabled: me?.role === "superadmin" || !!me?.reseller_id || !!me?.company_id }
  );
  const unackedCount = (alarms || []).filter((a) => a.status === "active" && !a.ack_by).length;
  // Zitadel's ID token here doesn't carry name/email claims — `me` (from our own
  // /api/me, backed by the UserInfo-endpoint fetch) is the reliable source.
  const displayName = me?.display_name || me?.email || auth.user?.profile.name || auth.user?.profile.email;
  const displayEmail = me?.email || auth.user?.profile.email;
  const roleLabel = me ? (me.role && ROLE_LABEL[me.role]) || "No role assigned" : "Signed in";
  const firstName = (displayName || "there").split(/[\s@]/)[0];
  const headingDetails = {
    Dashboard: { icon: IconDashboard, subtitle: `Welcome back, ${firstName}!` },
    Resellers: { icon: IconResellers, subtitle: "View and manage reseller partners across your organization" },
    Companies: { icon: IconBuilding, subtitle: "View and manage all companies across your organization" },
    "Platform Users": { icon: IconUsers, subtitle: "Manage access, roles, and organization scope" },
    "Map View": { icon: IconMap, subtitle: "Monitor facilities and systems across the network" },
    Alarms: { icon: IconAlert, subtitle: "Review active events and power-system alerts" },
    Analytics: { icon: IconDashboard, subtitle: "Explore operational performance and system insights" },
    Settings: { icon: IconSettings, subtitle: "Configure platform preferences and integrations" },
  }[title] || { icon: IconDashboard, subtitle: "Emergency power management platform" };
  const HeadingIcon = headingDetails.icon;

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (location.pathname === "/resellers") {
      setSearchText(new URLSearchParams(location.search).get("search") || "");
    } else {
      setSearchText("");
    }
  }, [location.pathname, location.search]);

  const runSearch = () => {
    const query = searchText.trim();
    navigate(query ? `/resellers?search=${encodeURIComponent(query)}` : "/resellers");
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  const orgLabel = reseller?.name
    ? "Reseller"
    : company?.name
    ? "Company"
    : me?.role === "superadmin"
    ? null
    : null;
  const orgName = reseller?.name || company?.name;

  return (
    <div className="header">
      <div className="header-left">
        {breadcrumb.length > 0 && (
          <div className="breadcrumb-trail">
            {breadcrumb.map((b, i) => (
              <span key={i}>
                <span className="bc-link" onClick={b.onClick}>
                  {b.label}
                </span>
                <span className="bc-sep">&rsaquo;</span>
              </span>
            ))}
          </div>
        )}
        <div className="page-heading">
          <div className="page-heading-icon"><HeadingIcon size={23} /></div>
          <div className="page-heading-copy">
            <div className="page-title">{title}</div>
            <div className="page-heading-subtitle">{headingDetails.subtitle}</div>
          </div>
        </div>
      </div>
      <div className="header-right">
        <div className="search-box">
          <IconSearch size={13} />
          <input
            type="text"
            value={searchText}
            onChange={(e) => {
              const value = e.target.value;
              setSearchText(value);
              if (!value.trim() && location.pathname === "/resellers") {
                navigate("/resellers", { replace: true });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
            placeholder="Search resellers by name..."
          />
        </div>
        <div className="header-icon-btn">
          <IconBell size={16} />
          {unackedCount > 0 && <span className="header-icon-dot">{unackedCount > 9 ? "9+" : unackedCount}</span>}
        </div>
        <div className="header-user" ref={menuRef} onClick={() => setMenuOpen((v) => !v)}>
          <div className="header-user-avatar">{(displayEmail || "?").slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="header-user-name">{displayName || "Signed in"}</div>
            <div className="header-user-role">{roleLabel}</div>
          </div>

          {menuOpen && (
            <div className="header-user-menu">
              <div className="header-user-menu-name">{displayName || "Signed in"}</div>
              <div className="header-user-menu-email">{displayEmail}</div>
              <div className="header-user-menu-info">
                <div className="header-user-menu-row">
                  <span className="header-user-menu-label">Role</span>
                  <span className="header-user-menu-value">{roleLabel}</span>
                </div>
                {orgName && (
                  <div className="header-user-menu-row">
                    <span className="header-user-menu-label">{orgLabel}</span>
                    <span className="header-user-menu-value">{orgName}</span>
                  </div>
                )}
                {me?.scope_type && (
                  <div className="header-user-menu-row">
                    <span className="header-user-menu-label">Scope</span>
                    <span className="header-user-menu-value">
                      {me.scope_type === "assigned" ? "Assigned systems" : "Company-wide"}
                    </span>
                  </div>
                )}
              </div>
              <div className="header-user-menu-actions">
                <button
                  className="header-btn"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/profile");
                  }}
                >
                  View Profile
                </button>
                <button className="header-btn" onClick={() => auth.signoutRedirect()}>
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
