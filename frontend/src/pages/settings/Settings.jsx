import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { usePageHeader } from "../../components/layout/HeaderContext";
const CARDS = [
    ["MQTT / Ingestion", "EMQX broker shards, topic mappings — not yet wired (Milestone 2)"],
    ["Zitadel Auth", "SSO config, role definitions"],
    ["InfluxDB", "Telemetry retention policies — not yet wired (Milestone 2)"],
    ["Report Storage", "S3 PDF report storage — not yet wired (future milestone)"],
    ["Alerting", "On-call schedules, notification channels"],
    ["Report Templates", "HTML/CSS templates, PDF rendering — not yet wired (future milestone)"],
];
export function Settings() {
    usePageHeader("Platform Settings");
    return (_jsx("div", { className: "card-grid", style: { gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }, children: CARDS.map(([title, desc]) => (_jsxs("div", { className: "info-card", style: { cursor: "default" }, children: [_jsx("div", { className: "info-card-title", style: { marginBottom: 6 }, children: title }), _jsx("div", { style: { fontSize: 11, color: "var(--text-dim)" }, children: desc })] }, title))) }));
}
