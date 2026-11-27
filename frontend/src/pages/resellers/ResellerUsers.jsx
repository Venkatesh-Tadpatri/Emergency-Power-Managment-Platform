import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../auth/LocalAuth";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { UserDirectory } from "../../components/users/UserDirectory";
import { useCompanies } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { useUsersByReseller } from "../../queries/users";

/** Reseller Users: the shared user directory, locked to one reseller and its customers. */
export function ResellerUsers() {
  const { resellerId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: reseller } = useReseller(resellerId);
  const { data: companies } = useCompanies(resellerId);
  const usersQuery = useUsersByReseller(resellerId);
  const [search, setSearch] = useState("");

  usePageHeader("Reseller Users", [
    { label: "Resellers", onClick: () => navigate("/resellers") },
    { label: reseller?.name || "", onClick: () => navigate(`/resellers/${resellerId}`) },
  ]);

  if (!resellerId) return null;
  const canManage = me?.role === "superadmin" || (me?.role === "reseller_admin" && me.reseller_id === resellerId);

  return <UserDirectory
    users={usersQuery.data || []}
    loading={usersQuery.isPending}
    resellerId={resellerId}
    companies={(companies || []).filter((company) => company.reseller_id === resellerId)}
    resellers={reseller ? [reseller] : []}
    canManage={canManage}
    meId={me?.id}
    search={search}
    onSearchChange={setSearch}
  />;
}
