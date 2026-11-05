import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { LeafletMap } from "../../components/map/LeafletMap";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAlarms } from "../../queries/alarms";
import { useCompanies } from "../../queries/companies";
import { useReseller } from "../../queries/resellers";
import { useSites, useSystems } from "../../queries/systems";
import { getSiteMapState } from "../../utils/customerCardStats";

export function ResellerMap() {
  const { resellerId } = useParams();
  const navigate = useNavigate();
  const { data: reseller } = useReseller(resellerId);
  const { data: companies } = useCompanies(resellerId);
  const { data: sites } = useSites();
  const { data: systems } = useSystems();
  const { data: alarms } = useAlarms({ resellerId });
  const [customerFilter, setCustomerFilter] = useState("");

  usePageHeader("Map View", [
    { label: "Resellers", onClick: () => navigate("/resellers") },
    { label: reseller?.name || "", onClick: () => navigate(`/resellers/${resellerId}`) },
  ]);

  const companyIds = new Set((companies || []).map((company) => company.id));
  const companiesById = new Map((companies || []).map((company) => [company.id, company]));
  const activeSites = (sites || []).filter(
    (site) => site.status !== "archived" && companyIds.has(site.customer_id) && (!customerFilter || site.customer_id === customerFilter),
  );
  const mappedSites = activeSites.filter((site) => site.lat != null && site.lng != null);
  const visibleCompanyIds = new Set(customerFilter ? [customerFilter] : companyIds);
  const resellerSystems = (systems || []).filter((system) => visibleCompanyIds.has(system.company_id));
  const normal = resellerSystems.filter((system) => system.status === "normal").length;

  return <div style={{ position: "relative", height: "calc(100vh - 100px)" }}>
    <LeafletMap
      markers={mappedSites.map((site) => {
        const company = companiesById.get(site.customer_id);
        const mapState = getSiteMapState(site.id, { systems, alarms });
        return {
          id: site.id,
          lat: site.lat,
          lng: site.lng,
          status: mapState.status,
          label: site.name,
          customerName: company?.name,
          sublabel: site.address || undefined,
          activeStates: mapState.activeStates,
          unacknowledged: mapState.unacknowledged,
        };
      })}
      onMarkerClick={(siteId) => {
        const site = mappedSites.find((item) => item.id === siteId);
        if (site) navigate(`/companies/${site.customer_id}/sites/${site.id}`);
      }}
    />

    <div className="map-customer-filter">
      <label htmlFor="reseller-map-customer">Customer</label>
      <select id="reseller-map-customer" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
        <option value="">All customers</option>
        {(companies || []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
    </div>

    <div className="map-legend">
      <div>Site Status</div>
      <div className="map-legend-item"><div className="map-legend-dot" style={{ background: "#22c55e" }} />Normal</div>
      <div className="map-legend-item"><div className="map-legend-dot" style={{ background: "#ef4444" }} />Emergency</div>
      <div className="map-legend-item"><div className="map-legend-dot" style={{ background: "#f59e0b" }} />Alarm</div>
      <div className="map-legend-item"><div className="map-legend-dot" style={{ background: "#64748b" }} />Offline</div>
      <div className="map-legend-item"><div className="map-legend-dot" style={{ background: "#a855f7" }} />Test</div>
    </div>

    <div className="map-stats">
      <div className="map-stats-title">{reseller?.name}</div>
      <div className="map-stat-row"><span>Customers</span><strong>{customerFilter ? 1 : companies?.length ?? 0}</strong></div>
      <div className="map-stat-row"><span>Sites</span><strong>{activeSites.length}</strong></div>
      <div className="map-stat-row"><span>Mapped</span><strong>{mappedSites.length}</strong></div>
      <div className="map-stat-row"><span>Systems</span><strong>{resellerSystems.length}</strong></div>
      <div className="map-stat-row normal"><span>Normal</span><strong>{normal}</strong></div>
      <div className="map-stat-row events"><span>Events</span><strong>{resellerSystems.length - normal}</strong></div>
    </div>
  </div>;
}
