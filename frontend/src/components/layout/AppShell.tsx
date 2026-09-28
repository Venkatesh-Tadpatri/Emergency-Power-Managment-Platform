import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";

import { IconChevronsLeft } from "../common/Icons";
import { useMe } from "../../queries/me";
import { HeaderProvider } from "./HeaderContext";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

const SIDEBAR_COLLAPSED_KEY = "cpc.sidebarCollapsed";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  reseller_admin: "Reseller Admin",
  company_admin: "Customer Admin",
  system_operator: "System Operator",
  system_viewer: "System Viewer",
};

export function AppShell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { data: me } = useMe(auth.isAuthenticated);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Private-browsing/storage-denied — collapse still works for this session.
      }
      return next;
    });
  };
  // Zitadel's ID token here doesn't carry name/email claims — `me` (from our own
  // /api/me, backed by the UserInfo-endpoint fetch) is the reliable source.
  const displayName = me?.display_name || me?.email || auth.user?.profile.name || auth.user?.profile.email;
  const displayEmail = me?.email || auth.user?.profile.email;
  const roleLabel = me ? (me.role && ROLE_LABEL[me.role]) || "No role assigned" : "Signed in";
  const initials = (displayEmail || "?").slice(0, 2).toUpperCase();

  return (
    <HeaderProvider>
      <div className={`sidebar${collapsed ? " collapsed" : ""}`}>
        <div className="sidebar-header">
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <IconChevronsLeft size={16} />
          </button>
          <img className="sidebar-logo" src="/images/solution61-logo.svg" alt="Solution 61" />
          <div className="sidebar-brand-copy">
            <div className="sidebar-brand"><span>CPC</span><span className="sidebar-brand-name">Critical Power Command</span></div>
          </div>
        </div>
        <Sidebar />
        <div className="sidebar-footer">
          <div className="avatar" style={{ cursor: "pointer" }} onClick={() => navigate("/profile")}>
            {initials}
          </div>
          <div style={{ cursor: "pointer" }} onClick={() => navigate("/profile")}>
            <div className="user-name">{displayName || "Signed in"}</div>
            <div className="user-role">{roleLabel}</div>
          </div>
          <button className="logout-btn" onClick={() => auth.signoutRedirect()}>
            Log out
          </button>
        </div>
      </div>
      <div className="main">
        <Header />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </HeaderProvider>
  );
}
