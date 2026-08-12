import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";

import { useMe } from "../../queries/me";
import { HeaderProvider } from "./HeaderContext";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

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
  // Zitadel's ID token here doesn't carry name/email claims — `me` (from our own
  // /api/me, backed by the UserInfo-endpoint fetch) is the reliable source.
  const displayName = me?.display_name || me?.email || auth.user?.profile.name || auth.user?.profile.email;
  const displayEmail = me?.email || auth.user?.profile.email;
  const roleLabel = me ? (me.role && ROLE_LABEL[me.role]) || "No role assigned" : "Signed in";
  const initials = (displayEmail || "?").slice(0, 2).toUpperCase();

  return (
    <HeaderProvider>
      <div className="sidebar">
        <div className="sidebar-header">
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
