import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { LeafletMap } from "../components/map/LeafletMap";
import { usePageHeader } from "../components/layout/HeaderContext";
import { useAlarms } from "../queries/alarms";
import { useCompanies } from "../queries/companies";
import { useSites, useSystems } from "../queries/systems";
import { getSiteMapState } from "../utils/customerCardStats";

export function MapView() {
  const navigate = useNavigate();
  const { data: companies } = useCompanies();
  const { data: sites } = useSites();
  const { data: systems } = useSystems();
  const { data: alarms } = useAlarms({}, { enabled: true });
  const [customerFilter, setCustomerFilter] = useState("");

  usePageHeader("Map View");

  const companiesById = new Map((companies || []).map((company) => [company.id, company]));
  const activeSites = (sites || []).filter((site) =>
    site.status !== "archived" && (!customerFilter || site.customer_id === customerFilter));
  const mappedSites = activeSites.filter((site) => site.lat != null && site.lng != null);
  const visibleCompanyIds = new Set(customerFilter ? [customerFilter] : (companies || []).map((company) => company.id));
  const visibleSystems = (systems || []).filter((system) => visibleCompanyIds.has(system.company_id));
  const normal = visibleSystems.filter((system) => system.status === "normal").length;

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
      <label htmlFor="fleet-map-customer">Customer</label>
      <select id="fleet-map-customer" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
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
      <div className="map-stats-title">Fleet Summary</div>
      <div className="map-stat-row"><span>Customers</span><strong>{customerFilter ? 1 : companies?.length ?? 0}</strong></div>
      <div className="map-stat-row"><span>Sites</span><strong>{activeSites.length}</strong></div>
      <div className="map-stat-row"><span>Mapped</span><strong>{mappedSites.length}</strong></div>
      <div className="map-stat-row"><span>Systems</span><strong>{visibleSystems.length}</strong></div>
      <div className="map-stat-row normal"><span>Normal</span><strong>{normal}</strong></div>
      <div className="map-stat-row events"><span>Events</span><strong>{visibleSystems.length - normal}</strong></div>
    </div>
  </div>;
}
