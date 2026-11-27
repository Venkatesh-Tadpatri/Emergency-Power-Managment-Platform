import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/LocalAuth";
import { SystemOperationsOverview } from "../../components/systems/SystemOperationsOverview";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { useSite, useSystem, useSystemAts, useSystemGenerators } from "../../queries/systems";

export function SystemDetail() {
  const auth = useAuth();
  const { systemId } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: system } = useSystem(systemId);
  const { data: company } = useCompany(system?.company_id);
  const { data: site } = useSite(system?.site_id);
  const { data: reseller } = useReseller(company?.reseller_id);
  // Equipment belongs to the system even when it has not yet been assigned to
  // a PLC panel.  Device Administration still needs to expose that assignment,
  // but the operational details must not hide otherwise valid system devices.
  const { data: systemAts } = useSystemAts(systemId);
  const { data: systemGenerators } = useSystemGenerators(systemId);
  const [view, setView] = useState("details");
  const canEditOneLine = ["superadmin", "reseller_admin"].includes(me?.role);

  useEffect(() => {
    if (!canEditOneLine && view === "wizard") setView("details");
  }, [canEditOneLine, view]);

  const canViewReseller = me?.role === "superadmin" || me?.role === "reseller_admin";
  usePageHeader(system?.name || "System", [
    ...(canViewReseller ? [
      { label: "Active Resellers", onClick: () => navigate("/resellers") },
      { label: reseller?.name || "", onClick: () => navigate(`/resellers/${company?.reseller_id}`) },
    ] : []),
    { label: company?.name || "", onClick: () => navigate(`/companies/${system?.company_id}`) },
    { label: site?.name || "", onClick: () => navigate(`/companies/${system?.company_id}/sites/${system?.site_id}`) },
  ]);

  if (!system) return null;

  return (
    <>
      {/* key: remount per system so one system's in-memory one-line/wizard state can never be shown
          under (or auto-saved into) the next system when navigating between systems. */}
      <SystemOperationsOverview
        key={system.id}
        systemId={system.id}
        systemName={system.name}
        customerLogo={company?.logo_data}
        customerName={company?.name}
        ats={systemAts || []}
        generators={systemGenerators || []}
        view={view}
        onViewChange={setView}
        canEditOneLine={canEditOneLine}
      />
    </>
  );
}
