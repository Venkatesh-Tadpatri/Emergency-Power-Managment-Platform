import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { StatusPill } from "../../components/common/StatusPill";
import { useCompany } from "../../queries/companies";
import { useCompanyAtsRoster } from "../../queries/compliance";
import { useReports } from "../../queries/reports";
import { useSystems } from "../../queries/systems";
const TYPE_STATUS = { "gen-run": "alarm", "ats-emergency": "emergency", test: "test" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function CompanyReports() {
    const { companyId } = useParams();
    const navigate = useNavigate();
    const { data: company } = useCompany(companyId);
    const { data: reports } = useReports({ companyId });
    const { data: systems } = useSystems(companyId);
    const [tab, setTab] = useState("calendar");
    const now = new Date();
    const [calMonth, setCalMonth] = useState(now.getMonth());
    const [calYear, setCalYear] = useState(now.getFullYear());
    usePageHeader("Reports", [{ label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) }]);
    const systemName = (id) => systems?.find((s) => s.id === id)?.name || id;
    const calendarDays = useMemo(() => {
        const first = new Date(calYear, calMonth, 1);
        const last = new Date(calYear, calMonth + 1, 0);
        let dow = first.getDay();
        dow = dow === 0 ? 6 : dow - 1;
        const days = [];
        for (let p = dow - 1; p >= 0; p--)
            days.push({ date: new Date(calYear, calMonth, -p), outside: true });
        for (let d = 1; d <= last.getDate(); d++)
            days.push({ date: new Date(calYear, calMonth, d), outside: false });
        while (days.length % 7 !== 0) {
            const nextIdx = days.length - last.getDate() - dow + 1;
            days.push({ date: new Date(calYear, calMonth + 1, nextIdx), outside: true });
        }
        return days;
    }, [calMonth, calYear]);
    const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const todayIso = fmtDate(now);
    const reportsByDate = useMemo(() => {
        const map = {};
        (reports || []).forEach((r) => {
            var _a;
            (map[_a = r.report_date] || (map[_a] = [])).push(r);
        });
        return map;
    }, [reports]);
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "report-tab-bar", children: ["calendar", "list", "compliance"].map((t) => (_jsx("button", { className: `report-tab-btn${tab === t ? " active" : ""}`, onClick: () => setTab(t), children: t === "calendar" ? "Calendar" : t === "list" ? "All Reports" : "ATS Compliance" }, t))) }), tab === "calendar" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "cal-nav", children: [_jsx("button", { className: "cal-nav-btn", onClick: () => (calMonth === 0 ? (setCalMonth(11), setCalYear((y) => y - 1)) : setCalMonth((m) => m - 1)), children: "\u2039" }), _jsxs("span", { className: "cal-nav-title", children: [MONTHS[calMonth], " ", calYear] }), _jsx("button", { className: "cal-nav-btn", onClick: () => (calMonth === 11 ? (setCalMonth(0), setCalYear((y) => y + 1)) : setCalMonth((m) => m + 1)), children: "\u203A" })] }), _jsxs("div", { className: "cal-grid", children: [["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (_jsx("div", { className: "cal-dow", children: d }, d))), calendarDays.map(({ date, outside }, i) => {
                                const key = fmtDate(date);
                                const dayReports = reportsByDate[key] || [];
                                return (_jsxs("div", { className: `cal-cell ${outside ? "outside " : ""}${key === todayIso ? "today " : ""}${dayReports.length ? "has-events" : ""}`, children: [_jsx("span", { className: "cal-day-num", children: date.getDate() }), dayReports.map((r) => (_jsxs("div", { className: "cal-event", style: { borderLeft: `3px solid ${r.type === "gen-run" ? "var(--amber)" : r.type === "ats-emergency" ? "var(--red)" : "var(--purple)"}` }, onClick: () => navigate(`/companies/${companyId}/reports/${r.id}`), children: [_jsx("span", { className: "cal-event-type", children: r.type }), _jsx("span", { className: "cal-event-sys", children: systemName(r.system_id) })] }, r.id)))] }, i));
                            })] })] })), tab === "list" && (_jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Date" }), _jsx("th", { children: "Type" }), _jsx("th", { children: "System" }), _jsx("th", { children: "Initiating ATS" }), _jsx("th", { children: "Duration" }), _jsx("th", { children: "Peak kW" }), _jsx("th", { children: "Avg kW" }), _jsx("th", {})] }) }), _jsx("tbody", { children: (reports || []).map((r) => (_jsxs("tr", { style: { cursor: "pointer" }, onClick: () => navigate(`/companies/${companyId}/reports/${r.id}`), children: [_jsxs("td", { className: "mono", children: [r.report_date, " ", r.time_label] }), _jsx("td", { children: _jsx(StatusPill, { status: TYPE_STATUS[r.type] || "normal", label: r.type }) }), _jsx("td", { style: { fontWeight: 600 }, children: systemName(r.system_id) }), _jsx("td", { className: "mono", children: r.initiating_ats || "—" }), _jsx("td", { className: "mono", children: r.duration_label }), _jsxs("td", { className: "mono", children: [r.peak_kw ?? "—", " kW"] }), _jsxs("td", { className: "mono", children: [r.avg_kw ?? "—", " kW"] }), _jsx("td", { style: { color: "var(--blue)" }, children: "View \u2192" })] }, r.id))) })] })), tab === "compliance" && _jsx(ComplianceTab, { companyId: companyId, reports: reports || [] })] }));
}
function ComplianceTab({ companyId, reports }) {
    const { data: roster } = useCompanyAtsRoster(companyId);
    const rows = useMemo(() => {
        const out = [];
        (roster || []).forEach(({ system, ats }) => {
            const systemReports = reports.filter((r) => r.system_id === system.id);
            ats.forEach((a) => {
                const count = systemReports.filter((r) => r.initiating_ats === a.name).length;
                out.push({ systemName: system.name, atsName: a.name, branch: a.branch, count, ok: count > 0 });
            });
        });
        return out;
    }, [roster, reports]);
    const total = rows.length;
    const ok = rows.filter((r) => r.ok).length;
    const pct = total ? Math.round((ok / total) * 100) : 0;
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "section-header", children: _jsxs("div", { children: [_jsx("div", { className: "section-title", children: "Annual ATS Initiating Compliance" }), _jsx("div", { className: "section-sub", children: "Every ATS should be the initiating ATS at least once per year" })] }) }), _jsx("div", { className: "compliance-summary", children: _jsxs("div", { className: "compliance-stats", children: [_jsxs("div", { className: "compliance-stat", children: [_jsxs("span", { className: "v", style: { color: "var(--cyan)" }, children: [pct, "%"] }), _jsx("span", { className: "l", children: "Compliant" })] }), _jsxs("div", { className: "compliance-stat", children: [_jsx("span", { className: "v", style: { color: "var(--green)" }, children: ok }), _jsx("span", { className: "l", children: "Compliant" })] }), _jsxs("div", { className: "compliance-stat", children: [_jsx("span", { className: "v", style: { color: "var(--red)" }, children: total - ok }), _jsx("span", { className: "l", children: "Outstanding" })] }), _jsxs("div", { className: "compliance-stat", children: [_jsx("span", { className: "v", style: { color: "var(--cyan)" }, children: total }), _jsx("span", { className: "l", children: "Total ATS" })] })] }) }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "System" }), _jsx("th", { children: "ATS" }), _jsx("th", { children: "Branch" }), _jsx("th", { children: "Initiations" }), _jsx("th", { children: "Status" })] }) }), _jsx("tbody", { children: rows.map((r, i) => (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 600 }, children: r.systemName }), _jsx("td", { className: "mono", children: r.atsName }), _jsx("td", { children: _jsx("span", { className: `branch-tag ${r.branch}`, children: r.branch }) }), _jsx("td", { className: "mono", children: r.count }), _jsx("td", { children: r.ok ? _jsx("span", { className: "ack-badge acked", children: "Compliant" }) : _jsx("span", { className: "ack-badge unacked", children: "Outstanding" }) })] }, i))) })] })] }));
}
