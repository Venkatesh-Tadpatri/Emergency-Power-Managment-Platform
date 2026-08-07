import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { StatsGrid } from "../../components/common/StatCard";
import { StatusPill } from "../../components/common/StatusPill";
import { IconAlert, IconBuilding, IconCheckCircle, IconPanel } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { PageHero } from "../../components/common/PageHero";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAlarms } from "../../queries/alarms";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { useArchiveSystem, useCreateSystem, useSystems, useUpdateSystem } from "../../queries/systems";
export function CompanyDashboard() {
    const { companyId } = useParams();
    const navigate = useNavigate();
    const auth = useAuth();
    const { data: me } = useMe(auth.isAuthenticated);
    const { data: company } = useCompany(companyId);
    // Only superadmin/reseller_admin can actually view a reseller — skip the fetch
    // and the breadcrumb entirely for company-scoped roles rather than link to a
    // page the backend will reject.
    const canViewReseller = me?.role === "superadmin" || me?.role === "reseller_admin";
    const { data: reseller } = useReseller(canViewReseller ? company?.reseller_id : undefined);
    const { data: systems } = useSystems(companyId);
    const { data: alarms } = useAlarms({ companyId });
    const createSystem = useCreateSystem();
    const updateSystem = useUpdateSystem();
    const archiveSystem = useArchiveSystem();
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: "", address: "", lat: "", lng: "" });
    usePageHeader(company?.name || "Company", canViewReseller
        ? [
            { label: "Resellers", onClick: () => navigate("/resellers") },
            { label: reseller?.name || "", onClick: () => reseller && navigate(`/resellers/${reseller.id}`) },
        ]
        : []);
    const canManage = me?.role === "superadmin";
    const normal = (systems || []).filter((s) => s.status === "normal").length;
    const events = (systems || []).length - normal;
    const active = (alarms || []).filter((a) => a.status === "active");
    const unacked = active.filter((a) => !a.ack_by);
    const openNew = () => {
        setForm({ name: "", address: "", lat: "", lng: "" });
        setEditing("new");
    };
    const openEdit = (s, e) => {
        e.stopPropagation();
        setForm({ name: s.name, address: s.address || "", lat: s.lat?.toString() || "", lng: s.lng?.toString() || "" });
        setEditing(s);
    };
    const submit = (e) => {
        e.preventDefault();
        if (!form.name.trim() || !companyId)
            return;
        const data = {
            name: form.name,
            address: form.address,
            lat: form.lat ? Number(form.lat) : undefined,
            lng: form.lng ? Number(form.lng) : undefined,
        };
        if (editing === "new") {
            createSystem.mutate({ ...data, company_id: companyId });
        }
        else if (editing) {
            updateSystem.mutate({ id: editing.id, data });
        }
        setEditing(null);
    };
    return (_jsxs(_Fragment, { children: [_jsx(PageHero, { title: company?.name || "Company", subtitle: company?.address, icon: IconBuilding, color: events > 0 ? "#dc2626" : "#2563eb", bgImage: "/images/hero-bg.jpg" }), _jsx(StatsGrid, { stats: [
                    { label: "Systems", value: systems?.length ?? 0, color: "var(--cyan)", icon: IconPanel },
                    { label: "Normal", value: normal, color: "var(--green)", icon: IconCheckCircle },
                    { label: "Events", value: events, color: events ? "var(--red)" : "var(--green)", icon: IconAlert },
                    { label: "Unacked Alarms", value: unacked.length, color: unacked.length ? "var(--red)" : "var(--green)", icon: IconAlert },
                ] }), _jsxs("div", { className: "section-header", children: [_jsxs("div", { children: [_jsx("div", { className: "section-title", children: "Systems" }), _jsxs("div", { className: "section-sub", children: [systems?.length ?? 0, " systems at ", company?.name] })] }), canManage && (_jsx("button", { className: "header-btn primary", onClick: openNew, children: "+ New System" }))] }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "System" }), _jsx("th", { children: "Status" }), _jsx("th", {}), canManage && _jsx("th", {})] }) }), _jsx("tbody", { children: (systems || []).map((s) => (_jsxs("tr", { style: { cursor: "pointer" }, onClick: () => navigate(`/systems/${s.id}`), children: [_jsx("td", { style: { fontWeight: 600 }, children: s.name }), _jsx("td", { children: _jsx(StatusPill, { status: s.status }) }), _jsx("td", { style: { color: "var(--blue)" }, children: "View \u2192" }), canManage && (_jsxs("td", { style: { display: "flex", gap: 6 }, children: [_jsx("button", { className: "header-btn", onClick: (e) => openEdit(s, e), children: "Edit" }), _jsx("button", { className: "header-btn", onClick: (e) => {
                                                e.stopPropagation();
                                                archiveSystem.mutate(s.id);
                                            }, children: "Archive" })] }))] }, s.id))) })] }), active.length > 0 && (_jsxs("div", { style: { marginTop: 18 }, children: [_jsx("div", { className: "section-header", children: _jsxs("div", { children: [_jsx("div", { className: "section-title", children: "Active Alarms" }), _jsxs("div", { className: "section-sub", children: [active.length, " alarm(s), ", unacked.length, " unacked"] })] }) }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Time" }), _jsx("th", { children: "Device" }), _jsx("th", { children: "Alarm" }), _jsx("th", { children: "Severity" }), _jsx("th", { children: "Acknowledged" })] }) }), _jsx("tbody", { children: active.map((a) => (_jsxs("tr", { children: [_jsx("td", { className: "mono", children: new Date(a.occurred_at).toLocaleString() }), _jsx("td", { children: a.device_label }), _jsx("td", { children: a.message }), _jsx("td", { children: _jsx(StatusPill, { status: a.severity }) }), _jsx("td", { children: a.ack_by ? (_jsx("span", { className: "ack-badge acked", children: "Acked" })) : (_jsx("span", { className: "ack-badge unacked", children: "Unacked" })) })] }, a.id))) })] })] })), editing && (_jsx(Modal, { title: editing === "new" ? "New System" : "Edit System", onClose: () => setEditing(null), children: _jsxs("form", { onSubmit: submit, children: [_jsxs("div", { className: "form-row", children: [_jsx("label", { children: "System / Site Name *" }), _jsx("input", { required: true, minLength: 2, maxLength: 120, value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), placeholder: "e.g. Main Hospital Campus", autoFocus: true })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Address" }), _jsx("input", { value: form.address, onChange: (e) => setForm({ ...form, address: e.target.value }), placeholder: "e.g. 100 Hospital Dr" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }, children: [_jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Latitude" }), _jsx("input", { type: "number", step: "any", min: -90, max: 90, value: form.lat, onChange: (e) => setForm({ ...form, lat: e.target.value }), placeholder: "e.g. 39.0997" })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Longitude" }), _jsx("input", { type: "number", step: "any", min: -180, max: 180, value: form.lng, onChange: (e) => setForm({ ...form, lng: e.target.value }), placeholder: "e.g. -94.5786" })] })] }), _jsxs("div", { className: "modal-actions", children: [_jsx("button", { type: "button", className: "header-btn", onClick: () => setEditing(null), children: "Cancel" }), _jsx("button", { type: "submit", className: "header-btn primary", children: "Save" })] })] }) }))] }));
}
