import { isOperationalEvent } from "./alarmClassification";

export function getCustomerCardStats(companyId, { sites = [], systems = [], alarms = [], panels = [], generators = [] }) {
  const companySites = sites.filter((site) => site.status !== "archived" && site.customer_id === companyId);
  const companySystems = systems.filter((system) => system.company_id === companyId);
  const systemIds = new Set(companySystems.map((system) => system.id));
  const panelIds = new Set(panels.filter((panel) => systemIds.has(panel.system_id)).map((panel) => panel.id));
  const offlineDevices = companySystems.filter((system) => system.status === "offline").length;
  const activeAlarms = alarms.filter((alarm) => alarm.status === "active" && !isOperationalEvent(alarm) && systemIds.has(alarm.system_id)).length;
  const generatorCount = generators.filter((generator) => panelIds.has(generator.panel_id)).length;

  return [
    { label: "Sites", value: companySites.length, color: "var(--cyan)" },
    { label: "Systems", value: companySystems.length, color: "var(--purple)" },
    { label: "Offline devices", value: offlineDevices, color: offlineDevices ? "var(--red)" : "var(--green)" },
    { label: "Active alarms", value: activeAlarms, color: activeAlarms ? "var(--red)" : "var(--green)" },
    { label: "Generators", value: generatorCount, color: "var(--amber)" },
  ];
}

const STATUS_PRIORITY = { normal: 0, online: 0, test: 1, offline: 2, alarm: 3, emergency: 4 };

export function getWorstStatus(systemRows = [], alarmRows = []) {
  let worst = systemRows.length ? "normal" : "offline";
  for (const system of systemRows) {
    const status = STATUS_PRIORITY[system.status] == null ? "normal" : system.status;
    if (STATUS_PRIORITY[status] > STATUS_PRIORITY[worst]) worst = status;
  }
  for (const alarm of alarmRows) {
    if (alarm.status !== "active" || isOperationalEvent(alarm)) continue;
    const status = alarm.severity === "critical" ? "emergency" : "alarm";
    if (STATUS_PRIORITY[status] > STATUS_PRIORITY[worst]) worst = status;
  }
  return worst;
}

function shortLocation(address) {
  if (!address) return null;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || null;
}

export function getCustomerLocationSummary(company, allSites = []) {
  const sites = allSites.filter((site) => site.status !== "archived" && site.customer_id === company.id);
  if (!sites.length) return company.address ? `HQ · ${company.address}` : "No sites configured";
  const locations = [...new Set(sites.map((site) => shortLocation(site.address)).filter(Boolean))];
  const locationText = locations.length
    ? `${locations.slice(0, 2).join(", ")}${locations.length > 2 ? ` +${locations.length - 2}` : ""}`
    : (company.address ? `HQ ${company.address}` : "Locations not set");
  return `${sites.length} ${sites.length === 1 ? "site" : "sites"} · ${locationText}`;
}

export function getCustomerWorstStatus(companyId, data) {
  const systems = (data.systems || []).filter((system) => system.company_id === companyId);
  const systemIds = new Set(systems.map((system) => system.id));
  const alarms = (data.alarms || []).filter((alarm) => !isOperationalEvent(alarm) && systemIds.has(alarm.system_id));
  return getWorstStatus(systems, alarms);
}

export function getSiteWorstStatus(siteId, data) {
  return getSiteMapState(siteId, data).status;
}

export function getSiteMapState(siteId, data) {
  const systems = (data.systems || []).filter((system) => system.site_id === siteId);
  const systemIds = new Set(systems.map((system) => system.id));
  const alarms = (data.alarms || []).filter(
    (alarm) => alarm.status === "active" && !isOperationalEvent(alarm) && systemIds.has(alarm.system_id),
  );
  const states = [];
  if (systems.some((system) => system.status === "emergency")) states.push("Emergency active");
  if (systems.some((system) => system.status === "alarm")) states.push("System alarm");
  if (systems.some((system) => system.status === "offline")) states.push("Offline / communication loss");
  if (systems.some((system) => system.status === "test")) states.push("Test in progress");
  if (alarms.length) states.push(`${alarms.length} active ${alarms.length === 1 ? "alarm" : "alarms"}`);
  if (!states.length) states.push(systems.length ? "Normal" : "No systems configured");
  return {
    status: getWorstStatus(systems, alarms),
    activeStates: states,
    unacknowledged: alarms.some((alarm) => !alarm.ack_at),
  };
}
