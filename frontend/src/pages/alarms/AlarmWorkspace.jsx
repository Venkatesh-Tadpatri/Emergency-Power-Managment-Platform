import { useMemo, useState } from "react";

import { StatusPill } from "../../components/common/StatusPill";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAcknowledgeAlarm, useAlarms } from "../../queries/alarms";
import { useCompanies } from "../../queries/companies";
import { useResellers } from "../../queries/resellers";
import { useSites, useSystems } from "../../queries/systems";
import { alarmOnly, eventOnly, notificationOnly } from "../../utils/alarmClassification";

const formatDateTime = (value) => value ? new Date(value).toLocaleString() : "—";

export function AlarmWorkspace({ title = "Alarms", crumbs = [], resellerId, companyId, siteId }) {
  const [view, setView] = useState("active");
  const [severity, setSeverity] = useState("");
  const [systemFilter, setSystemFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [ackComments, setAckComments] = useState({});
  const acknowledge = useAcknowledgeAlarm();
  const { data: alarms, isPending } = useAlarms({ resellerId, companyId }, { enabled: true });
  const { data: systems } = useSystems(companyId);
  const { data: sites } = useSites(companyId);
  const { data: companies } = useCompanies(resellerId);
  const { data: resellers } = useResellers();

  usePageHeader(title, crumbs);

  const scopedSystems = useMemo(() => (systems || []).filter((system) => !siteId || system.site_id === siteId), [systems, siteId]);
  const filterSystems = useMemo(
    () => scopedSystems.filter((system) => !customerFilter || system.company_id === customerFilter),
    [scopedSystems, customerFilter],
  );
  const filterSites = useMemo(
    () => (sites || []).filter((site) => site.status !== "archived" && (!customerFilter || site.customer_id === customerFilter)),
    [sites, customerFilter],
  );
  const scopedSystemIds = useMemo(() => new Set(scopedSystems.map((system) => system.id)), [scopedSystems]);
  const scopedAlarms = useMemo(() => (alarms || []).filter((alarm) => !siteId || scopedSystemIds.has(alarm.system_id)), [alarms, siteId, scopedSystemIds]);
  const alarmRecords = alarmOnly(scopedAlarms);
  const eventRecords = eventOnly(scopedAlarms);
  const notificationRecords = notificationOnly(scopedAlarms);
  const activeAlarms = alarmRecords.filter((alarm) => alarm.status === "active");
  const historyAlarms = alarmRecords.filter((alarm) => alarm.status === "cleared");
  const systemsById = new Map((systems || []).map((system) => [system.id, system]));
  const sitesById = new Map((sites || []).map((site) => [site.id, site]));
  const companiesById = new Map((companies || []).map((company) => [company.id, company]));
  const resellersById = new Map((resellers || []).map((reseller) => [reseller.id, reseller]));

  const rows = (view === "active" ? activeAlarms : view === "history" ? historyAlarms : view === "events" ? eventRecords : notificationRecords).filter((alarm) => {
    const system = systemsById.get(alarm.system_id);
    const company = companiesById.get(system?.company_id);
    const haystack = `${alarm.message} ${alarm.device_label || ""} ${system?.name || ""} ${company?.name || ""}`.toLowerCase();
    return (!severity || alarm.severity === severity)
      && (!systemFilter || alarm.system_id === systemFilter)
      && (!customerFilter || system?.company_id === customerFilter)
      && (!siteFilter || system?.site_id === siteFilter)
      && (!statusFilter || alarm.status === statusFilter)
      && (!dateFrom || new Date(alarm.occurred_at) >= new Date(`${dateFrom}T00:00:00`))
      && (!dateTo || new Date(alarm.occurred_at) <= new Date(`${dateTo}T23:59:59.999`))
      && (!search.trim() || haystack.includes(search.trim().toLowerCase()));
  });

  return <div className="alarm-workspace">
    <div className="alarm-view-tabs" role="tablist" aria-label="Alarm views">
      <button className={view === "active" ? "active" : ""} onClick={() => setView("active")}>
        Active Alarms <span>{activeAlarms.length}</span>
      </button>
      <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
        Alarm History <span>{historyAlarms.length}</span>
      </button>
      <button className={view === "events" ? "active" : ""} onClick={() => setView("events")}>
        Events <span>{eventRecords.length}</span>
      </button>
      <button className={view === "notifications" ? "active" : ""} onClick={() => setView("notifications")}>
        Notifications <span>{notificationRecords.length}</span>
      </button>
    </div>

    <div className="alarm-history-filters">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search alarms and events…" aria-label="Search alarm records" />
      {!companyId && <select value={customerFilter} onChange={(event) => { setCustomerFilter(event.target.value); setSiteFilter(""); setSystemFilter(""); }} aria-label="Filter by customer">
        <option value="">All customers</option>
        {(companies || []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>}
      {!siteId && <select value={siteFilter} onChange={(event) => { setSiteFilter(event.target.value); setSystemFilter(""); }} aria-label="Filter by site">
        <option value="">All sites</option>
        {filterSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
      </select>}
      <select value={systemFilter} onChange={(event) => setSystemFilter(event.target.value)} aria-label="Filter by system">
        <option value="">All systems</option>
        {filterSystems.filter((system) => !siteFilter || system.site_id === siteFilter).map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
      </select>
      <select value={severity} onChange={(event) => setSeverity(event.target.value)} aria-label="Filter by severity">
        <option value="">All severities</option>
        <option value="critical">Critical</option>
        <option value="warning">Warning</option>
        <option value="info">Info</option>
      </select>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
        <option value="">All statuses</option><option value="active">Active</option><option value="cleared">Cleared</option>
      </select>
      <label className="alarm-date-filter">From <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
      <label className="alarm-date-filter">To <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
      {(search || customerFilter || siteFilter || systemFilter || severity || statusFilter || dateFrom || dateTo) && <button className="header-btn" onClick={() => { setSearch(""); setCustomerFilter(""); setSiteFilter(""); setSystemFilter(""); setSeverity(""); setStatusFilter(""); setDateFrom(""); setDateTo(""); }}>Clear filters</button>}
    </div>

    <div className="card alarm-table-card">
      <table className="data-table">
        <thead><tr>
          <th>Raised</th>
          {!resellerId && !companyId && <th>Reseller</th>}
          {!companyId && <th>Customer</th>}
          <th>Site</th><th>System</th><th>Device</th><th>{view === "events" ? "Event" : view === "notifications" ? "Notification" : "Alarm"}</th><th>Severity</th>
          {view === "history" ? <><th>Cleared</th><th>Acknowledgment Details</th></> : view === "events" || view === "notifications" ? <th>Status</th> : <th>Acknowledge</th>}
        </tr></thead>
        <tbody>
          {isPending && <tr><td colSpan={9} className="table-loading-row">Loading alarms…</td></tr>}
          {!isPending && !rows.length && <tr><td colSpan={11} className="alarm-empty-state">{view === "active" ? "No active alarms in this scope." : view === "history" ? "No cleared alarms match these filters." : view === "events" ? "No operational events match these filters." : "No informational notifications match these filters."}</td></tr>}
          {rows.map((alarm) => {
            const system = systemsById.get(alarm.system_id);
            const company = companiesById.get(system?.company_id);
            const reseller = resellersById.get(company?.reseller_id);
            const site = sitesById.get(system?.site_id);
            const clearedAt = alarm.cleared_at || alarm.ack_at;
            return <tr key={alarm.id}>
              <td className="mono">{formatDateTime(alarm.occurred_at)}</td>
              {!resellerId && !companyId && <td>{reseller?.name || "—"}</td>}
              {!companyId && <td>{company?.name || "—"}</td>}
              <td>{site?.name || system?.site_name || "—"}</td>
              <td style={{ fontWeight: 600 }}>{system?.name || alarm.system_id}</td>
              <td>{alarm.device_label || "—"}</td>
              <td>{alarm.message}</td>
              <td><StatusPill status={alarm.severity} /></td>
              {view === "history" ? <>
                <td className="mono">{formatDateTime(clearedAt)}</td>
                <td>{alarm.ack_by ? <div className="ack-detail"><span className="ack-badge acked">Acknowledged</span><span className="ack-meta">{alarm.ack_by}{alarm.ack_at ? ` · ${formatDateTime(alarm.ack_at)}` : ""}</span>{alarm.ack_comment && <span className="ack-comment">“{alarm.ack_comment}”</span>}</div> : <span className="ack-badge unacked">Not acknowledged</span>}</td>
              </> : view === "events" || view === "notifications" ? <td><span className={`event-status ${alarm.status}`}>{alarm.status}</span></td> : <td>{alarm.ack_by ? <div className="ack-detail"><span className="ack-badge acked">Acknowledged</span><span className="ack-meta">{alarm.ack_by}{alarm.ack_at ? ` · ${formatDateTime(alarm.ack_at)}` : ""}</span>{alarm.ack_comment && <span className="ack-comment">“{alarm.ack_comment}”</span>}</div> : <div className="alarm-ack-action"><input value={ackComments[alarm.id] || ""} onChange={(event) => setAckComments((current) => ({ ...current, [alarm.id]: event.target.value }))} placeholder="Optional comment" maxLength={1000} /><button className="header-btn primary" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate({ id: alarm.id, comment: ackComments[alarm.id] })}>Acknowledge</button></div>}</td>}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </div>;
}
