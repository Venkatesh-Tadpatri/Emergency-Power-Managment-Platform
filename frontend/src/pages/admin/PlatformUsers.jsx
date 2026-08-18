import { useState } from "react";
import { useAuth } from "react-oidc-context";

import { Modal } from "../../components/common/Modal";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useResellers } from "../../queries/resellers";
import { useAllUsers, useAssignRole, useAssignSystems } from "../../queries/users";
import { useSystems } from "../../queries/systems";

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
  const assignSystems = useAssignSystems();
  const [editing, setEditing] = useState(null);
  const [role, setRole] = useState("");
  const [resellerId, setResellerId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [scopeType, setScopeType] = useState("company_wide");
  const [assignedSystemIds, setAssignedSystemIds] = useState([]);
  const [assignedSiteIds, setAssignedSiteIds] = useState([]);
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
    setAssignedSystemIds(user.assigned_system_ids || []);
    setAssignedSiteIds(user.assigned_site_ids || []);
  };

  const roleDef = ROLES.find((item) => item.value === role);
  const needsReseller = roleDef?.needs === "reseller";
  const needsCompany = roleDef?.needs === "company" || roleDef?.needs === "company+scope";
  const needsScope = roleDef?.needs === "company+scope";
  const { data: companySystems } = useSystems(needsCompany ? companyId : undefined);

  const submit = (event) => {
    event.preventDefault();
    if (!editing || !role || (needsReseller && !resellerId) || (needsCompany && !companyId)) return;
    assignRole.mutate({
      userId: editing.id,
      role,
      resellerId: needsReseller ? resellerId : null,
      companyId: needsCompany ? companyId : null,
      scopeType: needsScope ? scopeType : null,
    }, { onSuccess: (updatedUser) => {
      if (needsScope && scopeType === "assigned") {
        assignSystems.mutate({ userId: updatedUser.id, systemIds: assignedSystemIds, siteIds: assignedSiteIds });
      }
      setEditing(null);
    }});
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

    {editing && <Modal title={`Assign role — ${editing.display_name || editing.email}`} className="user-access-modal" onClose={() => setEditing(null)}>
      <form onSubmit={submit}>
        <div className="form-row"><label>Role *</label><select required value={role} onChange={(event) => setRole(event.target.value)}><option value="">Select role...</option>{ROLES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></div>
        {needsReseller && <div className="form-row"><label>Reseller *</label><select required value={resellerId} onChange={(event) => setResellerId(event.target.value)}><option value="">Select reseller...</option>{(resellers || []).map((reseller) => <option value={reseller.id} key={reseller.id}>{reseller.name}</option>)}</select></div>}
        {needsCompany && <div className="form-row"><label>Customer *</label><select required value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">Select customer...</option>{(companies || []).map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</select></div>}
        {needsScope && <div className="form-row"><label>Scope</label><select value={scopeType} onChange={(event) => setScopeType(event.target.value)}><option value="company_wide">Customer-wide (all systems)</option><option value="assigned">Selected sites and systems</option></select></div>}
        {needsScope && scopeType === "assigned" && <SystemAssignmentPicker systems={companySystems || []} selectedIds={assignedSystemIds} selectedSiteIds={assignedSiteIds} onChange={setAssignedSystemIds} onSiteChange={setAssignedSiteIds} />}
        <div className="modal-actions"><button type="button" className="header-btn" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="header-btn primary">Save</button></div>
      </form>
    </Modal>}
  </>;
}

function SystemAssignmentPicker({ systems, selectedIds, selectedSiteIds, onChange, onSiteChange }) {
  const bySite = systems.reduce((groups, system) => {
    const name = system.site_name || system.site?.name || "Unassigned site";
    (groups[name] ||= []).push(system);
    return groups;
  }, {});
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  const toggleSite = (siteId) => onSiteChange(selectedSiteIds.includes(siteId) ? selectedSiteIds.filter((value) => value !== siteId) : [...selectedSiteIds, siteId]);
  const selectAll = () => onSiteChange([...new Set(systems.map((system) => system.site_id).filter(Boolean))]);
  const clearAll = () => { onChange([]); onSiteChange([]); };
  const selectedEquipmentIds = new Set(selectedIds);
  systems.forEach((system) => {
    if (selectedSiteIds.includes(system.site_id)) selectedEquipmentIds.add(system.id);
  });
  const selectedCount = selectedEquipmentIds.size;
  return <section className="system-assignment-picker" aria-label="Allowed sites and equipment">
    <div className="assignment-picker-head"><div><label>Allowed sites & equipment</label><p>Choose whole sites or only the equipment the operator needs.</p></div><span className="assignment-count">{selectedCount} equipment allowed</span></div>
    <div className="assignment-picker-tools"><button type="button" className="assignment-action select-all" onClick={selectAll}>Select all sites</button><button type="button" className="assignment-action clear" onClick={clearAll}>Clear selection</button></div>
    <div className="assignment-site-list">{Object.entries(bySite).map(([siteName, siteSystems]) => { const siteId = siteSystems[0]?.site_id; const siteSelected = selectedSiteIds.includes(siteId); return <fieldset key={siteId || siteName} className={siteSelected ? "assignment-site selected" : "assignment-site"}><legend><label><input type="checkbox" checked={siteSelected} onChange={() => toggleSite(siteId)} /><span><strong>{siteName}</strong><small>{siteSelected ? "All equipment allowed" : "Select to allow all equipment"}</small></span></label></legend><div className="assignment-equipment-grid">{siteSystems.map((system) => <label key={system.id} className={siteSelected ? "assignment-equipment site-inherited" : "assignment-equipment"}><input type="checkbox" checked={siteSelected || selectedIds.includes(system.id)} aria-disabled={siteSelected} onClick={(event) => { if (siteSelected) event.preventDefault(); }} onChange={() => { if (!siteSelected) toggle(system.id); }} /><span>{system.name}</span></label>)}</div></fieldset>; })}</div>
    {!systems.length && <p className="assignment-empty">No systems are available for this customer.</p>}
  </section>;
}
