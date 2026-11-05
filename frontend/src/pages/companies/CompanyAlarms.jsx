import { useNavigate, useParams } from "react-router-dom";

import { AlarmWorkspace } from "../alarms/AlarmWorkspace";
import { useCompany } from "../../queries/companies";

export function CompanyAlarms() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { data: company } = useCompany(companyId);
  return <AlarmWorkspace title="Customer Alarms" companyId={companyId} crumbs={[{ label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) }]} />;
}
