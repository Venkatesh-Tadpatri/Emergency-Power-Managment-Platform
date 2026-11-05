import { useNavigate, useParams } from "react-router-dom";

import { AlarmWorkspace } from "../alarms/AlarmWorkspace";
import { useReseller } from "../../queries/resellers";

export function ResellerAlarms() {
  const { resellerId } = useParams();
  const navigate = useNavigate();
  const { data: reseller } = useReseller(resellerId);
  return <AlarmWorkspace title="Reseller Alarms" resellerId={resellerId} crumbs={[{ label: "Resellers", onClick: () => navigate("/resellers") }, { label: reseller?.name || "", onClick: () => navigate(`/resellers/${resellerId}`) }]} />;
}
