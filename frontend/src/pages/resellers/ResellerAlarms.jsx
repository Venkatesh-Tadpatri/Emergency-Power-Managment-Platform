import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useNavigate, useParams } from "react-router-dom";
import { StatusPill } from "../../components/common/StatusPill";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAlarms } from "../../queries/alarms";
import { useCompanies } from "../../queries/companies";
import { useReseller } from "../../queries/resellers";
import { useSystems } from "../../queries/systems";
export function ResellerAlarms() {
    const { resellerId } = useParams();
    const navigate = useNavigate();
    const { data: reseller } = useReseller(resellerId);
    const { data: alarms } = useAlarms({ resellerId });
    const { data: systems } = useSystems();
    const { data: companies } = useCompanies(resellerId);
    usePageHeader("Alarms", [
        { label: "Resellers", onClick: () => navigate("/resellers") },
        { label: reseller?.name || "", onClick: () => navigate(`/resellers/${resellerId}`) },
    ]);
    const systemName = (id) => systems?.find((s) => s.id === id)?.name || id;
    const companyName = (systemId) => {
        const sys = systems?.find((s) => s.id === systemId);
        return companies?.find((c) => c.id === sys?.company_id)?.name || "";
    };
    return (_jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Time" }), _jsx("th", { children: "Company" }), _jsx("th", { children: "System" }), _jsx("th", { children: "Device" }), _jsx("th", { children: "Alarm" }), _jsx("th", { children: "Severity" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Acknowledged" })] }) }), _jsx("tbody", { children: (alarms || []).map((a) => (_jsxs("tr", { children: [_jsx("td", { className: "mono", children: new Date(a.occurred_at).toLocaleString() }), _jsx("td", { children: companyName(a.system_id) }), _jsx("td", { style: { fontWeight: 600 }, children: systemName(a.system_id) }), _jsx("td", { children: a.device_label }), _jsx("td", { children: a.message }), _jsx("td", { children: _jsx(StatusPill, { status: a.severity }) }), _jsx("td", { style: { color: a.status === "active" ? "var(--red)" : "var(--green)" }, children: a.status.charAt(0).toUpperCase() + a.status.slice(1) }), _jsx("td", { children: a.ack_by ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "ack-badge acked", children: "Acked" }), _jsx("span", { className: "ack-meta", style: { marginLeft: 6 }, children: a.ack_by })] })) : (_jsx("span", { className: "ack-badge unacked", children: "Unacked" })) })] }, a.id))) })] }));
}
