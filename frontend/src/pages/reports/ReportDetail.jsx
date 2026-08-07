import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useNavigate, useParams } from "react-router-dom";
import { LoadProfileChart } from "../../components/chart/LoadProfileChart";
import { StatusPill } from "../../components/common/StatusPill";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useReport } from "../../queries/reports";
import { useSystem } from "../../queries/systems";
const TYPE_STATUS = { "gen-run": "alarm", "ats-emergency": "emergency", test: "test" };
export function ReportDetail() {
    const { companyId, reportId } = useParams();
    const navigate = useNavigate();
    const { data: company } = useCompany(companyId);
    const { data: report } = useReport(reportId);
    const { data: system } = useSystem(report?.system_id);
    usePageHeader("Report Detail", [
        { label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) },
        { label: "Reports", onClick: () => navigate(`/companies/${companyId}/reports`) },
    ]);
    if (!report)
        return null;
    const loadProfile = report.load_profile_data || [];
    const threshold = (report.rated_kw || 0) * 0.3;
    const durationPerPoint = report.duration_min && loadProfile.length > 1 ? report.duration_min / (loadProfile.length - 1) : 0;
    let maxRun = 0;
    let curRun = 0;
    loadProfile.forEach((kw) => {
        if (kw >= threshold) {
            curRun += durationPerPoint;
            if (curRun > maxRun)
                maxRun = curRun;
        }
        else {
            curRun = 0;
        }
    });
    const pass = maxRun >= 30;
    return (_jsxs(_Fragment, { children: [_jsx("button", { className: "report-back-btn", onClick: () => navigate(`/companies/${companyId}/reports`), children: "\u2190 Back to reports" }), _jsxs("div", { className: "report-detail-header", children: [_jsx("div", { className: "report-detail-id", children: report.report_code }), _jsxs("div", { className: "report-detail-meta", children: [_jsx(StatusPill, { status: TYPE_STATUS[report.type] || "normal", label: report.type }), _jsx("span", { children: system?.name }), _jsxs("span", { className: "mono", children: [report.report_date, " ", report.time_label] }), _jsx("span", { className: "mono", children: report.duration_label })] })] }), _jsxs("div", { className: "report-stats-row", children: [_jsxs("div", { className: "report-stat", children: [_jsx("div", { className: "report-stat-label", children: "Initiating ATS" }), _jsx("div", { className: "report-stat-val mono", children: report.initiating_ats || "—" })] }), _jsxs("div", { className: "report-stat", children: [_jsx("div", { className: "report-stat-label", children: "Rated Capacity" }), _jsxs("div", { className: "report-stat-val mono", children: [report.rated_kw, " kW"] })] }), _jsxs("div", { className: "report-stat", children: [_jsx("div", { className: "report-stat-label", children: "Peak Load" }), _jsxs("div", { className: "report-stat-val mono", style: { color: "var(--cyan)" }, children: [report.peak_kw, " kW (", report.rated_kw ? Math.round(((report.peak_kw || 0) / report.rated_kw) * 100) : 0, "%)"] })] }), _jsxs("div", { className: "report-stat", children: [_jsx("div", { className: "report-stat-label", children: "Avg Load" }), _jsxs("div", { className: "report-stat-val mono", children: [report.avg_kw, " kW (", report.rated_kw ? Math.round(((report.avg_kw || 0) / report.rated_kw) * 100) : 0, "%)"] })] }), _jsxs("div", { className: "report-stat", children: [_jsx("div", { className: "report-stat-label", children: "\u226530% for 30m" }), _jsxs("div", { className: "report-stat-val", style: { color: pass ? "var(--green)" : "var(--red)" }, children: [pass ? "Pass" : "Fail", " ", _jsxs("span", { style: { fontSize: 10, color: "var(--text-dim)" }, children: ["(", Math.round(maxRun), "m)"] })] })] })] }), _jsxs("div", { className: "report-chart-wrap", children: [_jsx("div", { className: "report-chart-title", children: "Generator Load Profile" }), loadProfile.length > 0 && (_jsx(LoadProfileChart, { loadProfile: loadProfile, ratedKw: report.rated_kw || 0, peakKw: report.peak_kw || 0, durationMin: report.duration_min || 0 }))] })] }));
}
