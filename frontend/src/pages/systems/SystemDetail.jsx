import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SystemOperationsOverview } from "../../components/systems/SystemOperationsOverview";
import { DeviceManager } from "../../components/systems/DeviceManager";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useAts, useGenerators, usePanels, useSystem } from "../../queries/systems";

export function SystemDetail() {
  const { systemId } = useParams();
  const navigate = useNavigate();
  const { data: system } = useSystem(systemId);
  const { data: company } = useCompany(system?.company_id);
  const { data: panels } = usePanels(systemId);
  const panelId = panels?.[0]?.id;
  const { data: ats } = useAts(panelId);
  const { data: generators } = useGenerators(panelId);
  const [view, setView] = useState("details");

  usePageHeader(system?.name || "System", [
    { label: company?.name || "", onClick: () => navigate(`/companies/${system?.company_id}`) },
  ]);

  if (!system) return null;

  return (
    <>
      <SystemOperationsOverview
        systemId={system.id}
        systemName={system.name}
        ats={ats || []}
        generators={generators || []}
        view={view}
        onViewChange={setView}
      />
      {view === "details" && <DeviceManager systemId={system.id} />}
    </>
  );
}
