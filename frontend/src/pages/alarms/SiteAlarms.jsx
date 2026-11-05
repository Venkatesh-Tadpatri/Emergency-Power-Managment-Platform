import { useNavigate, useParams } from "react-router-dom";

import { useCompany } from "../../queries/companies";
import { useSite } from "../../queries/systems";
import { AlarmWorkspace } from "./AlarmWorkspace";

export function SiteAlarms() {
  const { companyId, siteId } = useParams();
  const navigate = useNavigate();
  const { data: company } = useCompany(companyId);
  const { data: site } = useSite(siteId);
  return <AlarmWorkspace
    title="Site Alarms"
    companyId={companyId}
    siteId={siteId}
    crumbs={[
      { label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) },
      { label: site?.name || "", onClick: () => navigate(`/companies/${companyId}/sites/${siteId}`) },
    ]}
  />;
}
