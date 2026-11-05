import { useNavigate, useParams } from "react-router-dom";
import { LeafletMap } from "../../components/map/LeafletMap";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAlarms } from "../../queries/alarms";
import { useCompany } from "../../queries/companies";
import { useReseller } from "../../queries/resellers";
import { useSites, useSystems } from "../../queries/systems";
import { getSiteMapState } from "../../utils/customerCardStats";

export function CompanyMap() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { data: company } = useCompany(companyId);
  const { data: reseller } = useReseller(company?.reseller_id);
  const { data: sites } = useSites(companyId);
  const { data: systems } = useSystems(companyId);
  const { data: alarms } = useAlarms({ companyId });
  const activeSites = (sites || []).filter((site) => site.status !== "archived");

  usePageHeader("Map View", [
    { label: "Active Resellers", onClick: () => navigate("/resellers") },
    { label: reseller?.name || "", onClick: () => navigate(`/resellers/${company?.reseller_id}`) },
    { label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) },
  ]);

  const mappedSites = activeSites.filter((site) => site.lat != null && site.lng != null);

  return <div style={{ position: "relative", height: "calc(100vh - 100px)" }}>
    <LeafletMap markers={mappedSites.map((site) => {
      const mapState = getSiteMapState(site.id, { systems, alarms });
      return { id: site.id, lat: site.lat, lng: site.lng, status: mapState.status, label: site.name, customerName: company?.name, sublabel: site.address || undefined, activeStates: mapState.activeStates, unacknowledged: mapState.unacknowledged };
    })} onMarkerClick={(siteId) => navigate(`/companies/${companyId}/sites/${siteId}`)} singleMarkerZoom={12} />
    <div className="map-legend"><div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6, color: "#0f172a" }}>Site Status</div><div className="map-legend-item"><div className="map-legend-dot" style={{ background: "#22c55e" }} />Normal</div><div className="map-legend-item"><div className="map-legend-dot" style={{ background: "#ef4444" }} />Emergency</div><div className="map-legend-item"><div className="map-legend-dot" style={{ background: "#f59e0b" }} />Alarm</div><div className="map-legend-item"><div className="map-legend-dot" style={{ background: "#64748b" }} />Offline</div><div className="map-legend-item"><div className="map-legend-dot" style={{ background: "#a855f7" }} />Test</div></div>
    <div className="map-stats"><div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6, color: "#0f172a" }}>{company?.name}</div><div className="map-stat-row"><span style={{ color: "#5c7188" }}>Sites</span><span style={{ fontWeight: 600, color: "#0f172a" }}>{activeSites.length}</span></div><div className="map-stat-row"><span style={{ color: "#5c7188" }}>Mapped</span><span style={{ fontWeight: 600, color: "#0f172a" }}>{mappedSites.length}</span></div></div>
  </div>;
}
