import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment } from "react";
import { useAuth } from "react-oidc-context";
import { StatusPill } from "../../components/common/StatusPill";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAlarms } from "../../queries/alarms";
import { useCompanies } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useResellers } from "../../queries/resellers";
import { useSystems } from "../../queries/systems";
export function AlarmsList() {
    const auth = useAuth();
    const { data: me } = useMe(auth.isAuthenticated);
    const isSuperadmin = me?.role === "superadmin";
    const { data: alarms } = useAlarms({
        resellerId: me?.role === "reseller_admin" ? me.reseller_id ?? undefined : undefined,
        companyId: me?.role && ["company_admin", "system_operator", "system_viewer"].includes(me.role) ? me.company_id ?? undefined : undefined,
    }, { enabled: !!me?.role });
    const { data: resellers } = useResellers();
    const { data: companies } = useCompanies();
    const { data: systems } = useSystems();
    usePageHeader("All Alarms");
    const systemName = (id) => systems?.find((s) => s.id === id)?.name || id;
    const companyOf = (systemId) => {
        const sys = systems?.find((s) => s.id === systemId);
        return companies?.find((c) => c.id === sys?.company_id);
    };
    if (!isSuperadmin) {
        // Company/reseller-scoped roles: flat list is sufficient, no cross-reseller grouping needed.
        return (_jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Time" }), _jsx("th", { children: "System" }), _jsx("th", { children: "Alarm" }), _jsx("th", { children: "Severity" }), _jsx("th", { children: "Status" })] }) }), _jsx("tbody", { children: (alarms || []).map((a) => (_jsxs("tr", { children: [_jsx("td", { className: "mono", children: new Date(a.occurred_at).toLocaleString() }), _jsx("td", { style: { fontWeight: 600 }, children: systemName(a.system_id) }), _jsx("td", { children: a.message }), _jsx("td", { children: _jsx(StatusPill, { status: a.severity }) }), _jsx("td", { style: { color: a.status === "active" ? "var(--red)" : "var(--green)" }, children: a.status })] }, a.id))) })] }));
    }
    // Single shared table for the whole page, with full-width divider rows for
    // reseller / company grouping — keeps every column aligned down the page,
    // instead of each group rendering its own independently-sized <table>.
    return (_jsx("div", { className: "card", style: { marginTop: 0, padding: 0, overflow: "hidden" }, children: _jsxs("table", { className: "data-table alarms-grouped-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { width: "14%" }, children: "Time" }), _jsx("th", { style: { width: "18%" }, children: "System" }), _jsx("th", { style: { width: "14%" }, children: "Device" }), _jsx("th", { children: "Alarm" }), _jsx("th", { style: { width: "10%" }, children: "Severity" }), _jsx("th", { style: { width: "10%" }, children: "Status" })] }) }), _jsx("tbody", { children: (resellers || []).map((r) => {
                        const rCompanies = (companies || []).filter((c) => c.reseller_id === r.id);
                        const rAlarms = (alarms || []).filter((a) => rCompanies.some((c) => c.id === companyOf(a.system_id)?.id));
                        const activeCount = rAlarms.filter((a) => a.status === "active").length;
                        return (_jsxs(Fragment, { children: [_jsx("tr", { className: "alarm-group-row", children: _jsxs("td", { colSpan: 6, children: [_jsx("span", { className: "alarm-group-name", children: r.name }), _jsx(StatusPill, { status: activeCount > 0 ? "emergency" : "normal", label: activeCount > 0 ? `${activeCount} Alarm(s)` : "No Alarms" })] }) }), rCompanies.map((c) => {
                                    const cAlarms = rAlarms.filter((a) => companyOf(a.system_id)?.id === c.id);
                                    if (!cAlarms.length)
                                        return null;
                                    return (_jsxs(Fragment, { children: [_jsx("tr", { className: "alarm-subgroup-row", children: _jsxs("td", { colSpan: 6, children: [_jsx("span", { className: "alarm-subgroup-name", children: c.name }), _jsxs("span", { className: "alarm-subgroup-count", children: [cAlarms.length, " alarm(s)"] })] }) }), cAlarms.map((a) => (_jsxs("tr", { children: [_jsx("td", { className: "mono", children: new Date(a.occurred_at).toLocaleString() }), _jsx("td", { style: { fontWeight: 600 }, children: systemName(a.system_id) }), _jsx("td", { children: a.device_label }), _jsx("td", { children: a.message }), _jsx("td", { children: _jsx(StatusPill, { status: a.severity }) }), _jsx("td", { style: { color: a.status === "active" ? "var(--red)" : "var(--green)" }, children: a.status })] }, a.id)))] }, c.id));
                                })] }, r.id));
                    }) })] }) }));
}
