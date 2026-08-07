import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useAuth } from "react-oidc-context";
import { Modal } from "../../components/common/Modal";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useResellers } from "../../queries/resellers";
import { useAllUsers, useAssignRole } from "../../queries/users";
const ROLES = [
    { value: "superadmin", label: "Superadmin", needs: "none" },
    { value: "reseller_admin", label: "Reseller Admin", needs: "reseller" },
    { value: "company_admin", label: "Company Admin", needs: "company" },
    { value: "system_operator", label: "System Operator", needs: "company+scope" },
    { value: "system_viewer", label: "System Viewer", needs: "company+scope" },
];
export function PlatformUsers() {
    const auth = useAuth();
    const { data: me } = useMe(auth.isAuthenticated);
    const canManage = me?.role === "superadmin";
    const { data: users } = useAllUsers(canManage);
    const { data: resellers } = useResellers();
    const { data: companies } = useCompanies();
    const assignRole = useAssignRole();
    const [editing, setEditing] = useState(null);
    const [role, setRole] = useState("");
    const [resellerId, setResellerId] = useState("");
    const [companyId, setCompanyId] = useState("");
    const [scopeType, setScopeType] = useState("company_wide");
    usePageHeader("Platform Users");
    if (!canManage) {
        return (_jsx("div", { className: "center-screen", style: { height: "auto", padding: 40 }, children: "Only superadmins can manage platform-wide user roles." }));
    }
    const roleLabel = (r) => ROLES.find((x) => x.value === r)?.label || "Unassigned";
    const resellerName = (id) => resellers?.find((r) => r.id === id)?.name;
    const companyName = (id) => companies?.find((c) => c.id === id)?.name;
    const openEdit = (u) => {
        setEditing(u);
        setRole(u.role || "");
        setResellerId(u.reseller_id || "");
        setCompanyId(u.company_id || "");
        setScopeType(u.scope_type || "company_wide");
    };
    const roleDef = ROLES.find((r) => r.value === role);
    const needsReseller = roleDef?.needs === "reseller";
    const needsCompany = roleDef?.needs === "company" || roleDef?.needs === "company+scope";
    const needsScope = roleDef?.needs === "company+scope";
    const submit = (e) => {
        e.preventDefault();
        if (!editing || !role)
            return;
        if (needsReseller && !resellerId)
            return;
        if (needsCompany && !companyId)
            return;
        assignRole.mutate({
            userId: editing.id,
            role,
            resellerId: needsReseller ? resellerId : null,
            companyId: needsCompany ? companyId : null,
            scopeType: needsScope ? scopeType : null,
        });
        setEditing(null);
    };
    return (_jsxs(_Fragment, { children: [_jsx("p", { style: { fontSize: 12, color: "var(--text-dim)", marginBottom: 16 }, children: "Every account here signed in at least once via Zitadel and was auto-provisioned with no role. Assign one to grant access \u2014 this is the only way to create a Reseller Admin." }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Name" }), _jsx("th", { children: "Email" }), _jsx("th", { children: "Role" }), _jsx("th", { children: "Scope" }), _jsx("th", {})] }) }), _jsx("tbody", { children: (users || []).map((u) => (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 600 }, children: u.display_name || u.email }), _jsx("td", { className: "mono", children: u.email }), _jsx("td", { children: u.role ? roleLabel(u.role) : _jsx("span", { style: { color: "var(--text-dim)" }, children: "Unassigned" }) }), _jsxs("td", { children: [u.reseller_id ? resellerName(u.reseller_id) : u.company_id ? companyName(u.company_id) : "—", u.scope_type === "assigned" && " (assigned systems)"] }), _jsx("td", { children: _jsx("button", { className: "header-btn", onClick: () => openEdit(u), children: "Edit Role" }) })] }, u.id))) })] }), editing && (_jsx(Modal, { title: `Assign role — ${editing.display_name || editing.email}`, onClose: () => setEditing(null), children: _jsxs("form", { onSubmit: submit, children: [_jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Role *" }), _jsxs("select", { required: true, value: role, onChange: (e) => setRole(e.target.value), children: [_jsx("option", { value: "", children: "Select role..." }), ROLES.map((r) => (_jsx("option", { value: r.value, children: r.label }, r.value)))] })] }), needsReseller && (_jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Reseller *" }), _jsxs("select", { required: true, value: resellerId, onChange: (e) => setResellerId(e.target.value), children: [_jsx("option", { value: "", children: "Select reseller..." }), (resellers || []).map((r) => (_jsx("option", { value: r.id, children: r.name }, r.id)))] })] })), needsCompany && (_jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Company *" }), _jsxs("select", { required: true, value: companyId, onChange: (e) => setCompanyId(e.target.value), children: [_jsx("option", { value: "", children: "Select company..." }), (companies || []).map((c) => (_jsx("option", { value: c.id, children: c.name }, c.id)))] })] })), needsScope && (_jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Scope" }), _jsxs("select", { value: scopeType, onChange: (e) => setScopeType(e.target.value), children: [_jsx("option", { value: "company_wide", children: "Company-wide (all systems)" }), _jsx("option", { value: "assigned", children: "Assigned systems only" })] })] })), _jsxs("div", { className: "modal-actions", children: [_jsx("button", { type: "button", className: "header-btn", onClick: () => setEditing(null), children: "Cancel" }), _jsx("button", { type: "submit", className: "header-btn primary", children: "Save" })] })] }) }))] }));
}
