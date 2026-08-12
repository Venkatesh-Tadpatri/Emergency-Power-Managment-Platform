import { useAuth } from "react-oidc-context";

import { IconBuilding, IconResellers } from "../components/common/Icons";
import { usePageHeader } from "../components/layout/HeaderContext";
import { useCompany } from "../queries/companies";
import { useMe } from "../queries/me";
import { useReseller } from "../queries/resellers";

const ROLE_LABEL = { superadmin: "Super Admin", reseller_admin: "Reseller Admin", company_admin: "Customer Admin", system_operator: "System Operator", system_viewer: "System Viewer" };
const ROLE_DESCRIPTION = { superadmin: "Full platform access — manages every reseller, company, and system.", reseller_admin: "Manages companies and users under one reseller's portfolio.", company_admin: "Manages systems, devices, users, and on-call schedules for one company.", system_operator: "Can acknowledge alarms and operate assigned systems.", system_viewer: "Read-only access to assigned systems." };

export function Profile() {
  const auth = useAuth();
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: reseller } = useReseller(me?.reseller_id || undefined);
  const { data: company } = useCompany(me?.company_id || undefined);
  usePageHeader("Profile");
  if (!me) return null;

  const initials = (me.email || "?").slice(0, 2).toUpperCase();
  return <div style={{ maxWidth: 640 }}>
    <div className="card" style={{ marginTop: 0, display: "flex", gap: 16, alignItems: "center" }}><div className="header-user-avatar" style={{ width: 56, height: 56, fontSize: 18 }}>{initials}</div><div><div style={{ fontSize: 17, fontWeight: 700 }}>{me.display_name || me.email}</div><div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{me.email}</div></div></div>
    <div className="card"><div className="section-title" style={{ marginBottom: 12 }}>Account</div><ProfileRow label="Email" value={me.email} /><ProfileRow label="Role" value={me.role ? ROLE_LABEL[me.role] : "Unassigned — ask an admin to assign one"} />{me.role && <ProfileRow label="What this role can do" value={ROLE_DESCRIPTION[me.role]} />}{me.scope_type && <ProfileRow label="System scope" value={me.scope_type === "assigned" ? "Assigned systems only" : "All company systems"} />}<ProfileRow label="Account status" value={me.is_active ? "Active" : "Deactivated"} /></div>
    {(reseller || company || me.role === "superadmin") && <div className="card"><div className="section-title" style={{ marginBottom: 12 }}>Organization</div>{me.role === "superadmin" && <div style={{ display: "flex", alignItems: "center", gap: 10 }}><IconResellers size={16} /><span style={{ fontSize: 13, fontWeight: 600 }}>Platform-wide — all resellers and companies</span></div>}{reseller && <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: company ? 10 : 0 }}><IconResellers size={16} /><div><div style={{ fontSize: 13, fontWeight: 600 }}>{reseller.name}</div><div style={{ fontSize: 11, color: "var(--text-dim)" }}>Reseller</div></div></div>}{company && <div style={{ display: "flex", alignItems: "center", gap: 10 }}><IconBuilding size={16} /><div><div style={{ fontSize: 13, fontWeight: 600 }}>{company.name}</div><div style={{ fontSize: 11, color: "var(--text-dim)" }}>{company.address || "Company"}</div></div></div>}</div>}
    <div className="card"><div className="section-title" style={{ marginBottom: 8 }}>Password & security</div><p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>Your login identity (email, password, MFA) is managed by Zitadel, not by CPC directly. Use the account/profile settings on Zitadel's sign-in page to change your password.</p></div>
  </div>;
}

function ProfileRow({ label, value }) { return <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}><span style={{ color: "var(--text-dim)" }}>{label}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span></div>; }
