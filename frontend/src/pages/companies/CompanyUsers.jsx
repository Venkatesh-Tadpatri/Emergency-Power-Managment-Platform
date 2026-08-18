import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { Modal } from "../../components/common/Modal";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useSystems } from "../../queries/systems";
import { lookupUnassignedUser, useAssignRole, useAssignSystems, useUsers } from "../../queries/users";
const ROLES = ["company_admin", "system_operator", "system_viewer"];
export function CompanyUsers() {
    const { companyId } = useParams();
    const navigate = useNavigate();
    const auth = useAuth();
    const { data: company } = useCompany(companyId);
    const { data: users } = useUsers(companyId);
    const { data: me } = useMe(auth.isAuthenticated);
    const assignRole = useAssignRole();
    const assignSystems = useAssignSystems();
    const { data: systems } = useSystems(companyId);
    const [scopeTypeDraft, setScopeTypeDraft] = useState({});
    const [accessUser, setAccessUser] = useState(null);
    usePageHeader("Users", [{ label: company?.name || "", onClick: () => navigate(`/companies/${companyId}`) }]);
    const canManage = !!me?.permissions.manage_company_users;
    return (_jsxs(_Fragment, { children: [canManage && companyId && _jsx(AssignExistingUser, { companyId: companyId }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Name" }), _jsx("th", { children: "Email" }), _jsx("th", { children: "Role" }), _jsx("th", { children: "Scope" }), canManage && _jsx("th", { children: "Actions" })] }) }), _jsx("tbody", { children: (users || []).map((u) => (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 600 }, children: u.display_name || u.email }), _jsx("td", { className: "mono", children: u.email }), _jsx("td", { children: u.role || _jsx("span", { style: { color: "var(--text-dim)" }, children: "Unassigned" }) }), _jsx("td", { children: u.scope_type === "assigned" ? "Assigned systems only" : u.scope_type === "company_wide" ? "Company-wide" : "—" }), canManage && (_jsxs("td", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [_jsxs("select", { defaultValue: u.role || "", onChange: (e) => {
                                                const role = e.target.value;
                                                if (!role)
                                                    return;
                                                const scopeType = role === "system_operator" || role === "system_viewer"
                                                    ? scopeTypeDraft[u.id] || "company_wide"
                                                    : undefined;
                                                assignRole.mutate({ userId: u.id, role, scopeType, companyId });
                                            }, children: [_jsx("option", { value: "", children: "Select role..." }), ROLES.map((r) => (_jsx("option", { value: r, children: r }, r)))] }), (u.role === "system_operator" || u.role === "system_viewer") && (_jsxs(_Fragment, { children: [_jsxs("select", { defaultValue: u.scope_type || "company_wide", onChange: (e) => { const scopeType = e.target.value; setScopeTypeDraft((d) => ({ ...d, [u.id]: scopeType })); assignRole.mutate({ userId: u.id, role: u.role, scopeType, companyId }); }, children: [_jsx("option", { value: "company_wide", children: "Company-wide" }), _jsx("option", { value: "assigned", children: "Selected sites/equipment" })] }), u.scope_type === "assigned" && _jsx("button", { className: "header-btn", onClick: () => setAccessUser(u), children: "Manage access" })] }))] }))] }, u.id))) })] }), accessUser && _jsx(AccessPicker, { user: accessUser, systems: systems || [], saving: assignSystems.isPending, onClose: () => setAccessUser(null), onSave: (systemIds, siteIds) => assignSystems.mutate({ userId: accessUser.id, systemIds, siteIds }, { onSuccess: () => setAccessUser(null) }) })] }));
}

function AccessPicker({ user, systems, saving, onClose, onSave }) {
    const [systemIds, setSystemIds] = useState(user.assigned_system_ids || []);
    const [siteIds, setSiteIds] = useState(user.assigned_site_ids || []);
    const sites = systems.reduce((groups, system) => { (groups[system.site_id] ||= { name: system.site_name || "Site", systems: [] }).systems.push(system); return groups; }, {});
    const toggle = (ids, setIds, id) => setIds(ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
    return _jsx(Modal, { title: `Access for ${user.display_name || user.email}`, onClose: onClose, children: _jsxs("div", { className: "system-assignment-picker", children: [_jsx("p", { children: "Select complete sites, or only the individual equipment this operator may access." }), Object.entries(sites).map(([siteId, group]) => _jsxs("fieldset", { children: [_jsx("legend", { children: _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: siteIds.includes(siteId), onChange: () => toggle(siteIds, setSiteIds, siteId) }), " Entire site: ", group.name] }) }), group.systems.map((system) => _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: systemIds.includes(system.id), onChange: () => toggle(systemIds, setSystemIds, system.id) }), " ", system.name] }, system.id))] }, siteId)), _jsxs("div", { className: "modal-actions", children: [_jsx("button", { className: "header-btn", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "header-btn primary", disabled: saving, onClick: () => onSave(systemIds, siteIds), children: saving ? "Saving…" : "Save access" })] })] }) });
}
function AssignExistingUser({ companyId }) {
    const assignRole = useAssignRole();
    const [email, setEmail] = useState("");
    const [found, setFound] = useState(undefined);
    const [searching, setSearching] = useState(false);
    const [role, setRole] = useState("company_admin");
    const [scopeType, setScopeType] = useState("company_wide");
    const search = async (e) => {
        e.preventDefault();
        if (!email.trim())
            return;
        setSearching(true);
        try {
            const result = await lookupUnassignedUser(email.trim());
            setFound(result);
        }
        finally {
            setSearching(false);
        }
    };
    const assign = () => {
        if (!found)
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
    return (_jsxs("div", { className: "card", style: { marginTop: 0, marginBottom: 18 }, children: [_jsx("div", { className: "section-title", style: { marginBottom: 4 }, children: "Assign an existing account" }), _jsx("div", { className: "section-sub", style: { marginBottom: 12 }, children: "Have the person sign in at least once at the app's login page first \u2014 then look them up here by the exact email they signed up with to give them a role in this company." }), _jsxs("form", { onSubmit: search, style: { display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }, children: [_jsxs("div", { className: "form-row", style: { marginBottom: 0, minWidth: 240 }, children: [_jsx("label", { children: "Email" }), _jsx("input", { type: "email", required: true, value: email, onChange: (e) => {
                                    setEmail(e.target.value);
                                    setFound(undefined);
                                }, placeholder: "name@company.com" })] }), _jsx("button", { type: "submit", className: "header-btn", disabled: searching, children: searching ? "Searching…" : "Find" })] }), found === null && (_jsx("p", { style: { fontSize: 12, color: "var(--text-dim)", marginTop: 10 }, children: "No unassigned account found for that email. They need to sign in once first (and not already have a role elsewhere)." })), found && (_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontSize: 12.5, fontWeight: 600, marginRight: 4 }, children: found.display_name || found.email }), _jsxs("div", { className: "form-row", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Role" }), _jsx("select", { value: role, onChange: (e) => setRole(e.target.value), children: ROLES.map((r) => _jsx("option", { value: r, children: r }, r)) })] }), (role === "system_operator" || role === "system_viewer") && (_jsxs("div", { className: "form-row", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Scope" }), _jsxs("select", { value: scopeType, onChange: (e) => setScopeType(e.target.value), children: [_jsx("option", { value: "company_wide", children: "Company-wide" }), _jsx("option", { value: "assigned", children: "Assigned systems" })] })] })), _jsx("button", { className: "header-btn primary", onClick: assign, children: "Assign" })] }))] }));
}
