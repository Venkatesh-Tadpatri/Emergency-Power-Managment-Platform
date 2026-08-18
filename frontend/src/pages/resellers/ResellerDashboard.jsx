import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useNavigate, useParams } from "react-router-dom";
import { InfoCard, StatsGrid } from "../../components/common/StatCard";
import { StatusPill } from "../../components/common/StatusPill";
import { IconAlert, IconBuilding, IconCheckCircle, IconPanel, IconResellers } from "../../components/common/Icons";
import { PageHero } from "../../components/common/PageHero";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAlarms } from "../../queries/alarms";
import { useCompanies } from "../../queries/companies";
import { useReseller } from "../../queries/resellers";
import { useAllGenerators, useAllPanels, useSites, useSystems } from "../../queries/systems";
export function ResellerDashboard() {
    const { resellerId } = useParams();
    const navigate = useNavigate();
    const { data: reseller } = useReseller(resellerId);
    const { data: companies } = useCompanies(resellerId);
    const { data: systems } = useSystems();
    const { data: sites } = useSites();
    const { data: panels } = useAllPanels();
    const { data: generators } = useAllGenerators();
    const { data: alarms } = useAlarms({ resellerId });
    usePageHeader(reseller?.name || "Reseller", [
        { label: "Resellers", onClick: () => navigate("/resellers") },
    ]);
    const companySystems = (systems || []).filter((s) => (companies || []).some((c) => c.id === s.company_id));
    const normal = companySystems.filter((s) => s.status === "normal").length;
    const companySites = (sites || []).filter((site) => site.status !== "archived" && (companies || []).some((company) => company.id === site.customer_id));
    const activeAlarms = (alarms || []).filter((a) => a.status === "active");
    const companySystemIds = new Set(companySystems.map((system) => system.id));
    const companyPanelIds = new Set((panels || []).filter((panel) => companySystemIds.has(panel.system_id)).map((panel) => panel.id));
    const companyGenerators = (generators || []).filter((generator) => companyPanelIds.has(generator.panel_id));
    const systemById = new Map(companySystems.map((system) => [system.id, system]));
    const companyById = new Map((companies || []).map((company) => [company.id, company]));
    const formatAlarmDate = (value) => new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    const formatAlarmTime = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return (_jsxs(_Fragment, { children: [_jsx(PageHero, { title: reseller?.name || "Reseller", subtitle: `${companies?.length ?? 0} customers · ${companySystems.length} systems`, icon: IconResellers, color: activeAlarms.length > 0 ? "#dc2626" : "#7c3aed", bgImage: "/images/hero-bg.jpg" }), _jsx(StatsGrid, { stats: [
                    { label: "Customers", value: companies?.length ?? 0, color: "var(--blue)", icon: IconBuilding },
                    { label: "Total Sites", value: companySites.length, color: "var(--cyan)", icon: IconPanel },
                    { label: "Total Systems", value: companySystems.length, color: "var(--purple)", icon: IconPanel },
                    { label: "Generators", value: companyGenerators.length, color: "var(--amber)", icon: IconPanel },
                    { label: "Normal", value: normal, color: "var(--green)", icon: IconCheckCircle },
                    { label: "Active Alarms", value: activeAlarms.length, color: activeAlarms.length ? "var(--red)" : "var(--green)", icon: IconAlert },
                ] }), _jsx("div", { className: "section-header", children: _jsxs("div", { children: [_jsx("div", { className: "section-title", children: "Customers" }), _jsxs("div", { className: "section-sub", children: [companies?.length ?? 0, " customers under ", reseller?.name] })] }) }), _jsx("div", { className: "card-grid reseller-customer-grid", children: (companies || []).map((c) => {
                    const cSystems = companySystems.filter((s) => s.company_id === c.id);
                    const cSites = companySites.filter((site) => site.customer_id === c.id);
                    const cNormal = cSystems.filter((system) => system.status === "normal").length;
                    const cActiveAlarms = activeAlarms.filter((alarm) => cSystems.some((system) => system.id === alarm.system_id)).length;
                    const cSystemIds = new Set(cSystems.map((system) => system.id));
                    const cPanelIds = new Set((panels || []).filter((panel) => cSystemIds.has(panel.system_id)).map((panel) => panel.id));
                    const cGenerators = (generators || []).filter((generator) => cPanelIds.has(generator.panel_id)).length;
                    return (_jsx(InfoCard, { title: c.name, status: c.status, subtitle: c.address, icon: IconBuilding, stats: [
                            { label: "Sites", value: cSites.length, color: "var(--cyan)" },
                            { label: "Systems", value: cSystems.length, color: "var(--purple)" },
                            { label: "Normal", value: cNormal, color: "var(--green)" },
                            { label: "Active alarms", value: cActiveAlarms, color: cActiveAlarms ? "var(--red)" : "var(--green)" },
                            { label: "Generators", value: cGenerators, color: "var(--amber)" },
                        ], onClick: () => navigate(`/companies/${c.id}`) }, c.id));
                }) }), _jsxs(_Fragment, { children: [_jsx("div", { className: "section-header", style: { marginTop: 18 }, children: _jsxs("div", { children: [_jsx("div", { className: "section-title", children: "Active Alarms" }), _jsxs("div", { className: "section-sub", children: [activeAlarms.length, " active alarms across portfolio"] })] }) }), activeAlarms.length ? _jsx("div", { className: "reseller-active-alarms", children: _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Date" }), _jsx("th", { children: "Time" }), _jsx("th", { children: "Customer" }), _jsx("th", { children: "System" }), _jsx("th", { children: "Alarm" }), _jsx("th", { children: "Severity" }), _jsx("th", { children: "Acknowledged" })] }) }), _jsx("tbody", { children: activeAlarms.map((a) => { const system = systemById.get(a.system_id); const company = system ? companyById.get(system.company_id) : undefined; return _jsxs("tr", { children: [_jsx("td", { className: "mono", children: formatAlarmDate(a.occurred_at) }), _jsx("td", { className: "mono", children: formatAlarmTime(a.occurred_at) }), _jsx("td", { children: company?.name || "â€”" }), _jsx("td", { children: system?.name || "â€”" }), _jsx("td", { children: a.message }), _jsx("td", { children: _jsx(StatusPill, { status: a.severity }) }), _jsx("td", { children: a.ack_by ? (_jsx("span", { className: "ack-badge acked", children: "Acked" })) : (_jsx("span", { className: "ack-badge unacked", children: "Unacked" })) })] }, a.id); }) })] }) }) : _jsx("div", { className: "reseller-alarms-empty", children: "No active alarms in this reseller portfolio." })] })] }));
}
