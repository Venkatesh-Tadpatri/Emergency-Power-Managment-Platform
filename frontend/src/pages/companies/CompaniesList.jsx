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
import { activeAlarmOnly } from "../../utils/alarmClassification";

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
  const [statusFilter, setStatusFilter] = useState("all");
  usePageHeader("Active Customers");
  // A customer cannot be active in the global hierarchy while its parent reseller is archived.
  // Keep the customer's own status untouched so it becomes visible again if the reseller is restored.
  const activeResellerIds = new Set((resellers || []).filter((reseller) => reseller.status !== "archived").map((reseller) => reseller.id));
  const activeCompanies = (companies || []).filter((company) => company.status !== "archived" && activeResellerIds.has(company.reseller_id));
  const activeCompanyIds = new Set(activeCompanies.map((company) => company.id));
  const activeSites = (sites || []).filter((site) => site.status !== "archived" && activeCompanyIds.has(site.customer_id));
  const activeSiteIds = new Set(activeSites.map((site) => site.id));
  const activeSystems = (systems || []).filter((system) => activeCompanyIds.has(system.company_id) && activeSiteIds.has(system.site_id));
  const totals = [
    ["Total Customers", activeCompanies.length, "blue"],
    ["Total Resellers", activeResellerIds.size, "purple"],
    ["Total Sites", activeSites.length, "amber"],
    ["Total Systems", activeSystems.length, "cyan"],
  ];
  const activeAlarms = activeAlarmOnly(alarms);
  const filteredCompanies = activeCompanies.filter((company) => {
    if (!company.name.toLowerCase().includes(nameFilter.trim().toLowerCase())) return false;
    if (resellerFilter !== "all" && company.reseller_id !== resellerFilter) return false;
    const customerSystems = (systems || []).filter((system) => system.company_id === company.id);
    if (statusFilter === "alarms") return activeAlarms.some((alarm) => customerSystems.some((system) => system.id === alarm.system_id));
    if (statusFilter === "offline") return customerSystems.some((system) => system.status === "offline");
    if (statusFilter === "test") return customerSystems.some((system) => system.status === "test");
    return true;
  });
  return <div className="companies-directory">
    <div className="reseller-total-strip customer-total-strip">{totals.map(([label, value, tone]) => <div className={`reseller-total-item ${tone}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="directory-filters">
      <input value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} placeholder="Filter by customer name..." />
      <select value={resellerFilter} onChange={(event) => setResellerFilter(event.target.value)}><option value="all">All resellers</option>{(resellers || []).filter((reseller) => reseller.status !== "archived").map((reseller) => <option key={reseller.id} value={reseller.id}>{reseller.name}</option>)}</select>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter customers by status"><option value="all">All Customers</option><option value="alarms">Has Alarms</option><option value="offline">Offline</option><option value="test">In Test</option></select>
      {(nameFilter || resellerFilter !== "all" || statusFilter !== "all") && <button className="header-btn" onClick={() => { setNameFilter(""); setResellerFilter("all"); setStatusFilter("all"); }}>Clear filters</button>}
    </div>
    <div className="card-grid">{filteredCompanies.map((company) => {
      const stats = getCustomerCardStats(company.id, { sites, systems, alarms, panels, generators });
      return <InfoCard key={company.id} title={company.name} subtitle={getCustomerLocationSummary(company, sites || [])} status={getCustomerWorstStatus(company.id, { systems, alarms })} icon={IconBuilding} stats={stats} onClick={() => navigate(`/companies/${company.id}`)} />;
    })}</div>
  </div>;
}
