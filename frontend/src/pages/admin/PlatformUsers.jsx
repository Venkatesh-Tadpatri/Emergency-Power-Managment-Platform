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
  { value: "company_admin", label: "Customer Admin", needs: "company" },
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
  const [roleFilter, setRoleFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");

  usePageHeader("Platform Users");

  if (!canManage) {
    return <div className="center-screen" style={{ height: "auto", padding: 40 }}>Only superadmins can manage platform-wide user roles.</div>;
  }

  const roleLabel = (value) => ROLES.find((item) => item.value === value)?.label || "Unassigned";
  const resellerName = (id) => resellers?.find((item) => item.id === id)?.name;
  const companyName = (id) => companies?.find((item) => item.id === id)?.name;
  const filteredUsers = (users || []).filter((user) => {
    const matchesRole = roleFilter === "all" || user.role === roleFilter || (roleFilter === "unassigned" && !user.role);
    return matchesRole && (companyFilter === "all" || user.company_id === companyFilter);
  });

  const openEdit = (user) => {
    setEditing(user);
    setRole(user.role || "");
    setResellerId(user.reseller_id || "");
    setCompanyId(user.company_id || "");
    setScopeType(user.scope_type || "company_wide");
  };

  const roleDef = ROLES.find((item) => item.value === role);
  const needsReseller = roleDef?.needs === "reseller";
  const needsCompany = roleDef?.needs === "company" || roleDef?.needs === "company+scope";
  const needsScope = roleDef?.needs === "company+scope";

  const submit = (event) => {
    event.preventDefault();
    if (!editing || !role || (needsReseller && !resellerId) || (needsCompany && !companyId)) return;
    assignRole.mutate({
      userId: editing.id,
      role,
      resellerId: needsReseller ? resellerId : null,
      companyId: needsCompany ? companyId : null,
      scopeType: needsScope ? scopeType : null,
    });
    setEditing(null);
  };

  return <>
    <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 16 }}>
      Every account here signed in at least once via Zitadel and was auto-provisioned with no role. Assign one to grant access — this is the only way to create a Reseller Admin.
    </p>

    <div className="directory-filters">
      <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter users by role">
        <option value="all">All roles</option>
        <option value="unassigned">Unassigned</option>
        {ROLES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
      </select>
      <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} aria-label="Filter users by customer">
        <option value="all">All companies</option>
        {(companies || []).map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
      </select>
      {(roleFilter !== "all" || companyFilter !== "all") && <button className="header-btn" onClick={() => { setRoleFilter("all"); setCompanyFilter("all"); }}>Clear filters</button>}
    </div>
    <div className="directory-filter-count">{filteredUsers.length} of {(users || []).length} users</div>

    <table className="data-table">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Customer</th><th /></tr></thead>
      <tbody>{filteredUsers.map((user) => <tr key={user.id}>
        <td style={{ fontWeight: 600 }}>{user.display_name || user.email}</td>
        <td className="mono">{user.email}</td>
        <td>{user.role ? roleLabel(user.role) : <span style={{ color: "var(--text-dim)" }}>Unassigned</span>}</td>
        <td>{user.reseller_id ? resellerName(user.reseller_id) : user.company_id ? companyName(user.company_id) : "—"}{user.scope_type === "assigned" && " (assigned systems)"}</td>
        <td><button className="header-btn" onClick={() => openEdit(user)}>Edit Role</button></td>
      </tr>)}</tbody>
    </table>

    {editing && <Modal title={`Assign role — ${editing.display_name || editing.email}`} onClose={() => setEditing(null)}>
      <form onSubmit={submit}>
        <div className="form-row"><label>Role *</label><select required value={role} onChange={(event) => setRole(event.target.value)}><option value="">Select role...</option>{ROLES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></div>
        {needsReseller && <div className="form-row"><label>Reseller *</label><select required value={resellerId} onChange={(event) => setResellerId(event.target.value)}><option value="">Select reseller...</option>{(resellers || []).map((reseller) => <option value={reseller.id} key={reseller.id}>{reseller.name}</option>)}</select></div>}
        {needsCompany && <div className="form-row"><label>Customer *</label><select required value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">Select customer...</option>{(companies || []).map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</select></div>}
        {needsScope && <div className="form-row"><label>Scope</label><select value={scopeType} onChange={(event) => setScopeType(event.target.value)}><option value="company_wide">Customer-wide (all systems)</option><option value="assigned">Assigned systems only</option></select></div>}
        <div className="modal-actions"><button type="button" className="header-btn" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="header-btn primary">Save</button></div>
      </form>
    </Modal>}
  </>;
}
