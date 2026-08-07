import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate, useParams } from "react-router-dom";
import { LeafletMap } from "../../components/map/LeafletMap";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies } from "../../queries/companies";
import { useReseller } from "../../queries/resellers";
import { useSystems } from "../../queries/systems";
export function ResellerMap() {
    const { resellerId } = useParams();
    const navigate = useNavigate();
    const { data: reseller } = useReseller(resellerId);
    const { data: companies } = useCompanies(resellerId);
    const { data: systems } = useSystems();
    usePageHeader("Map View", [
        { label: "Resellers", onClick: () => navigate("/resellers") },
        { label: reseller?.name || "", onClick: () => navigate(`/resellers/${resellerId}`) },
    ]);
    const rSystems = (systems || []).filter((s) => (companies || []).some((c) => c.id === s.company_id));
    const normal = rSystems.filter((s) => s.status === "normal").length;
    return (_jsxs("div", { style: { position: "relative", height: "calc(100vh - 100px)" }, children: [_jsx(LeafletMap, { markers: (companies || [])
                    .filter((c) => c.lat != null && c.lng != null)
                    .map((c) => ({
                    id: c.id,
                    lat: c.lat,
                    lng: c.lng,
                    status: c.status,
                    label: c.name,
                    sublabel: c.address ?? undefined,
                })), onMarkerClick: (id) => navigate(`/companies/${id}`) }), _jsxs("div", { className: "map-legend", children: [_jsx("div", { style: { fontSize: 10, fontWeight: 700, marginBottom: 6 }, children: "Status" }), _jsxs("div", { className: "map-legend-item", children: [_jsx("div", { className: "map-legend-dot", style: { background: "#22c55e" } }), "Normal"] }), _jsxs("div", { className: "map-legend-item", children: [_jsx("div", { className: "map-legend-dot", style: { background: "#ef4444" } }), "Emergency"] }), _jsxs("div", { className: "map-legend-item", children: [_jsx("div", { className: "map-legend-dot", style: { background: "#f59e0b" } }), "Alarm"] }), _jsxs("div", { className: "map-legend-item", children: [_jsx("div", { className: "map-legend-dot", style: { background: "#a855f7" } }), "Test"] })] }), _jsxs("div", { className: "map-stats", children: [_jsx("div", { style: { fontSize: 10, fontWeight: 700, marginBottom: 6 }, children: reseller?.name }), _jsxs("div", { className: "map-stat-row", children: [_jsx("span", { style: { color: "var(--text-dim)" }, children: "Companies" }), _jsx("span", { style: { fontWeight: 600 }, children: companies?.length ?? 0 })] }), _jsxs("div", { className: "map-stat-row", children: [_jsx("span", { style: { color: "var(--text-dim)" }, children: "Systems" }), _jsx("span", { style: { fontWeight: 600 }, children: rSystems.length })] }), _jsxs("div", { className: "map-stat-row", children: [_jsx("span", { style: { color: "var(--green)" }, children: "Normal" }), _jsx("span", { style: { fontWeight: 600 }, children: normal })] }), _jsxs("div", { className: "map-stat-row", children: [_jsx("span", { style: { color: "var(--red)" }, children: "Events" }), _jsx("span", { style: { fontWeight: 600, color: "var(--red)" }, children: rSystems.length - normal })] })] })] }));
}
