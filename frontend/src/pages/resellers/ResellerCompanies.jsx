import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { InfoCard } from "../../components/common/StatCard";
import { IconBuilding, IconSearch } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useArchiveCompany, useCompanies, useCreateCompany, useUpdateCompany, } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { useSystems } from "../../queries/systems";
export function ResellerCompanies() {
    const { resellerId } = useParams();
    const navigate = useNavigate();
    const auth = useAuth();
    const { data: me } = useMe(auth.isAuthenticated);
    const { data: reseller } = useReseller(resellerId);
    const { data: companies } = useCompanies(resellerId);
    const { data: systems } = useSystems();
    const createCompany = useCreateCompany();
    const updateCompany = useUpdateCompany();
    const archiveCompany = useArchiveCompany();
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: "", address: "", lat: "", lng: "" });
    const [search, setSearch] = useState("");
    usePageHeader("Customers", [
        { label: "Resellers", onClick: () => navigate("/resellers") },
        { label: reseller?.name || "", onClick: () => navigate(`/resellers/${resellerId}`) },
    ]);
    const canManage = !!me?.permissions.create_company;
    const openNew = () => {
        setForm({ name: "", address: "", lat: "", lng: "" });
        setEditing("new");
    };
    const openEdit = (c, e) => {
        e.stopPropagation();
        setForm({ name: c.name, address: c.address || "", lat: c.lat?.toString() || "", lng: c.lng?.toString() || "" });
        setEditing(c);
    };
    const submit = (e) => {
        e.preventDefault();
        if (!form.name.trim() || !resellerId)
            return;
        const data = {
            name: form.name,
            address: form.address,
            lat: form.lat ? Number(form.lat) : undefined,
            lng: form.lng ? Number(form.lng) : undefined,
        };
        if (editing === "new") {
            createCompany.mutate({ ...data, reseller_id: resellerId });
        }
        else if (editing) {
            updateCompany.mutate({ id: editing.id, data });
        }
        setEditing(null);
    };
    const filteredCompanies = (companies || []).filter((company) => company.name.toLowerCase().includes(search.trim().toLowerCase()));
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "reseller-customers-toolbar", children: [_jsxs("label", { className: "reseller-customers-search", children: [_jsx(IconSearch, { size: 15 }), _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Search customers...", "aria-label": "Search customers" })] }), canManage && (_jsx("button", { className: "header-btn primary", onClick: openNew, children: "+ New Customer" }))] }), _jsxs("div", { className: "card-grid reseller-customers-grid", children: [filteredCompanies.map((c) => {
                    const cSystems = (systems || []).filter((s) => s.company_id === c.id);
                    const cNormal = cSystems.filter((s) => s.status === "normal").length;
                    return (_jsxs("div", { className: "reseller-company-card-shell", children: [_jsx(InfoCard, { title: c.name, status: c.status, subtitle: c.address, icon: IconBuilding, stats: [
                                    { label: "Systems", value: cSystems.length, color: "var(--cyan)" },
                                    { label: "Normal", value: cNormal, color: "var(--green)" },
                                    { label: "Events", value: cSystems.length - cNormal, color: "var(--red)" },
                                ], onClick: () => navigate(`/companies/${c.id}`) }), canManage && (_jsxs("div", { style: { position: "absolute", top: 10, right: 10, display: "flex", gap: 4 }, children: [_jsx("button", { className: "header-btn", onClick: (e) => openEdit(c, e), children: "Edit" }), c.status !== "archived" && (_jsx("button", { className: "header-btn", onClick: (e) => {
                                            e.stopPropagation();
                                            archiveCompany.mutate(c.id);
                                        }, children: "Archive" }))] }))] }, c.id));
                }), filteredCompanies.length === 0 && (_jsx("div", { className: "reseller-customers-empty", children: "No customers match your search." }))] }), editing && (_jsx(Modal, { title: editing === "new" ? "New Customer" : "Edit Customer", onClose: () => setEditing(null), children: _jsxs("form", { onSubmit: submit, children: [_jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Customer Name *" }), _jsx("input", { required: true, minLength: 2, maxLength: 120, value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), placeholder: "e.g. Riverside Medical Center", autoFocus: true })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Address / City" }), _jsx("input", { value: form.address, onChange: (e) => setForm({ ...form, address: e.target.value }), placeholder: "e.g. 200 Main St, Springfield" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }, children: [_jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Latitude" }), _jsx("input", { type: "number", step: "any", min: -90, max: 90, value: form.lat, onChange: (e) => setForm({ ...form, lat: e.target.value }), placeholder: "e.g. 17.4239" })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Longitude" }), _jsx("input", { type: "number", step: "any", min: -180, max: 180, value: form.lng, onChange: (e) => setForm({ ...form, lat: e.target.value }), placeholder: "e.g. 78.4738" })] })] }), _jsxs("div", { className: "modal-actions", children: [_jsx("button", { type: "button", className: "header-btn", onClick: () => setEditing(null), children: "Cancel" }), _jsx("button", { type: "submit", className: "header-btn primary", children: "Save" })] })] }) }))] }));
}
