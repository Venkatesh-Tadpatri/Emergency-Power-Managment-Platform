import { useAuth } from "react-oidc-context";

import { useMe } from "../../queries/me";
import { AlarmWorkspace } from "./AlarmWorkspace";

export function AlarmsList() {
  const auth = useAuth();
  const { data: me } = useMe(auth.isAuthenticated);
  const resellerId = me?.role === "reseller_admin" ? me.reseller_id || undefined : undefined;
  const companyId = me?.role && ["company_admin", "system_operator", "system_viewer"].includes(me.role)
    ? me.company_id || undefined
    : undefined;
  return <AlarmWorkspace title="All Alarms" resellerId={resellerId} companyId={companyId} />;
}
