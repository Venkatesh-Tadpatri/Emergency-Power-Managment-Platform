import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { DonutChart } from "../components/common/DonutChart";
import { FleetHero } from "../components/common/FleetHero";
import { InfoCard, StatsGrid } from "../components/common/StatCard";
import { StatusPill } from "../components/common/StatusPill";
import { IconAlert, IconBuilding, IconPanel, IconResellers, IconSettings, IconUsers, } from "../components/common/Icons";
import { usePageHeader } from "../components/layout/HeaderContext";
import { useAlarms } from "../queries/alarms";
import { useCompanies } from "../queries/companies";
import { useMe } from "../queries/me";
import { useResellers } from "../queries/resellers";
import { useSystems } from "../queries/systems";
export function Dashboard() {
    const auth = useAuth();
    const navigate = useNavigate();
    const { data: me } = useMe(auth.isAuthenticated);
    const { data: resellers } = useResellers();
    const { data: companies } = useCompanies();
    const { data: systems } = useSystems();
    const { data: alarms } = useAlarms({}, { enabled: me?.role === "superadmin" });
    usePageHeader("Dashboard");
    if (me && me.role && !me.permissions.manage_resellers) {
        if (me.company_id) {
            return _jsx(Navigate, { to: `/companies/${me.company_id}`, replace: true });
        }
        if (me.reseller_id) {
            return _jsx(Navigate, { to: `/resellers/${me.reseller_id}`, replace: true });
        }
    }
    if (me && !me.role) {
        return (_jsxs("div", { className: "center-screen", style: { flexDirection: "column", gap: 8 }, children: [_jsxs("div", { children: ["Your account (", me.email, ") has signed in but has no role assigned yet."] }), _jsx("div", { children: "Ask a superadmin to assign you a role." })] }));
    }
    const normalCount = (systems || []).filter((s) => s.status === "normal").length;
    const warningCount = (systems || []).filter((s) => s.status === "alarm" || s.status === "test").length;
    const criticalCount = (systems || []).filter((s) => s.status === "emergency").length;
    const eventCount = (systems || []).length - normalCount;
    const events = (systems || []).filter((s) => s.status !== "normal");
    const activeAlarms = (alarms || []).filter((a) => a.status === "active");
    const unackedAlarms = activeAlarms.filter((a) => !a.ack_by);
    return (_jsxs(_Fragment, { children: [_jsx(FleetHero, {}), _jsx(StatsGrid, { stats: [
                    { label: "Resellers", value: resellers?.length ?? 0, color: "var(--purple)", icon: IconResellers, onClick: () => navigate("/resellers") },
                    { label: "Companies", value: companies?.length ?? 0, color: "var(--blue)", icon: IconBuilding, onClick: () => navigate("/companies") },
                    { label: "Total Systems", value: systems?.length ?? 0, color: "var(--cyan)", icon: IconPanel },
                    { label: "Events", value: eventCount, color: eventCount ? "var(--red)" : "var(--green)", icon: IconAlert },
                ] }), _jsxs("div", { className: "grid-2", style: { alignItems: "start" }, children: [_jsxs("div", { className: "card", style: { marginTop: 0 }, children: [_jsx("div", { className: "section-header", children: _jsxs("div", { children: [_jsx("div", { className: "section-title", children: "System Health Overview" }), _jsx("div", { className: "section-sub", children: "Live rollup across the fleet" })] }) }), _jsx(DonutChart, { centerValue: systems?.length ?? 0, centerLabel: "Total Systems", segments: [
                                    { label: "Healthy", value: normalCount, color: "#16a34a" },
                                    { label: "Warning", value: warningCount, color: "#d97706" },
                                    { label: "Critical", value: criticalCount, color: "#dc2626" },
                                ] })] }), _jsxs("div", { className: "card", style: { marginTop: 0 }, children: [_jsxs("div", { className: "section-header", children: [_jsxs("div", { children: [_jsx("div", { className: "section-title", children: "Active Alarms" }), _jsxs("div", { className: "section-sub", children: [unackedAlarms.length, " unacknowledged"] })] }), _jsx("span", { className: "bc-link", onClick: () => navigate("/alarms"), children: "View All" })] }), activeAlarms.length === 0 ? (_jsx("div", { style: { fontSize: 12, color: "var(--text-dim)", padding: "12px 0" }, children: "No active alarms right now." })) : (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: activeAlarms.slice(0, 5).map((a) => (_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: a.message }), _jsx("div", { style: { fontSize: 10.5, color: "var(--text-dim)" }, children: new Date(a.occurred_at).toLocaleString() })] }), _jsx(StatusPill, { status: a.severity })] }, a.id))) }))] })] }), _jsx("div", { className: "section-header", style: { marginTop: 22 }, children: _jsxs("div", { children: [_jsx("div", { className: "section-title", children: "Reseller Overview" }), _jsx("div", { className: "section-sub", children: "Rollup status by reseller" })] }) }), _jsx("div", { className: "card-grid", children: (resellers || []).map((r) => {
                    const rCompanies = (companies || []).filter((c) => c.reseller_id === r.id);
                    const rSystems = (systems || []).filter((s) => rCompanies.some((c) => c.id === s.company_id));
                    const rNormal = rSystems.filter((s) => s.status === "normal").length;
                    return (_jsx(InfoCard, { title: r.name, status: r.status, icon: IconResellers, stats: [
                            { label: "Companies", value: rCompanies.length, color: "var(--blue)" },
                            { label: "Systems", value: rSystems.length, color: "var(--cyan)" },
                            { label: "Normal", value: rNormal, color: "var(--green)" },
                            { label: "Events", value: rSystems.length - rNormal, color: "var(--red)" },
                        ], onClick: () => navigate(`/resellers/${r.id}`) }, r.id));
                }) }), events.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "section-header", style: { marginTop: 22 }, children: _jsxs("div", { children: [_jsx("div", { className: "section-title", children: "Active Events" }), _jsx("div", { className: "section-sub", children: "Systems requiring attention" })] }) }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "System" }), _jsx("th", { children: "Status" })] }) }), _jsx("tbody", { children: events.map((s) => (_jsxs("tr", { style: { cursor: "pointer" }, onClick: () => navigate(`/systems/${s.id}`), children: [_jsx("td", { style: { fontWeight: 600 }, children: s.name }), _jsx("td", { children: _jsx(StatusPill, { status: s.status }) })] }, s.id))) })] })] })), me?.permissions.manage_resellers && (_jsxs(_Fragment, { children: [_jsx("div", { className: "section-header", style: { marginTop: 22 }, children: _jsx("div", { children: _jsx("div", { className: "section-title", children: "Quick Actions" }) }) }), _jsxs("div", { className: "quick-actions-grid", children: [_jsxs("button", { className: "quick-action-btn", style: { "--qa-color": "#7c3aed" }, onClick: () => navigate("/resellers"), children: [_jsx(IconResellers, { size: 18 }), "Resellers"] }), _jsxs("button", { className: "quick-action-btn", style: { "--qa-color": "#dc2626" }, onClick: () => navigate("/alarms"), children: [_jsx(IconAlert, { size: 18 }), "All Alarms"] }), _jsxs("button", { className: "quick-action-btn", style: { "--qa-color": "#db2777" }, onClick: () => navigate("/users"), children: [_jsx(IconUsers, { size: 18 }), "Users"] }), _jsxs("button", { className: "quick-action-btn", style: { "--qa-color": "#64748b" }, onClick: () => navigate("/settings"), children: [_jsx(IconSettings, { size: 18 }), "Settings"] })] })] }))] }));
}
