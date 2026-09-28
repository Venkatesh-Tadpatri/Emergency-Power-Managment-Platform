import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { SystemOperationsOverview } from "../../components/systems/SystemOperationsOverview";
import { DeviceManager } from "../../components/systems/DeviceManager";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useAts, useGenerators, usePanels, useSystem } from "../../queries/systems";

export function SystemDetail() {
  const auth = useAuth();
  const { systemId } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: system } = useSystem(systemId);
  const { data: company } = useCompany(system?.company_id);
  const { data: panels } = usePanels(systemId);
  const panelId = panels?.[0]?.id;
  const { data: ats } = useAts(panelId);
  const { data: generators } = useGenerators(panelId);
  const [view, setView] = useState("details");
  const canEditOneLine = me?.role === "superadmin";

  useEffect(() => {
    if (!canEditOneLine && view === "wizard") setView("details");
  }, [canEditOneLine, view]);

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
        canEditOneLine={canEditOneLine}
      />
      {view === "details" && <DeviceManager systemId={system.id} />}
    </>
  );
}
