import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { lookupUnassignedUser, useAssignRole, useUsersByReseller } from "../../queries/users";
const ROLES = ["company_admin", "system_operator", "system_viewer"];
export function ResellerUsers() {
    const { resellerId } = useParams();
    const navigate = useNavigate();
    const auth = useAuth();
    const { data: me } = useMe(auth.isAuthenticated);
    const { data: reseller } = useReseller(resellerId);
    const { data: companies } = useCompanies(resellerId);
    const { data: users } = useUsersByReseller(resellerId);
    usePageHeader("Users", [
        { label: "Resellers", onClick: () => navigate("/resellers") },
        { label: reseller?.name || "", onClick: () => navigate(`/resellers/${resellerId}`) },
    ]);
    const canManage = me?.role === "superadmin" || (me?.role === "reseller_admin" && me.reseller_id === resellerId);
    if (!resellerId)
        return null;
    const companyName = (id) => companies?.find((c) => c.id === id)?.name;
    return (_jsxs(_Fragment, { children: [canManage && (_jsx(AssignExistingUser, { resellerId: resellerId, companies: companies || [] })), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Name" }), _jsx("th", { children: "Email" }), _jsx("th", { children: "Role" }), _jsx("th", { children: "Company" }), _jsx("th", { children: "Scope" }), canManage && _jsx("th", {})] }) }), _jsxs("tbody", { children: [(users || []).map((u) => (_jsx(UserRow, { user: u, companies: companies || [], companyName: companyName, canManage: canManage }, u.id))), (users || []).length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: canManage ? 6 : 5, style: { color: "var(--text-dim)", textAlign: "center", padding: "20px 0" }, children: "No users assigned under this reseller yet." }) }))] })] })] }));
}
function UserRow({ user, companies, companyName, canManage, }) {
    const assignRole = useAssignRole();
    const [editing, setEditing] = useState(false);
    const [role, setRole] = useState(user.role && ROLES.includes(user.role) ? user.role : "company_admin");
    const [companyId, setCompanyId] = useState(user.company_id || companies[0]?.id || "");
    const [scopeType, setScopeType] = useState(user.scope_type || "company_wide");
    const save = () => {
        if (!companyId)
            return;
        assignRole.mutate({
            userId: user.id,
            role,
            scopeType: role === "system_operator" || role === "system_viewer" ? scopeType : undefined,
            companyId,
        });
        setEditing(false);
    };
    if (editing) {
        return (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 600 }, children: user.display_name || user.email }), _jsx("td", { className: "mono", children: user.email }), _jsx("td", { children: _jsx("select", { value: role, onChange: (e) => setRole(e.target.value), children: ROLES.map((r) => _jsx("option", { value: r, children: r }, r)) }) }), _jsx("td", { children: _jsxs("select", { value: companyId, onChange: (e) => setCompanyId(e.target.value), children: [_jsx("option", { value: "", children: "Select company..." }), companies.map((c) => _jsx("option", { value: c.id, children: c.name }, c.id))] }) }), _jsx("td", { children: (role === "system_operator" || role === "system_viewer") ? (_jsxs("select", { value: scopeType, onChange: (e) => setScopeType(e.target.value), children: [_jsx("option", { value: "company_wide", children: "Company-wide" }), _jsx("option", { value: "assigned", children: "Assigned systems" })] })) : "—" }), _jsxs("td", { style: { display: "flex", gap: 6 }, children: [_jsx("button", { className: "header-btn primary", onClick: save, disabled: !companyId, children: "Save" }), _jsx("button", { className: "header-btn", onClick: () => setEditing(false), children: "Cancel" })] })] }));
    }
    return (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 600 }, children: user.display_name || user.email }), _jsx("td", { className: "mono", children: user.email }), _jsx("td", { children: user.role || _jsx("span", { style: { color: "var(--text-dim)" }, children: "Unassigned" }) }), _jsx("td", { children: companyName(user.company_id) || "—" }), _jsx("td", { children: user.scope_type === "assigned" ? "Assigned systems only" : user.scope_type === "company_wide" ? "Company-wide" : "—" }), canManage && (_jsx("td", { children: _jsx("button", { className: "header-btn", onClick: () => setEditing(true), children: "Edit" }) }))] }));
}
function AssignExistingUser({ resellerId, companies }) {
    const assignRole = useAssignRole();
    const [email, setEmail] = useState("");
    const [found, setFound] = useState(undefined);
    const [searching, setSearching] = useState(false);
    const [role, setRole] = useState("company_admin");
    const [companyId, setCompanyId] = useState("");
    const [scopeType, setScopeType] = useState("company_wide");
    const search = async (e) => {
        e.preventDefault();
        if (!email.trim())
            return;
        setSearching(true);
        try {
            const result = await lookupUnassignedUser(email.trim());
            setFound(result);
            setCompanyId(companies[0]?.id || "");
        }
        finally {
            setSearching(false);
        }
    };
    const assign = () => {
        if (!found || !companyId)
            return;
        assignRole.mutate({
            userId: found.id,
            role,
            scopeType: role === "system_operator" || role === "system_viewer" ? scopeType : undefined,
            companyId,
        });
        setFound(undefined);
        setEmail("");
    };
    return (_jsxs("div", { className: "card", style: { marginTop: 0, marginBottom: 18 }, children: [_jsx("div", { className: "section-title", style: { marginBottom: 4 }, children: "Assign an existing account" }), _jsx("div", { className: "section-sub", style: { marginBottom: 12 }, children: "Have the person sign in at least once at the app's login page first \u2014 then look them up here by the exact email they signed up with to make them a Company Admin (or Operator/Viewer) for one of your companies." }), _jsxs("form", { onSubmit: search, style: { display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }, children: [_jsxs("div", { className: "form-row", style: { marginBottom: 0, minWidth: 240 }, children: [_jsx("label", { children: "Email" }), _jsx("input", { type: "email", required: true, value: email, onChange: (e) => {
                                    setEmail(e.target.value);
                                    setFound(undefined);
                                }, placeholder: "name@company.com" })] }), _jsx("button", { type: "submit", className: "header-btn", disabled: searching, children: searching ? "Searching…" : "Find" })] }), found === null && (_jsx("p", { style: { fontSize: 12, color: "var(--text-dim)", marginTop: 10 }, children: "No unassigned account found for that email. They need to sign in once first (and not already have a role elsewhere)." })), found && (_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontSize: 12.5, fontWeight: 600, marginRight: 4 }, children: found.display_name || found.email }), _jsxs("div", { className: "form-row", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Role" }), _jsx("select", { value: role, onChange: (e) => setRole(e.target.value), children: ROLES.map((r) => _jsx("option", { value: r, children: r }, r)) })] }), _jsxs("div", { className: "form-row", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Company" }), _jsxs("select", { value: companyId, onChange: (e) => setCompanyId(e.target.value), children: [_jsx("option", { value: "", children: "Select company..." }), companies.map((c) => _jsx("option", { value: c.id, children: c.name }, c.id))] })] }), (role === "system_operator" || role === "system_viewer") && (_jsxs("div", { className: "form-row", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Scope" }), _jsxs("select", { value: scopeType, onChange: (e) => setScopeType(e.target.value), children: [_jsx("option", { value: "company_wide", children: "Company-wide" }), _jsx("option", { value: "assigned", children: "Assigned systems" })] })] })), _jsx("button", { className: "header-btn primary", onClick: assign, disabled: !companyId, children: "Assign" })] }))] }));
}
