import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from "react-router-dom";
import { LeafletMap } from "../components/map/LeafletMap";
import { usePageHeader } from "../components/layout/HeaderContext";
import { useCompanies } from "../queries/companies";
import { useSystems } from "../queries/systems";
export function MapView() {
    const navigate = useNavigate();
    const { data: companies } = useCompanies();
    const { data: systems } = useSystems();
    usePageHeader("Map View");
    const normal = (systems || []).filter((s) => s.status === "normal").length;
    const events = (systems || []).length - normal;
    return (_jsxs("div", { style: { position: "relative", height: "calc(100vh - 100px)" }, children: [_jsx(LeafletMap, { markers: (companies || [])
                    .filter((c) => c.lat != null && c.lng != null)
                    .map((c) => ({
                    id: c.id,
                    lat: c.lat,
                    lng: c.lng,
                    status: c.status,
                    label: c.name,
                    sublabel: c.address ?? undefined,
                })), onMarkerClick: (id) => navigate(`/companies/${id}`) }), _jsxs("div", { className: "map-legend", children: [_jsx("div", { style: { fontSize: 10, fontWeight: 700, marginBottom: 6, color: "#0f172a" }, children: "Status" }), _jsxs("div", { className: "map-legend-item", children: [_jsx("div", { className: "map-legend-dot", style: { background: "#22c55e" } }), "Normal"] }), _jsxs("div", { className: "map-legend-item", children: [_jsx("div", { className: "map-legend-dot", style: { background: "#ef4444" } }), "Emergency"] }), _jsxs("div", { className: "map-legend-item", children: [_jsx("div", { className: "map-legend-dot", style: { background: "#f59e0b" } }), "Alarm"] }), _jsxs("div", { className: "map-legend-item", children: [_jsx("div", { className: "map-legend-dot", style: { background: "#a855f7" } }), "Test"] })] }), _jsxs("div", { className: "map-stats", children: [_jsx("div", { style: { fontSize: 10, fontWeight: 700, marginBottom: 6, color: "#0f172a" }, children: "Fleet Summary" }), _jsxs("div", { className: "map-stat-row", children: [_jsx("span", { style: { color: "#5c7188" }, children: "Facilities" }), _jsx("span", { style: { fontWeight: 600, color: "#0f172a" }, children: companies?.length ?? 0 })] }), _jsxs("div", { className: "map-stat-row", children: [_jsx("span", { style: { color: "#5c7188" }, children: "Systems" }), _jsx("span", { style: { fontWeight: 600, color: "#0f172a" }, children: systems?.length ?? 0 })] }), _jsxs("div", { className: "map-stat-row", children: [_jsx("span", { style: { color: "var(--green)" }, children: "Normal" }), _jsx("span", { style: { fontWeight: 600, color: "#0f172a" }, children: normal })] }), _jsxs("div", { className: "map-stat-row", children: [_jsx("span", { style: { color: "var(--red)" }, children: "Events" }), _jsx("span", { style: { fontWeight: 600, color: "var(--red)" }, children: events })] })] })] }));
}
