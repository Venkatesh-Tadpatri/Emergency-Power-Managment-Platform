import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { Modal } from "../../components/common/Modal";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useAlarms } from "../../queries/alarms";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useCreateOnCallShift, useDeleteOnCallShift, useOnCallShifts, useUpdateOnCallShift, } from "../../queries/oncall";
const SHIFT_LABELS = ["24h", "Day (8a-8p)", "Night (8p-8a)"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const emptyForm = { shift_date: "", day_label: "", primary_name: "", secondary_name: "", shift_label: "24h" };
export function CompanyOnCall() {
    const { companyId } = useParams();
    const navigate = useNavigate();
    const auth = useAuth();
    const { data: me } = useMe(auth.isAuthenticated);
    const { data: company } = useCompany(companyId);
    const { data: shifts } = useOnCallShifts(companyId);
    const { data: alarms } = useAlarms({ companyId });
    const createShift = useCreateOnCallShift();
    const updateShift = useUpdateOnCallShift();
    const deleteShift = useDeleteOnCallShift();
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    usePageHeader("Alert Management", [
        { label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) },
    ]);
    const canManage = !!me?.permissions.manage_oncall;
    const todayIso = new Date().toISOString().slice(0, 10);
    const today = (shifts || []).find((s) => s.shift_date === todayIso) || (shifts || [])[0];
    const active = (alarms || []).filter((a) => a.status === "active");
    const activeUnacked = active.filter((a) => !a.ack_by);
    const dayLabelFor = (isoDate) => {
        if (!isoDate)
            return "";
        const d = new Date(`${isoDate}T00:00:00`);
        return Number.isNaN(d.getTime()) ? "" : DAY_NAMES[d.getDay()];
    };
    const openNew = () => {
        setForm(emptyForm);
        setEditing("new");
    };
    const openEdit = (s) => {
        setForm({
            shift_date: s.shift_date,
            day_label: s.day_label,
            primary_name: s.primary_name,
            secondary_name: s.secondary_name || "",
            shift_label: s.shift_label,
        });
        setEditing(s);
    };
    const submit = (e) => {
        e.preventDefault();
        if (!form.shift_date || !form.primary_name.trim() || !companyId)
            return;
        const data = {
            shift_date: form.shift_date,
            day_label: form.day_label || dayLabelFor(form.shift_date),
            primary_name: form.primary_name,
            secondary_name: form.secondary_name || undefined,
            shift_label: form.shift_label,
        };
        if (editing === "new") {
            createShift.mutate({ ...data, company_id: companyId });
        }
        else if (editing) {
            updateShift.mutate({ id: editing.id, data });
        }
        setEditing(null);
    };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "oncall-banner", children: [_jsxs("div", { children: [_jsx("div", { className: "oncall-banner-label", children: "On-Call Now" }), _jsxs("div", { className: "oncall-banner-primary", children: [_jsx("span", { className: "oncall-dot green" }), today?.primary_name || "Not configured", _jsx("span", { className: "oncall-role", children: "Primary" })] }), _jsxs("div", { className: "oncall-banner-secondary", children: [_jsx("span", { className: "oncall-dot amber" }), today?.secondary_name || "—", _jsx("span", { className: "oncall-role", children: "Secondary" })] })] }), _jsxs("div", { className: "oncall-banner-right", children: [_jsxs("div", { className: "oncall-stat", children: [_jsx("span", { className: "oncall-stat-val", children: activeUnacked.length }), _jsx("span", { className: "oncall-stat-label", children: "Unacked Alarms" })] }), _jsxs("div", { className: "oncall-stat", children: [_jsx("span", { className: "oncall-stat-val", children: active.length }), _jsx("span", { className: "oncall-stat-label", children: "Active Alarms" })] })] })] }), _jsxs("div", { className: "section-header", children: [_jsxs("div", { children: [_jsx("div", { className: "section-title", children: "Weekly Schedule" }), _jsx("div", { className: "section-sub", children: "On-call rotation for the current week" })] }), canManage && (_jsx("button", { className: "header-btn primary", onClick: openNew, children: "+ Add Shift" }))] }), _jsxs("table", { className: "data-table oncall-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Day" }), _jsx("th", { children: "Date" }), _jsx("th", { children: "Primary" }), _jsx("th", { children: "Secondary" }), _jsx("th", { children: "Shift" }), canManage && _jsx("th", {})] }) }), _jsx("tbody", { children: (shifts || []).map((s) => (_jsxs("tr", { className: s.shift_date === todayIso ? "oncall-today" : "", children: [_jsx("td", { style: { fontWeight: 600 }, children: s.day_label }), _jsx("td", { className: "mono", children: s.shift_date }), _jsxs("td", { children: [_jsx("span", { className: "oncall-dot green" }), " ", s.primary_name] }), _jsxs("td", { children: [_jsx("span", { className: "oncall-dot amber" }), " ", s.secondary_name] }), _jsx("td", { className: "mono", children: s.shift_label }), canManage && (_jsxs("td", { style: { display: "flex", gap: 6 }, children: [_jsx("button", { className: "header-btn", onClick: () => openEdit(s), children: "Edit" }), _jsx("button", { className: "header-btn", onClick: () => deleteShift.mutate(s.id), children: "Delete" })] }))] }, s.id))) })] }), activeUnacked.length > 0 && (_jsxs("div", { style: { marginTop: 18 }, children: [_jsx("div", { className: "section-header", children: _jsxs("div", { children: [_jsx("div", { className: "section-title", children: "Pending Acknowledgement" }), _jsxs("div", { className: "section-sub", children: [activeUnacked.length, " alarm(s) awaiting response"] })] }) }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Time" }), _jsx("th", { children: "Device" }), _jsx("th", { children: "Alarm" })] }) }), _jsx("tbody", { children: activeUnacked.map((a) => (_jsxs("tr", { children: [_jsx("td", { className: "mono", children: new Date(a.occurred_at).toLocaleString() }), _jsx("td", { children: a.device_label }), _jsx("td", { children: a.message })] }, a.id))) })] })] })), editing && (_jsx(Modal, { title: editing === "new" ? "Add On-Call Shift" : "Edit On-Call Shift", onClose: () => setEditing(null), children: _jsxs("form", { onSubmit: submit, children: [_jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Date *" }), _jsx("input", { type: "date", required: true, value: form.shift_date, onChange: (e) => setForm({ ...form, shift_date: e.target.value, day_label: form.day_label || dayLabelFor(e.target.value) }), autoFocus: true })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Day Label" }), _jsx("input", { value: form.day_label, onChange: (e) => setForm({ ...form, day_label: e.target.value }), placeholder: dayLabelFor(form.shift_date) || "e.g. Monday" })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Primary On-Call *" }), _jsx("input", { required: true, minLength: 2, maxLength: 80, value: form.primary_name, onChange: (e) => setForm({ ...form, primary_name: e.target.value }), placeholder: "e.g. Sam Rivera" })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Secondary On-Call" }), _jsx("input", { maxLength: 80, value: form.secondary_name, onChange: (e) => setForm({ ...form, secondary_name: e.target.value }), placeholder: "e.g. Alex Chen" })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Shift *" }), _jsx("select", { required: true, value: form.shift_label, onChange: (e) => setForm({ ...form, shift_label: e.target.value }), children: SHIFT_LABELS.map((s) => _jsx("option", { value: s, children: s }, s)) })] }), _jsxs("div", { className: "modal-actions", children: [_jsx("button", { type: "button", className: "header-btn", onClick: () => setEditing(null), children: "Cancel" }), _jsx("button", { type: "submit", className: "header-btn primary", children: "Save" })] })] }) }))] }));
}
