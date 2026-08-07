import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useNavigate, useParams } from "react-router-dom";
import { LeafletMap } from "../../components/map/LeafletMap";
import { OneLineDiagram } from "../../components/oneline/OneLineDiagram";
import { DeviceManager } from "../../components/systems/DeviceManager";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useAts, useGenerators, usePanels, useSystem } from "../../queries/systems";
export function SystemDetail() {
    const { systemId } = useParams();
    const navigate = useNavigate();
    const { data: system } = useSystem(systemId);
    const { data: company } = useCompany(system?.company_id);
    const { data: panels } = usePanels(systemId);
    const panelId = panels?.[0]?.id;
    const { data: ats } = useAts(panelId);
    const { data: generators } = useGenerators(panelId);
    usePageHeader(system?.name || "System", [
        { label: company?.name || "", onClick: () => navigate(`/companies/${system?.company_id}`) },
    ]);
    if (!system)
        return null;
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "system-topbar", children: _jsxs("div", { className: "sys-left", children: [_jsxs("div", { className: "sys-conn", children: [_jsx("div", { className: "dot" }), "Live"] }), _jsx("div", { className: "sys-clock", children: "0000-00-00 00:00:00" })] }) }), _jsx(OneLineDiagram, { ats: ats || [], generators: generators || [], utilityName: "Utility" }), _jsx("div", { className: "sys-bottombar", children: _jsxs("div", { className: "sbb-stats", children: [_jsxs("div", { className: "sbb-s", children: [_jsx("span", { className: "l", children: "ATS Units" }), _jsx("span", { className: "v", children: ats?.length ?? 0 })] }), _jsxs("div", { className: "sbb-s", children: [_jsx("span", { className: "l", children: "Generators" }), _jsx("span", { className: "v", children: generators?.length ?? 0 })] }), _jsxs("div", { className: "sbb-s", children: [_jsx("span", { className: "l", children: "Capacity" }), _jsxs("span", { className: "v", children: ["000", " kW"] })] })] }) }), _jsx(DeviceManager, { systemId: system.id }), system.lat != null && system.lng != null && (_jsxs("div", { style: { marginTop: 16 }, children: [_jsx("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text-dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }, children: "Location" }), _jsx("div", { style: { height: 160, width: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }, children: _jsx(LeafletMap, { markers: [{ id: system.id, lat: system.lat, lng: system.lng, status: system.status, label: system.name }], singleMarkerZoom: 14 }) })] }))] }));
}
