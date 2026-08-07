import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate, useParams } from "react-router-dom";
import { LeafletMap } from "../../components/map/LeafletMap";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useSystems } from "../../queries/systems";
export function CompanyMap() {
    const { companyId } = useParams();
    const navigate = useNavigate();
    const { data: company } = useCompany(companyId);
    const { data: systems } = useSystems(companyId);
    usePageHeader("Map View", [
        { label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) },
    ]);
    const normal = (systems || []).filter((s) => s.status === "normal").length;
    return (_jsxs("div", { style: { position: "relative", height: "calc(100vh - 100px)" }, children: [_jsx(LeafletMap, { markers: (systems || [])
                    .filter((s) => s.lat != null && s.lng != null)
                    .map((s) => ({
                    id: s.id,
                    lat: s.lat,
                    lng: s.lng,
                    status: s.status,
                    label: s.name,
                })), onMarkerClick: (id) => navigate(`/systems/${id}`), singleMarkerZoom: 14 }), _jsxs("div", { className: "map-legend", children: [_jsx("div", { style: { fontSize: 10, fontWeight: 700, marginBottom: 6 }, children: "Status" }), _jsxs("div", { className: "map-legend-item", children: [_jsx("div", { className: "map-legend-dot", style: { background: "#22c55e" } }), "Normal"] }), _jsxs("div", { className: "map-legend-item", children: [_jsx("div", { className: "map-legend-dot", style: { background: "#ef4444" } }), "Emergency"] }), _jsxs("div", { className: "map-legend-item", children: [_jsx("div", { className: "map-legend-dot", style: { background: "#f59e0b" } }), "Alarm"] }), _jsxs("div", { className: "map-legend-item", children: [_jsx("div", { className: "map-legend-dot", style: { background: "#a855f7" } }), "Test"] })] }), _jsxs("div", { className: "map-stats", children: [_jsx("div", { style: { fontSize: 10, fontWeight: 700, marginBottom: 6 }, children: company?.name }), _jsxs("div", { className: "map-stat-row", children: [_jsx("span", { style: { color: "var(--text-dim)" }, children: "Systems" }), _jsx("span", { style: { fontWeight: 600 }, children: systems?.length ?? 0 })] }), _jsxs("div", { className: "map-stat-row", children: [_jsx("span", { style: { color: "var(--green)" }, children: "Normal" }), _jsx("span", { style: { fontWeight: 600 }, children: normal })] }), _jsxs("div", { className: "map-stat-row", children: [_jsx("span", { style: { color: "var(--red)" }, children: "Events" }), _jsx("span", { style: { fontWeight: 600, color: "var(--red)" }, children: (systems?.length ?? 0) - normal })] })] })] }));
}
