import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { InfoCard } from "../../components/common/StatCard";
import { IconBuilding } from "../../components/common/Icons";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies } from "../../queries/companies";
import { useAlarms } from "../../queries/alarms";
import { useResellers } from "../../queries/resellers";
import { useAllGenerators, useAllPanels, useSites, useSystems } from "../../queries/systems";
import { getCustomerCardStats, getCustomerLocationSummary, getCustomerWorstStatus } from "../../utils/customerCardStats";

export function CompaniesList() {
  const navigate = useNavigate();
  const { data: companies } = useCompanies();
  const { data: resellers } = useResellers();
  const { data: systems } = useSystems();
  const { data: sites } = useSites();
  const { data: alarms } = useAlarms({});
  const { data: panels } = useAllPanels();
  const { data: generators } = useAllGenerators();
  const [nameFilter, setNameFilter] = useState("");
  const [resellerFilter, setResellerFilter] = useState("all");
  usePageHeader("Active Customers");
  const activeCompanies = (companies || []).filter((company) => company.status !== "archived");
  const filteredCompanies = activeCompanies.filter((company) => company.name.toLowerCase().includes(nameFilter.trim().toLowerCase()) && (resellerFilter === "all" || company.reseller_id === resellerFilter));
  return <div className="companies-directory">
    <div className="directory-filters">
      <input value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} placeholder="Filter by customer name..." />
      <select value={resellerFilter} onChange={(event) => setResellerFilter(event.target.value)}><option value="all">All resellers</option>{(resellers || []).filter((reseller) => reseller.status !== "archived").map((reseller) => <option key={reseller.id} value={reseller.id}>{reseller.name}</option>)}</select>
      {(nameFilter || resellerFilter !== "all") && <button className="header-btn" onClick={() => { setNameFilter(""); setResellerFilter("all"); }}>Clear filters</button>}
    </div>
    <div className="directory-filter-count">{filteredCompanies.length} of {activeCompanies.length} active customers</div>
    <div className="card-grid">{filteredCompanies.map((company) => {
      const stats = getCustomerCardStats(company.id, { sites, systems, alarms, panels, generators });
      return <InfoCard key={company.id} title={company.name} subtitle={getCustomerLocationSummary(company, sites || [])} status={getCustomerWorstStatus(company.id, { systems, alarms })} icon={IconBuilding} stats={stats} onClick={() => navigate(`/companies/${company.id}`)} />;
    })}</div>
  </div>;
}
