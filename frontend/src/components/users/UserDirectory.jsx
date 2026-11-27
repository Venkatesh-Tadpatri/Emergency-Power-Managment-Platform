import { useEffect, useState } from "react";

import { ConfirmDialog } from "../common/ConfirmDialog";
import { Modal } from "../common/Modal";
import { useToast } from "../common/Toast";
import { COUNTRY_CODES, DEFAULT_COUNTRY } from "../../pages/auth/countryCodes";
import { useSites, useSystems } from "../../queries/systems";
import { useMe } from "../../queries/me";
import { checkEmailAvailable, useAssignRole, useAssignSystems, useCancelInvite, useCreateUser, useDeleteUser, useResendInvite, useSetUserState } from "../../queries/users";
import { NAME_MAX, cleanName, emailError, formatPhone, nameError, parseUtc, phoneDigitLimit, phoneError, sanitizeNameInput } from "./userFields";

/**
 * Shared user directory used by Platform Users (superadmin, every user), Reseller
 * Users (one reseller) and Customer Settings → Users (one customer). Admins create
 * accounts here; the user is emailed, activates the account with First-time login
 * (OTP + new password), and access is then assigned with Edit Role.
 * `companyId` / `resellerId` lock the directory to one customer / reseller.
 */

export const ROLES = [
  { value: "superadmin", label: "Superadmin", needs: "none" },
  { value: "reseller_admin", label: "Reseller Admin", needs: "reseller" },
  { value: "company_admin", label: "Customer Admin", needs: "company" },
  { value: "system_operator", label: "System Operator", needs: "company+scope" },
  { value: "system_viewer", label: "System Viewer", needs: "company+scope" },
];
// Superadmin stays in ROLES for labels and filtering, but is never assignable.
const ASSIGNABLE_ROLES = ROLES.filter((item) => item.value !== "superadmin");
const CUSTOMER_ROLES = ROLES.filter((item) => item.needs.startsWith("company"));

const STATUS = {
  invited: { label: "Awaiting first login", tone: "invited" },
  pending: { label: "Email not verified", tone: "invited" },
  active: { label: "Active", tone: "active" },
  suspended: { label: "Inactive", tone: "suspended" },
  locked: { label: "Inactive", tone: "suspended" },
};

export const roleLabel = (value) => ROLES.find((item) => item.value === value)?.label || "Unassigned";
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
/** Scope cell: what the user can actually reach. For "Selected sites and systems" it names the sites and
 * systems when their records are loaded (Customer Settings → Users), or counts them otherwise. */
function ScopeCell({ user, sites = [], systems = [] }) {
  if (!user.role) return "—";
  if (user.role === "company_admin") return "Full customer";
  if (!["system_operator", "system_viewer"].includes(user.role)) return "—";
  if (user.scope_type !== "assigned") return "Customer-wide (all sites)";
  const siteIds = user.assigned_site_ids || [];
  const systemIds = user.assigned_system_ids || [];
  if (!siteIds.length && !systemIds.length) return <span className="user-scope-empty">Selected — nothing assigned yet</span>;
  const siteNames = siteIds.map((id) => sites.find((site) => site.id === id)?.name).filter(Boolean);
  const systemNames = systemIds.map((id) => systems.find((system) => system.id === id)?.name).filter(Boolean);
  const summary = [siteIds.length && plural(siteIds.length, "site"), systemIds.length && plural(systemIds.length, "system")].filter(Boolean).join(" · ");
  const detail = [...siteNames.map((name) => `${name} (all systems)`), ...systemNames].join(", ");
  return <span className="user-scope-cell" title={detail || undefined}>
    <span>Selected: {summary}</span>
    {detail && <small>{detail}</small>}
  </span>;
}

/** A customer can take new users / role assignments only while it is active: not archived itself and
 * not under an archived reseller. (The server enforces the same rule.) */
const isActiveCustomer = (company, resellers = []) =>
  company.status !== "archived" && resellers.find((item) => item.id === company.reseller_id)?.status !== "archived";

export function UserDirectory({
  users = [],
  loading = false,
  companyId,
  resellerId,
  companies = [],
  resellers = [],
  sites = [],
  systems = [],
  canManage,
  meId,
  search,
  onSearchChange,
}) {
  const toast = useToast();
  const resendInvite = useResendInvite();
  const cancelInvite = useCancelInvite();
  const setUserState = useSetUserState();
  const deleteUser = useDeleteUser();
  const { data: me } = useMe(true);
  const isSuperadmin = me?.role === "superadmin";
  // { kind: "deactivate" | "reactivate" | "delete", user }
  const [lifecycle, setLifecycle] = useState(null);
  const lockedToCompany = !!companyId;
  const lockedToReseller = !lockedToCompany && !!resellerId;
  // "assigned" = users with a role; "new" = no role yet (awaiting first login, or activated and waiting for access).
  const [tab, setTab] = useState("assigned");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [resellerFilter, setResellerFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const roleOptions = lockedToCompany || lockedToReseller ? CUSTOMER_ROLES : ROLES;
  const query = (search || "").trim().toLowerCase();
  const resellerName = (id) => resellers.find((item) => item.id === id)?.name;
  const companyName = (id) => companies.find((item) => item.id === id)?.name;
  // Reseller admins belong to a reseller directly; customer users belong to a
  // customer, whose reseller fills the Reseller column.
  const userResellerId = (user) => user.reseller_id || companies.find((item) => item.id === user.company_id)?.reseller_id || null;
  const inScope = (user) => {
    if (lockedToCompany) return user.company_id === companyId;
    if (lockedToReseller) return userResellerId(user) === resellerId || (!user.role && !user.company_id && !user.reseller_id);
    return true;
  };

  const scopedUsers = users.filter(inScope);
  const assignedUsers = scopedUsers.filter((user) => !!user.role);
  const newUsers = scopedUsers.filter((user) => !user.role);
  const isNewTab = tab === "new";
  const tabUsers = isNewTab ? newUsers : assignedUsers;
  const switchTab = (next) => { setTab(next); setRoleFilter("all"); setStatusFilter("all"); };
  const visibleUsers = tabUsers.filter((user) => {
    if (!isNewTab && roleFilter !== "all" && user.role !== roleFilter) return false;
    const accountState = user.account_state || "active";
    if (statusFilter === "active" && accountState !== "active") return false;
    if (statusFilter === "inactive" && !["suspended", "locked"].includes(accountState)) return false;
    if (isNewTab && statusFilter !== "all" && accountState !== statusFilter) return false;
    if (!lockedToCompany && !lockedToReseller && resellerFilter !== "all" && userResellerId(user) !== resellerFilter) return false;
    if (!lockedToCompany && companyFilter !== "all" && user.company_id !== companyFilter) return false;
    return !query || [user.display_name, user.email].some((value) => value?.toLowerCase().includes(query));
  });
  const companyOptions = companies.filter((company) => isActiveCustomer(company, resellers) && (resellerFilter === "all" || company.reseller_id === resellerFilter));
  const filtersActive = roleFilter !== "all" || statusFilter !== "all" || resellerFilter !== "all" || companyFilter !== "all" || !!query;
  const columnCount = isNewTab ? 8 : 9;
  const invitedCount = newUsers.filter((user) => user.account_state === "invited").length;
  const readyCount = newUsers.length - invitedCount;

  const resend = (user) => resendInvite.mutate(user.id, {
    onSuccess: (data) => toast.success(data.email_sent ? `Account email sent again to ${user.email}.` : data.message),
    onError: (error) => toast.error(error?.response?.data?.detail || "Could not resend the account email."),
  });
  const confirmDelete = () => {
    const target = deleting;
    setDeleting(null);
    cancelInvite.mutate(target.id, {
      onSuccess: () => toast.success(`Account for ${target.email} deleted successfully.`),
      onError: (error) => toast.error(error?.response?.data?.detail || "Could not delete the user account."),
    });
  };

  const actionsFor = (user) => {
    if (!canManage) return null;
    if (user.id === meId) return <span className="user-action-note">You</span>;
    if (user.role === "superadmin") return <span className="user-action-note">Protected</span>;
    if (user.account_state === "invited") return <div className="user-row-actions">
      <button type="button" className="header-btn" disabled={resendInvite.isPending} onClick={() => resend(user)}>Resend email</button>
      <button type="button" className="header-btn danger" disabled={cancelInvite.isPending} onClick={() => setDeleting(user)}>Delete</button>
    </div>;
    const suspended = user.account_state === "suspended";
    return <div className="user-row-actions">
      {!suspended && <button type="button" className="header-btn" onClick={() => setEditing(user)}>{user.role ? "Edit Role" : "Assign Access"}</button>}
      {suspended
        ? <button type="button" className="header-btn" disabled={setUserState.isPending} onClick={() => setLifecycle({ kind: "reactivate", user })}>Reactivate</button>
        : <button type="button" className="header-btn danger" disabled={setUserState.isPending} onClick={() => setLifecycle({ kind: "deactivate", user })}>Deactivate</button>}
      {isSuperadmin && suspended && <button type="button" className="header-btn danger" disabled={deleteUser.isPending}
        title="Permanently delete this account"
        onClick={() => setLifecycle({ kind: "delete", user })}>Delete</button>}
    </div>;
  };

  const confirmLifecycle = () => {
    const { kind, user } = lifecycle;
    setLifecycle(null);
    if (kind === "delete") deleteUser.mutate(user.id);
    else setUserState.mutate({ userId: user.id, accountState: kind === "deactivate" ? "suspended" : "active" });
  };
  const lifecycleName = lifecycle ? (lifecycle.user.display_name || lifecycle.user.email) : "";
  const lifecycleCopy = {
    deactivate: { title: "Deactivate user", label: "Deactivate", message: <>Deactivate <b>{lifecycleName}</b> ({lifecycle?.user.email})? They will be signed out and can no longer log in or use the application. Their account, role and history are kept, and you can reactivate them at any time.</> },
    reactivate: { title: "Reactivate user", label: "Reactivate", message: <>Reactivate <b>{lifecycleName}</b> ({lifecycle?.user.email})? They will be able to log in again with their existing role and access.</> },
    delete: { title: "Delete user permanently", label: "Delete permanently", message: <>Permanently delete <b>{lifecycleName}</b> ({lifecycle?.user.email})? Their account, role and site/system access are removed and cannot be restored. Past events and alarm actions they performed stay in the history under their name.</> },
  }[lifecycle?.kind];

  return <>
    <div className="user-tabs" role="tablist" aria-label="User lists">
      <button type="button" role="tab" aria-selected={!isNewTab} className={!isNewTab ? "active" : ""} onClick={() => switchTab("assigned")}>
        Users with access <span className="user-tab-count">{assignedUsers.length}</span>
      </button>
      <button type="button" role="tab" aria-selected={isNewTab} className={isNewTab ? "active" : ""} onClick={() => switchTab("new")}>
        New users <span className={`user-tab-count${newUsers.length ? " attention" : ""}`}>{newUsers.length}</span>
      </button>
    </div>
    {isNewTab && <p className="user-tab-hint">
      Accounts with no role yet. <b>Awaiting first login</b> — the user still has to activate their account (Resend email or Delete if needed). <b>Ready for access</b> — the user has signed in; click <b>Assign Access</b> to give them a role.
    </p>}
    <div className="directory-toolbar user-directory-toolbar">
      <div className="directory-filters user-directory-filters">
        <input type="search" value={search || ""} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search users by name or email..." aria-label="Search users by name or email" />
        {!isNewTab && <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter users by role">
          <option value="all">All roles</option>
          {roleOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
        </select>}
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter users by status">
          <option value="all">All Statuses</option>
          {isNewTab
            ? <><option value="invited">Awaiting first login</option><option value="active">Ready for access</option></>
            : <><option value="active">Active</option><option value="inactive">Inactive</option></>}
        </select>
        {!lockedToCompany && !lockedToReseller && <select value={resellerFilter} onChange={(event) => { setResellerFilter(event.target.value); setCompanyFilter("all"); }} aria-label="Filter users by reseller">
          <option value="all">All resellers</option>
          {resellers.filter((item) => item.status !== "archived").map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>}
        {!lockedToCompany && <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} aria-label="Filter users by customer">
          <option value="all">All customers</option>
          {companyOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>}
        {filtersActive && <button type="button" className="header-btn" onClick={() => { setRoleFilter("all"); setStatusFilter("all"); setResellerFilter("all"); setCompanyFilter("all"); onSearchChange(""); }}>Clear filters</button>}
      </div>
      {canManage && <button type="button" className="header-btn primary" onClick={() => setCreating(true)}>+ Create User</button>}
    </div>
    <div className="directory-filter-count">{visibleUsers.length} of {tabUsers.length} {isNewTab ? "new users" : "users with access"}{isNewTab && newUsers.length ? ` · ${invitedCount} awaiting first login · ${readyCount} ready for access` : ""}</div>

    <table className="data-table">
      <thead><tr>
        {isNewTab
          ? <><th>Sl.</th><th>Name</th><th>Email</th><th>Contact</th><th>Status</th><th>Reseller</th><th>Customer</th></>
          : <><th>Sl.</th><th>Name</th><th>Email</th><th>Status</th><th>Role</th><th>Scope</th><th>Reseller</th><th>Customer</th></>}
        <th style={{ textAlign: "right" }}>Action</th>
      </tr></thead>
      <tbody>
        {loading && <tr><td colSpan={columnCount} className="table-loading-row">Loading users…</td></tr>}
        {!loading && !visibleUsers.length && <tr><td colSpan={columnCount} className="table-loading-row">{filtersActive ? "No users match these filters." : isNewTab ? "No new users. Use + Create User to add one." : "No users with access yet."}</td></tr>}
        {visibleUsers.map((user, index) => {
          // Activated accounts without a role are "Ready for access" on the New users tab.
          const status = isNewTab && user.account_state === "active" ? { label: "Ready for access", tone: "ready" } : (STATUS[user.account_state] || STATUS.active);
          const statusCell = <td>
            <span className={`user-status-pill ${status.tone}`}>{status.label}</span>
            {user.account_state === "invited" && user.invited_at && <small className="user-status-sub">Created {parseUtc(user.invited_at).toLocaleDateString()}{user.invited_by ? ` by ${user.invited_by}` : ""}</small>}
          </td>;
          return <tr key={user.id}>
            <td className="mono">{String(index + 1).padStart(2, "0")}</td>
            <td style={{ fontWeight: 600 }}>{user.display_name || user.email}</td>
            <td className="mono">{user.email}</td>
            {isNewTab ? <><td className="mono">{user.contact_number || "—"}</td>{statusCell}</> : <>
              {statusCell}
              <td>{roleLabel(user.role)}</td>
              <td><ScopeCell user={user} sites={sites} systems={systems} /></td>
            </>}
            <td>{resellerName(userResellerId(user)) || "—"}</td>
            <td>{(user.company_id && companyName(user.company_id)) || "—"}</td>
            <td style={{ textAlign: "right" }}>{actionsFor(user)}</td>
          </tr>;
        })}
      </tbody>
    </table>

    {editing && <EditRoleModal
      user={editing}
      roleOptions={lockedToCompany || lockedToReseller ? CUSTOMER_ROLES : ASSIGNABLE_ROLES}
      lockedCompanyId={companyId}
      companies={companies}
      resellers={resellers}
      users={users}
      onClose={() => setEditing(null)}
    />}
    {creating && <CreateUserModal onCreated={() => switchTab("new")} companyId={companyId} resellerId={lockedToReseller ? resellerId : undefined} companies={companies} resellers={resellers} onClose={() => setCreating(false)} />}
    {lifecycle && <ConfirmDialog
      title={lifecycleCopy.title}
      message={lifecycleCopy.message}
      confirmLabel={lifecycleCopy.label}
      danger={lifecycle.kind !== "reactivate"}
      onCancel={() => setLifecycle(null)}
      onConfirm={confirmLifecycle}
    />}
    {deleting && <ConfirmDialog
      title="Delete user account"
      message={<>Delete the account for <b>{deleting.display_name || deleting.email}</b> ({deleting.email})? They have not activated it yet, so nothing else is affected. You can create it again later.</>}
      confirmLabel="Delete account"
      onCancel={() => setDeleting(null)}
      onConfirm={confirmDelete}
    />}
  </>;
}

function EditRoleModal({ user, roleOptions, lockedCompanyId, companies, resellers, users = [], onClose }) {
  const toast = useToast();
  const assignRole = useAssignRole();
  const assignSystems = useAssignSystems();
  const [role, setRole] = useState(roleOptions.some((item) => item.value === user.role) || (user.role === "reseller_admin" && user.reseller_id) ? user.role : "");
  // Also drives the customer list for customer-level roles, so start from the user's own reseller
  // (set when the account was created) or the reseller of the customer they're already under.
  const [resellerId, setResellerId] = useState(user.reseller_id || companies.find((item) => item.id === user.company_id)?.reseller_id || "");
  const [companyId, setCompanyId] = useState(lockedCompanyId || user.company_id || "");
  const [scopeType, setScopeType] = useState(user.scope_type || "company_wide");
  const [systemIds, setSystemIds] = useState(user.assigned_system_ids || []);
  const [siteIds, setSiteIds] = useState(user.assigned_site_ids || []);

  const roleDef = ROLES.find((item) => item.value === role);
  const needsReseller = roleDef?.needs === "reseller";
  const needsCompany = !!roleDef?.needs.startsWith("company");
  const needsScope = roleDef?.needs === "company+scope";
  const wantsSystems = needsScope && scopeType === "assigned" && !!companyId;
  const { data: companySystems } = useSystems(companyId || undefined, undefined, false, wantsSystems);
  const { data: companySites } = useSites(companyId || undefined, { enabled: wantsSystems });
  const activeSiteIds = new Set((companySites || []).filter((site) => site.status !== "archived").map((site) => site.id));
  const availableSystems = (companySystems || []).filter((system) => activeSiteIds.has(system.site_id));
  const saving = assignRole.isPending || assignSystems.isPending;
  // A Reseller Admin already bound to a reseller keeps that assignment; it cannot be edited.
  const lockedResellerAdmin = user.role === "reseller_admin" && !!user.reseller_id;
  const lockedResellerName = resellers.find((item) => item.id === user.reseller_id)?.name;
  // Customer names aren't unique across resellers (e.g. several "Abb Customer"), so a customer-level
  // role picks the reseller first and the customer list is limited to that reseller's active customers.
  // Skipped when the list is already scoped to a single reseller (Reseller/Customer Users pages).
  const activeResellers = resellers.filter((item) => item.status !== "archived");
  const pickCustomerReseller = needsCompany && !lockedCompanyId && activeResellers.length > 1;
  const customerChoices = companies.filter((item) => isActiveCustomer(item, resellers) && (!pickCustomerReseller || item.reseller_id === resellerId));
  const changeCustomerReseller = (nextResellerId) => {
    setResellerId(nextResellerId);
    if (!companies.some((item) => item.id === companyId && item.reseller_id === nextResellerId)) {
      setCompanyId("");
      setSystemIds([]);
      setSiteIds([]);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (lockedResellerAdmin) return;
    if (saving || !role || (needsReseller && !resellerId) || (needsCompany && !companyId)) return;
    const name = user.display_name || user.email;
    // One Reseller Admin per reseller (the server enforces this too).
    if (role === "reseller_admin") {
      const existingAdmin = users.find((item) => item.id !== user.id && item.role === "reseller_admin" && item.reseller_id === resellerId);
      if (existingAdmin) {
        const resellerLabel = resellers.find((item) => item.id === resellerId)?.name || "this reseller";
        toast.error(`A Reseller Admin is already assigned for ${resellerLabel} (${existingAdmin.display_name || existingAdmin.email}).`);
        return;
      }
    }
    const onError = (error) => {
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : `Could not update ${name}.`);
    };
    assignRole.mutate({
      userId: user.id,
      role,
      resellerId: needsReseller ? resellerId : null,
      companyId: needsCompany ? companyId : null,
      scopeType: needsScope ? scopeType : null,
    }, {
      onError,
      onSuccess: (updated) => {
        if (needsScope && scopeType === "assigned") {
          assignSystems.mutate({
            userId: updated.id,
            systemIds: systemIds.filter((id) => availableSystems.some((system) => system.id === id)),
            siteIds: siteIds.filter((id) => activeSiteIds.has(id)),
          }, {
            onError,
            onSuccess: () => { toast.success(`${name} updated.`); onClose(); },
          });
        } else {
          toast.success(`${name} updated.`);
          onClose();
        }
      },
    });
  };

  return <Modal title={`Edit role — ${user.display_name || user.email}`} className="user-access-modal" onClose={() => !saving && onClose()}>
    <form onSubmit={submit}>
      <div className="form-row"><label>Role *</label>
        <select required value={role} disabled={lockedResellerAdmin} onChange={(event) => setRole(event.target.value)}>
          <option value="">Select role...</option>
          {roleOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          {lockedResellerAdmin && !roleOptions.some((item) => item.value === "reseller_admin") && <option value="reseller_admin">Reseller Admin</option>}
        </select>
      </div>
      {(needsReseller || lockedResellerAdmin) && <div className="form-row"><label>Reseller *</label>
        <select required value={resellerId} disabled={lockedResellerAdmin} onChange={(event) => setResellerId(event.target.value)}>
          <option value="">Select reseller...</option>
          {resellers.filter((item) => item.status !== "archived" || item.id === resellerId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          {lockedResellerAdmin && !lockedResellerName && <option value={resellerId}>{resellerId}</option>}
        </select>
      </div>}
      {lockedResellerAdmin && <p className="section-sub" role="note">This user is the Reseller Admin for <b>{lockedResellerName || "their reseller"}</b>. The role and reseller assignment can't be changed.</p>}
      {pickCustomerReseller && <div className="form-row"><label>Reseller *</label>
        <select required value={resellerId} onChange={(event) => changeCustomerReseller(event.target.value)}>
          <option value="">Select reseller...</option>
          {activeResellers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
      </div>}
      {needsCompany && !lockedCompanyId && <div className="form-row"><label>Customer *</label>
        <select required value={companyId} disabled={pickCustomerReseller && !resellerId} onChange={(event) => { setCompanyId(event.target.value); setSystemIds([]); setSiteIds([]); }}>
          <option value="">{pickCustomerReseller && !resellerId ? "Select a reseller first..." : customerChoices.length ? "Select customer..." : "No active customers for this reseller"}</option>
          {customerChoices.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
      </div>}
      {needsScope && <div className="form-row"><label>Scope</label>
        <select value={scopeType} onChange={(event) => setScopeType(event.target.value)}>
          <option value="company_wide">Customer-wide (all systems)</option>
          <option value="assigned">Selected sites and systems</option>
        </select>
      </div>}
      {needsScope && scopeType === "assigned" && companyId && <AccessPicker
        systems={availableSystems}
        systemIds={systemIds}
        siteIds={siteIds}
        onSystemsChange={setSystemIds}
        onSitesChange={setSiteIds}
      />}
      <div className="modal-actions">
        <button type="button" className="header-btn" disabled={saving} onClick={onClose}>{lockedResellerAdmin ? "Close" : "Cancel"}</button>
        {!lockedResellerAdmin && <button type="submit" className="header-btn primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>}
      </div>
    </form>
  </Modal>;
}

function AccessPicker({ systems, systemIds, siteIds, onSystemsChange, onSitesChange }) {
  const sites = systems.reduce((groups, system) => {
    (groups[system.site_id] ||= { name: system.site_name || "Site", systems: [] }).systems.push(system);
    return groups;
  }, {});
  const toggleSite = (siteId) => onSitesChange(siteIds.includes(siteId) ? siteIds.filter((value) => value !== siteId) : [...siteIds, siteId]);
  const toggleSystem = (systemId) => onSystemsChange(systemIds.includes(systemId) ? systemIds.filter((value) => value !== systemId) : [...systemIds, systemId]);
  const selectedCount = new Set([
    ...systemIds,
    ...Object.entries(sites).filter(([siteId]) => siteIds.includes(siteId)).flatMap(([, group]) => group.systems.map((system) => system.id)),
  ]).size;

  return <section className="system-assignment-picker" aria-label="Allowed sites and systems">
    <div className="assignment-picker-head">
      <div><label>Allowed sites &amp; systems</label><p>Check a whole site to allow every system on it, or pick individual systems.</p></div>
      <span className="assignment-count">{selectedCount} {selectedCount === 1 ? "system" : "systems"} allowed</span>
    </div>
    <div className="assignment-picker-tools">
      <button type="button" className="assignment-action select-all" onClick={() => onSitesChange(Object.keys(sites))}>Select all sites</button>
      <button type="button" className="assignment-action clear" onClick={() => { onSystemsChange([]); onSitesChange([]); }}>Clear selection</button>
    </div>
    <div className="assignment-site-list">
      {Object.entries(sites).map(([siteId, group]) => {
        const siteSelected = siteIds.includes(siteId);
        return <fieldset key={siteId} className={siteSelected ? "assignment-site selected" : "assignment-site"}>
          <legend><label>
            <input type="checkbox" checked={siteSelected} onChange={() => toggleSite(siteId)} />
            <span><strong>{group.name}</strong><small>{siteSelected ? "All systems allowed" : "Select to allow all systems"}</small></span>
          </label></legend>
          <div className="assignment-equipment-grid">
            {group.systems.map((system) => <label key={system.id} className={siteSelected ? "assignment-equipment site-inherited" : "assignment-equipment"}>
              <input type="checkbox" checked={siteSelected || systemIds.includes(system.id)} aria-disabled={siteSelected}
                onClick={(event) => { if (siteSelected) event.preventDefault(); }}
                onChange={() => { if (!siteSelected) toggleSystem(system.id); }} />
              <span>{system.name}</span>
            </label>)}
          </div>
        </fieldset>;
      })}
    </div>
    {!systems.length && <p className="assignment-empty">No systems are available for this customer.</p>}
  </section>;
}

/**
 * Admin creates an account. The user receives an "account created" email, then
 * activates it from the login page (First-time login → OTP → set password).
 * Access (role and scope) is assigned afterwards with Assign Access.
 */
function CreateUserModal({ companyId, resellerId, companies, resellers, onClose, onCreated }) {
  const toast = useToast();
  const createUser = useCreateUser();
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", country: DEFAULT_COUNTRY, phone: "",
    reseller_id: resellerId || "", company_id: companyId || "",
  });
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [available, setAvailable] = useState(null);
  const [checking, setChecking] = useState(false);
  const [serverError, setServerError] = useState("");

  const lockedCompany = companyId ? companies.find((item) => item.id === companyId) : null;
  const activeCompanies = companies.filter((item) => isActiveCustomer(item, resellers));
  const customerChoices = activeCompanies.filter((item) => !form.reseller_id || item.reseller_id === form.reseller_id);
  const showResellerPicker = !companyId && !resellerId;

  const errors = Object.fromEntries(Object.entries({
    first_name: nameError(form.first_name, "First name"),
    last_name: nameError(form.last_name, "Last name"),
    email: emailError(form.email),
    phone: phoneError(form.country, form.phone),
  }).filter(([, message]) => message));
  const show = (key) => (submitted || touched[key] ? errors[key] : undefined);
  const set = (key, value) => { setForm((old) => ({ ...old, [key]: value })); setServerError(""); };
  const blur = (key) => () => setTouched((old) => ({ ...old, [key]: true }));

  // Live duplicate-email check, debounced; the server re-checks on save.
  useEffect(() => {
    setAvailable(null);
    if (emailError(form.email)) return undefined;
    setChecking(true);
    const id = setTimeout(async () => {
      try { setAvailable(await checkEmailAvailable(form.email.trim())); } catch { setAvailable(null); } finally { setChecking(false); }
    }, 450);
    return () => { clearTimeout(id); setChecking(false); };
  }, [form.email]);

  const submit = (event) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length || available === false || createUser.isPending) return;
    const payload = {
      first_name: cleanName(form.first_name),
      last_name: cleanName(form.last_name),
      email: form.email.trim(),
      contact_number: formatPhone(form.country, form.phone),
      company_id: form.company_id || null,
      reseller_id: form.company_id ? null : (form.reseller_id || null),
    };
    createUser.mutate(payload, {
      onSuccess: (data) => {
        toast.success(data.email_sent
          ? `Account created for ${payload.first_name} ${payload.last_name}. ${data.message}`
          : data.message);
        onCreated?.();
        onClose();
      },
      onError: (error) => {
        const detail = error?.response?.data?.detail;
        const message = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((item) => item.msg).join(". ") : "Could not create the user.";
        setServerError(message);
        if (error?.response?.status === 409) setAvailable(false);
      },
    });
  };

  const emailStatus = !errors.email && (checking ? { tone: "checking", text: "Checking email…" } : available === true ? { tone: "ok", text: "Email is available" } : available === false ? { tone: "bad", text: "An account already uses this email" } : null);

  return <Modal title="Create user" className="user-access-modal create-user-modal" onClose={() => !createUser.isPending && onClose()}>
    <p className="create-user-intro">
      The user gets an email that their account was created. They then choose <b>First-time login</b> on the sign-in page, verify their email with a one-time code and set a password. Assign their access after they have signed in.
    </p>
    <form onSubmit={submit} noValidate>
      <div className="create-user-grid">
        <div className={`form-row${show("first_name") ? " has-error" : ""}`}><label>First name *</label>
          <input autoFocus maxLength={NAME_MAX} value={form.first_name} onChange={(event) => set("first_name", sanitizeNameInput(event.target.value))} onBlur={blur("first_name")} placeholder="e.g. Priya" />
          {show("first_name") && <small className="field-error">{show("first_name")}</small>}
        </div>
        <div className={`form-row${show("last_name") ? " has-error" : ""}`}><label>Last name *</label>
          <input maxLength={NAME_MAX} value={form.last_name} onChange={(event) => set("last_name", sanitizeNameInput(event.target.value))} onBlur={blur("last_name")} placeholder="e.g. Sharma" />
          {show("last_name") && <small className="field-error">{show("last_name")}</small>}
        </div>
      </div>
      <div className={`form-row${show("email") || available === false ? " has-error" : ""}`}><label>Email (used to sign in) *</label>
        <input type="email" autoComplete="off" value={form.email} onChange={(event) => set("email", event.target.value)} onBlur={blur("email")} placeholder="name@company.com" />
        {show("email") ? <small className="field-error">{show("email")}</small> : emailStatus && <small className={`email-check ${emailStatus.tone}`}>{emailStatus.text}</small>}
      </div>
      <div className={`form-row${show("phone") ? " has-error" : ""}`}><label>Contact number *</label>
        <div className="create-user-phone">
          <select value={form.country} onChange={(event) => { set("country", event.target.value); set("phone", form.phone.slice(0, phoneDigitLimit(event.target.value))); }} aria-label="Country calling code">
            {COUNTRY_CODES.map((item) => <option value={item.iso} key={item.iso}>{item.iso} {item.dial}</option>)}
          </select>
          <input type="tel" inputMode="numeric" value={form.phone} maxLength={phoneDigitLimit(form.country)} onChange={(event) => set("phone", event.target.value.replace(/\D/g, "").slice(0, phoneDigitLimit(form.country)))} onBlur={blur("phone")} placeholder="Mobile number" aria-label="Contact number" />
        </div>
        {show("phone") && <small className="field-error">{show("phone")}</small>}
      </div>
      {lockedCompany && <div className="form-row"><label>Customer</label><input value={lockedCompany.name} readOnly disabled /></div>}
      {!companyId && showResellerPicker && <div className="form-row"><label>Reseller</label>
        <select value={form.reseller_id} onChange={(event) => { set("reseller_id", event.target.value); set("company_id", ""); }}>
          <option value="">None — platform level</option>
          {resellers.filter((item) => item.status !== "archived").map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
      </div>}
      {!companyId && <div className="form-row"><label>Customer</label>
        <select value={form.company_id} onChange={(event) => set("company_id", event.target.value)}>
          <option value="">{resellerId || form.reseller_id ? "None — reseller level" : "None"}</option>
          {customerChoices.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        <small className="field-help">Which customer this person belongs to. Their role is chosen after they sign in.</small>
      </div>}
      {serverError && <div className="reseller-save-error" role="alert">{serverError}</div>}
      <div className="modal-actions">
        <button type="button" className="header-btn" onClick={onClose} disabled={createUser.isPending}>Cancel</button>
        <button type="submit" className="header-btn primary" disabled={createUser.isPending || available === false || checking}>{createUser.isPending ? "Creating…" : "Create & send email"}</button>
      </div>
    </form>
  </Modal>;
}
