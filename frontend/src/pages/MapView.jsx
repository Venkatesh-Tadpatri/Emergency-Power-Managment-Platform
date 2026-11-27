import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { LeafletMap } from "../components/map/LeafletMap";
import { usePageHeader } from "../components/layout/HeaderContext";
import { useAlarms } from "../queries/alarms";
import { useCompanies } from "../queries/companies";
import { useResellers } from "../queries/resellers";
import { useSites, useSystems } from "../queries/systems";
import { getSiteMapState } from "../utils/customerCardStats";

export function MapView() {
  const navigate = useNavigate();
  const { data: resellers } = useResellers();
  const { data: companies } = useCompanies();
  const { data: sites } = useSites();
  const { data: systems } = useSystems();
  const { data: alarms } = useAlarms({}, { enabled: true });
  const [resellerFilter, setResellerFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [search, setSearch] = useState("");
  // A site picked from the search results: the map shows just that site (and zooms to it).
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const closeTimer = useRef(null);

  usePageHeader("Map View");

  const activeResellers = (resellers || []).filter((reseller) => reseller.status !== "archived");
  const resellersById = new Map((resellers || []).map((reseller) => [reseller.id, reseller]));
  const companiesById = new Map((companies || []).map((company) => [company.id, company]));
  // Reseller narrows the customer list; the customer narrows the sites; search narrows what's left.
  const scopedCompanies = (companies || []).filter((company) =>
    company.status !== "archived" && (!resellerFilter || company.reseller_id === resellerFilter));
  const scopedCompanyIds = new Set(customerFilter ? [customerFilter] : scopedCompanies.map((company) => company.id));
  const query = selectedSiteId ? "" : search.trim().toLowerCase();
  const matchesSearch = (site) => {
    if (!query) return true;
    const company = companiesById.get(site.customer_id);
    const reseller = company ? resellersById.get(company.reseller_id) : undefined;
    return [site.name, site.address, company?.name, reseller?.name].some((value) => value?.toLowerCase().includes(query));
  };
  const activeSites = (sites || []).filter((site) =>
    site.status !== "archived" && scopedCompanyIds.has(site.customer_id) && matchesSearch(site)
    && (!selectedSiteId || site.id === selectedSiteId));
  const mappedSites = activeSites.filter((site) => site.lat != null && site.lng != null);
  const visibleSiteIds = new Set(activeSites.map((site) => site.id));
  const visibleSystems = (systems || []).filter((system) => visibleSiteIds.has(system.site_id));
  const normal = visibleSystems.filter((system) => system.status === "normal").length;
  const customerCount = query
    ? new Set(activeSites.map((site) => site.customer_id)).size
    : scopedCompanyIds.size;
  const filtersActive = Boolean(resellerFilter || customerFilter || query || selectedSiteId);

  // Search results, limited to the current reseller/customer scope, grouped by kind.
  const typed = search.trim().toLowerCase();
  const results = typed && !selectedSiteId ? [
    ...(sites || []).filter((site) => site.status !== "archived" && scopedCompanyIds.has(site.customer_id)
      && [site.name, site.address].some((value) => value?.toLowerCase().includes(typed)))
      .slice(0, 6).map((site) => ({ kind: "Site", id: site.id, label: site.name, detail: [companiesById.get(site.customer_id)?.name, site.address].filter(Boolean).join(" · "), mapped: site.lat != null && site.lng != null })),
    ...scopedCompanies.filter((company) => company.name?.toLowerCase().includes(typed))
      .slice(0, 5).map((company) => ({ kind: "Customer", id: company.id, label: company.name, detail: resellersById.get(company.reseller_id)?.name || "", mapped: true })),
    ...(activeResellers.length > 1 ? activeResellers.filter((reseller) => reseller.name?.toLowerCase().includes(typed))
      .slice(0, 4).map((reseller) => ({ kind: "Reseller", id: reseller.id, label: reseller.name, detail: `${(companies || []).filter((company) => company.reseller_id === reseller.id && company.status !== "archived").length} customers`, mapped: true })) : []),
  ] : [];
  const selectResult = (result) => {
    setResultsOpen(false);
    if (result.kind === "Site") {
      const site = (sites || []).find((item) => item.id === result.id);
      const company = site ? companiesById.get(site.customer_id) : undefined;
      if (company) { setCustomerFilter(company.id); if (activeResellers.length > 1) setResellerFilter(company.reseller_id || ""); }
      setSelectedSiteId(result.id);
      setSearch(result.label);
    } else if (result.kind === "Customer") {
      const company = companiesById.get(result.id);
      if (activeResellers.length > 1) setResellerFilter(company?.reseller_id || "");
      setCustomerFilter(result.id);
      setSelectedSiteId("");
      setSearch("");
    } else {
      changeReseller(result.id);
      setSelectedSiteId("");
      setSearch("");
    }
  };
  const onSearchKeyDown = (event) => {
    if (!resultsOpen || !results.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveResult((index) => (index + 1) % results.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveResult((index) => (index - 1 + results.length) % results.length); }
    else if (event.key === "Enter") { event.preventDefault(); selectResult(results[Math.min(activeResult, results.length - 1)]); }
    else if (event.key === "Escape") setResultsOpen(false);
  };

  function changeReseller(value) {
    setResellerFilter(value);
    setSelectedSiteId("");
    // Keep the chosen customer only if it belongs to the newly selected reseller.
    if (customerFilter && value && companiesById.get(customerFilter)?.reseller_id !== value) setCustomerFilter("");
  }

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

    <div className="map-customer-filter map-fleet-filters">
      {activeResellers.length > 1 && <>
        <label htmlFor="fleet-map-reseller">Reseller</label>
        <select id="fleet-map-reseller" value={resellerFilter} onChange={(event) => changeReseller(event.target.value)}>
          <option value="">All resellers</option>
          {activeResellers.map((reseller) => <option key={reseller.id} value={reseller.id}>{reseller.name}</option>)}
        </select>
      </>}
      <label htmlFor="fleet-map-customer">Customer</label>
      <select id="fleet-map-customer" value={customerFilter} onChange={(event) => { setCustomerFilter(event.target.value); setSelectedSiteId(""); }}>
        <option value="">{resellerFilter ? "All customers of this reseller" : "All customers"}</option>
        {scopedCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
      <div className="map-search">
        <input
          type="search"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setSelectedSiteId(""); setResultsOpen(true); setActiveResult(0); }}
          onFocus={() => { window.clearTimeout(closeTimer.current); if (search.trim()) setResultsOpen(true); }}
          onBlur={() => { closeTimer.current = window.setTimeout(() => setResultsOpen(false), 150); }}
          onKeyDown={onSearchKeyDown}
          placeholder="Search sites, customers, resellers…"
          aria-label="Search the map by site, address, customer or reseller"
          role="combobox"
          aria-expanded={resultsOpen && Boolean(typed)}
          aria-controls="map-search-results"
          autoComplete="off"
        />
        {resultsOpen && typed && !selectedSiteId && <ul className="map-search-results" id="map-search-results" role="listbox">
          {!results.length && <li className="map-search-empty">No sites, customers or resellers match "{search.trim()}".</li>}
          {results.map((result, index) => <li
            key={`${result.kind}:${result.id}`}
            role="option"
            aria-selected={index === activeResult}
            className={index === activeResult ? "active" : ""}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveResult(index)}
            onClick={() => selectResult(result)}
          >
            <span className={`map-search-kind ${result.kind.toLowerCase()}`}>{result.kind}</span>
            <span className="map-search-text"><b>{result.label}</b>{result.detail && <small>{result.detail}</small>}</span>
            {!result.mapped && <span className="map-search-unmapped" title="This site has no latitude/longitude yet">Not on map</span>}
          </li>)}
        </ul>}
      </div>
      {filtersActive && <button type="button" className="map-filter-clear" onClick={() => { setResellerFilter(""); setCustomerFilter(""); setSearch(""); setSelectedSiteId(""); }}>Clear</button>}
      {filtersActive && !mappedSites.length && <span className="map-filter-empty">No mapped sites match these filters.</span>}
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
      <div className="map-stat-row"><span>Customers</span><strong>{customerCount}</strong></div>
      <div className="map-stat-row"><span>Sites</span><strong>{activeSites.length}</strong></div>
      <div className="map-stat-row"><span>Mapped</span><strong>{mappedSites.length}</strong></div>
      <div className="map-stat-row"><span>Systems</span><strong>{visibleSystems.length}</strong></div>
      <div className="map-stat-row normal"><span>Normal</span><strong>{normal}</strong></div>
      <div className="map-stat-row events"><span>Events</span><strong>{visibleSystems.length - normal}</strong></div>
    </div>
  </div>;
}
