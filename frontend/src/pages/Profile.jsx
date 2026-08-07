import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAuth } from "react-oidc-context";
import { IconBuilding, IconResellers } from "../components/common/Icons";
import { usePageHeader } from "../components/layout/HeaderContext";
import { useCompany } from "../queries/companies";
import { useMe } from "../queries/me";
import { useReseller } from "../queries/resellers";
const ROLE_LABEL = {
    superadmin: "Super Admin",
    reseller_admin: "Reseller Admin",
    company_admin: "Company Admin",
    system_operator: "System Operator",
    system_viewer: "System Viewer",
};
const ROLE_DESCRIPTION = {
    superadmin: "Full platform access — manages every reseller, company, and system.",
    reseller_admin: "Manages companies and users under one reseller's portfolio.",
    company_admin: "Manages systems, devices, users, and on-call schedules for one company.",
    system_operator: "Can acknowledge alarms and operate assigned systems.",
    system_viewer: "Read-only access to assigned systems.",
};
export function Profile() {
    const auth = useAuth();
    const { data: me } = useMe(auth.isAuthenticated);
    const { data: reseller } = useReseller(me?.reseller_id || undefined);
    const { data: company } = useCompany(me?.company_id || undefined);
    usePageHeader("Profile");
    if (!me)
        return null;
    const initials = (me.email || "?").slice(0, 2).toUpperCase();
    return (_jsxs("div", { style: { maxWidth: 640 }, children: [_jsxs("div", { className: "card", style: { marginTop: 0, display: "flex", gap: 16, alignItems: "center" }, children: [_jsx("div", { className: "header-user-avatar", style: { width: 56, height: 56, fontSize: 18 }, children: initials }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 17, fontWeight: 700 }, children: me.display_name || me.email }), _jsx("div", { style: { fontSize: 12.5, color: "var(--text-dim)" }, children: me.email })] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "section-title", style: { marginBottom: 12 }, children: "Account" }), _jsx(ProfileRow, { label: "Email", value: me.email }), _jsx(ProfileRow, { label: "Role", value: (me.role && ROLE_LABEL[me.role]) || "Unassigned — ask an admin to assign one" }), me.role && _jsx(ProfileRow, { label: "What this role can do", value: ROLE_DESCRIPTION[me.role] }), me.scope_type && (_jsx(ProfileRow, { label: "System scope", value: me.scope_type === "assigned" ? "Assigned systems only" : "All company systems" })), _jsx(ProfileRow, { label: "Account status", value: me.is_active ? "Active" : "Deactivated" })] }), (reseller || company || me.role === "superadmin") && (_jsxs("div", { className: "card", children: [_jsx("div", { className: "section-title", style: { marginBottom: 12 }, children: "Organization" }), me.role === "superadmin" && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx(IconResellers, { size: 16 }), _jsx("span", { style: { fontSize: 13, fontWeight: 600 }, children: "Platform-wide \u2014 all resellers and companies" })] })), reseller && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: company ? 10 : 0 }, children: [_jsx(IconResellers, { size: 16 }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600 }, children: reseller.name }), _jsx("div", { style: { fontSize: 11, color: "var(--text-dim)" }, children: "Reseller" })] })] })), company && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx(IconBuilding, { size: 16 }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600 }, children: company.name }), _jsx("div", { style: { fontSize: 11, color: "var(--text-dim)" }, children: company.address || "Company" })] })] }))] })), _jsxs("div", { className: "card", children: [_jsx("div", { className: "section-title", style: { marginBottom: 8 }, children: "Password & security" }), _jsx("p", { style: { fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }, children: "Your login identity (email, password, MFA) is managed by Zitadel, not by EMPM directly. Use the account/profile settings on Zitadel's sign-in page to change your password." })] })] }));
}
function ProfileRow({ label, value }) {
    return (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }, children: [_jsx("span", { style: { color: "var(--text-dim)" }, children: label }), _jsx("span", { style: { fontWeight: 600, textAlign: "right" }, children: value })] }));
}
