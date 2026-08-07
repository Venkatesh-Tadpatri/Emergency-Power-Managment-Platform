import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate, useParams } from "react-router-dom";
import { StatusPill } from "../../components/common/StatusPill";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAlarms } from "../../queries/alarms";
import { useCompany } from "../../queries/companies";
import { useSystems } from "../../queries/systems";
export function CompanyAlarms() {
    const { companyId } = useParams();
    const navigate = useNavigate();
    const { data: company } = useCompany(companyId);
    const { data: alarms } = useAlarms({ companyId });
    const { data: systems } = useSystems(companyId);
    usePageHeader("Alarms", [{ label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) }]);
    const systemName = (id) => systems?.find((s) => s.id === id)?.name || id;
    return (_jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Time" }), _jsx("th", { children: "System" }), _jsx("th", { children: "Device" }), _jsx("th", { children: "Alarm" }), _jsx("th", { children: "Severity" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Acknowledged" })] }) }), _jsx("tbody", { children: (alarms || []).map((a) => (_jsxs("tr", { children: [_jsx("td", { className: "mono", children: new Date(a.occurred_at).toLocaleString() }), _jsx("td", { style: { fontWeight: 600 }, children: systemName(a.system_id) }), _jsx("td", { children: a.device_label }), _jsx("td", { children: a.message }), _jsx("td", { children: _jsx(StatusPill, { status: a.severity }) }), _jsx("td", { style: { color: a.status === "active" ? "var(--red)" : "var(--green)" }, children: a.status.charAt(0).toUpperCase() + a.status.slice(1) }), _jsx("td", { children: a.ack_by ? (_jsxs("div", { className: "ack-detail", children: [_jsx("span", { className: "ack-badge acked", children: "Acknowledged" }), _jsxs("span", { className: "ack-meta", children: [a.ack_by, " @ ", a.ack_at ? new Date(a.ack_at).toLocaleTimeString() : ""] })] })) : (_jsx("span", { className: "ack-badge unacked", children: "Unacked" })) })] }, a.id))) })] }));
}
