import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { InfoCard } from "../../components/common/StatCard";
import { IconResellers } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useArchiveReseller, useCreateReseller, useResellers, useUpdateReseller, } from "../../queries/resellers";
import { useSites, useSystems } from "../../queries/systems";
export function ResellersList() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const auth = useAuth();
    const { data: me } = useMe(auth.isAuthenticated);
    const { data: resellers } = useResellers();
    const { data: companies } = useCompanies();
    const { data: systems } = useSystems();
    const { data: sites } = useSites();
    const createReseller = useCreateReseller();
    const updateReseller = useUpdateReseller();
    const archiveReseller = useArchiveReseller();
    const [editing, setEditing] = useState(null);
    const emptyForm = { name: "", contact_name: "", contact_email: "", contact_phone: "" };
    const [form, setForm] = useState(emptyForm);
    usePageHeader("Resellers");
    const canManage = !!me?.permissions.manage_resellers;
    const searchTerm = (searchParams.get("search") || "").trim().toLowerCase();
    const openNew = () => {
        setForm(emptyForm);
        setEditing("new");
    };
    const openEdit = (r, e) => {
        e.stopPropagation();
        setForm({
            name: r.name,
            contact_name: r.contact_name || "",
            contact_email: r.contact_email || "",
            contact_phone: r.contact_phone || "",
        });
        setEditing(r);
    };
    const submit = (e) => {
        e.preventDefault();
        if (!form.name.trim())
            return;
        const data = {
            name: form.name,
            contact_name: form.contact_name || undefined,
            contact_email: form.contact_email || undefined,
            contact_phone: form.contact_phone || undefined,
        };
        if (editing === "new") {
            createReseller.mutate(data);
        }
        else if (editing) {
            updateReseller.mutate({ id: editing.id, data });
        }
        setEditing(null);
    };
    return (_jsxs(_Fragment, { children: [canManage && (_jsxs("div", { className: "section-header", children: [_jsx("div", {}), _jsx("button", { className: "header-btn primary", onClick: openNew, children: "+ New Reseller" })] })), _jsx("div", { className: "card-grid", children: (resellers || []).filter((r) => !searchTerm || r.name.toLowerCase().includes(searchTerm)).map((r) => {
                    const rCompanies = (companies || []).filter((c) => c.reseller_id === r.id);
                    const rSystems = (systems || []).filter((s) => rCompanies.some((c) => c.id === s.company_id));
                    const rSites = (sites || []).filter((site) => site.status !== "archived" && rCompanies.some((c) => c.id === site.customer_id));
                    const rNormal = rSystems.filter((s) => s.status === "normal").length;
                    return (_jsxs("div", { className: "reseller-card-shell", children: [_jsx(InfoCard, { title: r.name, status: r.status, icon: IconResellers, stats: [
                                    { label: "Customers", value: rCompanies.length, color: "var(--blue)" },
                                    { label: "Sites", value: rSites.length, color: "var(--cyan)" },
                                    { label: "Normal", value: rNormal, color: "var(--green)" },
                                    { label: "Events", value: rSystems.length - rNormal, color: "var(--red)" },
                                ], onClick: () => navigate(`/resellers/${r.id}`) }), canManage && (_jsxs("div", { className: "reseller-card-actions", children: [_jsx("button", { className: "header-btn", onClick: (e) => openEdit(r, e), children: "Edit" }), r.status !== "archived" && (_jsx("button", { className: "header-btn", onClick: (e) => {
                                            e.stopPropagation();
                                            archiveReseller.mutate(r.id);
                                        }, children: "Archive" }))] }))] }, r.id));
                }) }), editing && (_jsx(Modal, { title: editing === "new" ? "New Reseller" : "Edit Reseller", onClose: () => setEditing(null), children: _jsxs("form", { onSubmit: submit, children: [_jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Company Name *" }), _jsx("input", { required: true, minLength: 2, maxLength: 120, value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), placeholder: "e.g. Coastal Power Partners", autoFocus: true })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Primary Contact Name" }), _jsx("input", { value: form.contact_name, onChange: (e) => setForm({ ...form, contact_name: e.target.value }), placeholder: "e.g. Jordan Lee" })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Contact Email" }), _jsx("input", { type: "email", value: form.contact_email, onChange: (e) => setForm({ ...form, contact_email: e.target.value }), placeholder: "name@company.com" })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Contact Phone" }), _jsx("input", { type: "tel", pattern: "^[0-9+\\-()\\s]{7,20}$", title: "Enter a valid phone number", value: form.contact_phone, onChange: (e) => setForm({ ...form, contact_phone: e.target.value }), placeholder: "e.g. +1 555 010 1234" })] }), _jsxs("div", { className: "modal-actions", children: [_jsx("button", { type: "button", className: "header-btn", onClick: () => setEditing(null), children: "Cancel" }), _jsx("button", { type: "submit", className: "header-btn primary", children: "Save" })] })] }) }))] }));
}
