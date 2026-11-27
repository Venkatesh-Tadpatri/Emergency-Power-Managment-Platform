import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/LocalAuth";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { UserDirectory } from "../../components/users/UserDirectory";
import { useCompanies } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useResellers } from "../../queries/resellers";
import { useAllUsers } from "../../queries/users";

export function PlatformUsers() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: me } = useMe(auth.isAuthenticated);
  const isSuperadmin = me?.role === "superadmin";
  const usersQuery = useAllUsers(isSuperadmin);
  const { data: resellers } = useResellers();
  const { data: companies } = useCompanies();
  // ?search= lets the global header search open this page pre-filtered.
  const [searchParams, setSearchParams] = useSearchParams();

  const contextBreadcrumb = Array.isArray(location.state?.contextBreadcrumb)
    ? location.state.contextBreadcrumb.map((item) => ({ label: item.label, onClick: () => navigate(item.path) }))
    : [];
  usePageHeader("Platform Users", contextBreadcrumb);

  if (me && !isSuperadmin) {
    return <div className="center-screen" style={{ height: "auto", padding: 40 }}>Only superadmins can manage platform-wide user roles.</div>;
  }

  return <>
    <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 16 }}>
      Create accounts with <b>+ Create User</b>. The person is emailed, activates the account with <b>First-time login</b> on the sign-in page (one-time code, then a new password), and appears here as Active. Then use <b>Assign Access</b> to give them a role — this is the only way to create a Reseller Admin.
    </p>
    <UserDirectory
      users={usersQuery.data || []}
      loading={usersQuery.isPending}
      companies={companies || []}
      resellers={resellers || []}
      canManage={isSuperadmin}
      meId={me?.id}
      search={searchParams.get("search") || ""}
      onSearchChange={(value) => setSearchParams(value ? { search: value } : {}, { replace: true })}
    />
  </>;
}
