import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../auth/LocalAuth";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { UserDirectory } from "../../components/users/UserDirectory";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useUsers } from "../../queries/users";
import { useSites, useSystems } from "../../queries/systems";

/** Customer Settings → Users: the same directory as Platform Users, locked to this customer. */
export function CompanyUsers({ embedded = false }) {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: company } = useCompany(companyId);
  // The API filters to this customer's users (company_id), so nothing from
  // other customers is ever loaded here.
  const usersQuery = useUsers(companyId);
  // So the Scope column can name each user's assigned sites and equipment.
  const { data: sites } = useSites(companyId);
  const { data: systems } = useSystems(companyId);
  const { data: me } = useMe(auth.isAuthenticated);
  const [search, setSearch] = useState("");

  usePageHeader(embedded ? "Customer Settings" : "Users", [{ label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) }]);

  return <UserDirectory
    users={usersQuery.data || []}
    loading={usersQuery.isPending}
    companyId={companyId}
    companies={company ? [company] : []}
    // Customer-level admins cannot load reseller records, so use the name the customer carries.
    resellers={company?.reseller_id ? [{ id: company.reseller_id, name: company.reseller_name || "—" }] : []}
    sites={sites || []}
    systems={systems || []}
    canManage={!!me?.permissions.manage_company_users}
    meId={me?.id}
    search={search}
    onSearchChange={setSearch}
  />;
}
