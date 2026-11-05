import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { IconBuilding, IconMap } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { StatusPill } from "../../components/common/StatusPill";
import { QueryState } from "../../components/common/QueryState";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { useArchiveSite, useCreateSite, useSites, useSystems, useUpdateSite } from "../../queries/systems";

export function CustomerSites() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const customerQuery = useCompany(companyId);
  const { data: customer } = customerQuery;
  const { data: reseller } = useReseller(customer?.reseller_id);
  const sitesQuery = useSites(companyId);
  const systemsQuery = useSystems(companyId);
  const { data: sites } = sitesQuery;
  const { data: systems } = systemsQuery;
  const { data: me } = useMe(true);
  const createSite = useCreateSite();
  const updateSite = useUpdateSite();
  const archiveSite = useArchiveSite();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", address: "", lat: "", lng: "" });
  const [addressOptions, setAddressOptions] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressSearchEnabled, setAddressSearchEnabled] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const canManage = me?.role === "superadmin";
  const canViewReseller = me?.role === "superadmin" || me?.role === "reseller_admin";
  const activeSites = (sites || []).filter((site) => site.status !== "archived");
  const offlineDevices = (systems || []).filter((system) => system.status === "offline").length;
  const events = (systems || []).filter((system) => system.status !== "normal").length;
  const statusFromSystems = (siteSystems) => {
    if (siteSystems.some((system) => system.status === "emergency")) return "emergency";
    if (siteSystems.some((system) => system.status === "alarm")) return "alarm";
    if (siteSystems.some((system) => system.status === "test")) return "test";
    if (siteSystems.length > 0 && siteSystems.every((system) => system.status === "offline")) return "offline";
    return "online";
  };

  usePageHeader(customer?.name || "Customer", canViewReseller ? [
    { label: "Active Resellers", onClick: () => navigate("/resellers") },
    { label: reseller?.name || "", onClick: () => navigate(`/resellers/${customer?.reseller_id}`) },
  ] : []);

  useEffect(() => {
    const query = form.address.trim();
    if (!editing || !addressSearchEnabled || query.length < 3) {
      setAddressOptions([]);
      setAddressLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAddressLoading(true);
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Address lookup failed");
        const results = await response.json();
        setAddressOptions(results.map((item) => ({
          label: item.display_name,
          lat: item.lat,
          lng: item.lon,
        })));
      } catch (error) {
        if (error.name !== "AbortError") setAddressOptions([]);
      } finally {
        if (!controller.signal.aborted) setAddressLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [addressSearchEnabled, editing, form.address]);

  function openNew() {
    setForm({ name: "", address: "", lat: "", lng: "" });
    setAddressOptions([]);
    setAddressSearchEnabled(false);
    setEditing("new");
  }
  function openEdit(site, event) {
    event.stopPropagation();
    setForm({ name: site.name, address: site.address || "", lat: site.lat?.toString() || "", lng: site.lng?.toString() || "" });
    setAddressOptions([]);
    setAddressSearchEnabled(false);
    setEditing(site);
  }
  function selectAddress(option) {
    setForm((current) => ({
      ...current,
      address: option.label,
      lat: Number(option.lat).toFixed(6),
      lng: Number(option.lng).toFixed(6),
    }));
    setAddressOptions([]);
    setAddressSearchEnabled(false);
  }
  function submit(event) {
    event.preventDefault();
    if (!form.name.trim() || !companyId) return;
    const data = {
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      lat: form.lat ? Number(form.lat) : undefined,
      lng: form.lng ? Number(form.lng) : undefined,
    };
    if (editing === "new") createSite.mutate({ ...data, customer_id: companyId });
    else updateSite.mutate({ id: editing.id, data });
    setEditing(null);
  }

  if (customerQuery.isPending) return <QueryState loading title="Loading customer…" message="Preparing customer details." />;
  if (customerQuery.isError) return <QueryState title="Customer unavailable" message="We couldn't retrieve this customer." onRetry={() => { void customerQuery.refetch(); }} />;

  return <>
    <div className="reseller-page-heading">
      <div className="reseller-page-heading-icon"><IconBuilding size={19} /></div>
      <div className="reseller-page-heading-copy">
        <h2>{customer?.name || "Customer"}</h2>
        {customer?.address && <span>{customer.address}</span>}
      </div>
    </div>
    <div className="reseller-total-strip">
      <div className="reseller-total-item blue"><span>Total Sites</span><strong>{activeSites.length}</strong></div>
      <div className="reseller-total-item cyan"><span>Total Systems</span><strong>{systems?.length ?? 0}</strong></div>
      <div className={`reseller-total-item ${offlineDevices ? "red" : "green"}`}><span>Offline Devices</span><strong>{offlineDevices}</strong></div>
      <div className="reseller-total-item amber"><span>Events</span><strong>{events}</strong></div>
    </div>
    <div className="section-header"><div><div className="section-title">Sites</div><div className="section-sub">Select a site to view its systems</div></div>{canManage && <button className="header-btn primary" onClick={openNew}>+ New Site</button>}</div>
    <table className="data-table">
      <thead><tr><th>Sl.</th><th>Site</th><th>Location</th><th>Systems</th><th>Online</th><th>Events</th><th>Status</th><th /></tr></thead>
      <tbody>{sitesQuery.isPending && <tr><td colSpan={8} className="table-loading-row">Loading sites...</td></tr>}{sitesQuery.isError && <tr><td colSpan={8} className="table-loading-row error">Sites could not be loaded. <button className="header-btn" onClick={() => sitesQuery.refetch()}>Retry</button></td></tr>}{activeSites.map((site, index) => {
        const siteSystems = (systems || []).filter((system) => system.site_id === site.id);
        const siteOnline = siteSystems.filter((system) => system.status === "normal").length;
        const siteStatus = statusFromSystems(siteSystems);
        return <tr key={site.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/companies/${companyId}/sites/${site.id}`)}>
          <td className="mono">{String(index + 1).padStart(2, "0")}</td><td style={{ fontWeight: 600 }}><span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 8, color: "var(--blue)" }}><IconMap size={16} /></span>{site.name}</td>
          <td>{site.address || "—"}</td><td>{siteSystems.length}</td><td style={{ color: "var(--green)", fontWeight: 600 }}>{siteOnline}</td><td style={{ color: siteSystems.length - siteOnline ? "var(--red)" : "var(--text-dim)", fontWeight: 600 }}>{siteSystems.length - siteOnline}</td><td><StatusPill status={siteStatus} /></td>
          <td onClick={(event) => event.stopPropagation()}>{canManage && <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button className="header-btn" onClick={(event) => openEdit(site, event)}>Edit</button>
          </span>}</td>
        </tr>;
      })}</tbody>
    </table>
    {editing && <Modal title={editing === "new" ? "New Site" : "Edit Site"} onClose={() => setEditing(null)}>
      <form onSubmit={submit}>
        <div className="form-row">
          <label>Site Name *</label>
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Ameerpet Hospital" autoFocus />
        </div>
        <div className="form-row address-autocomplete">
          <label>Address / Area</label>
          <input
            value={form.address}
            onChange={(event) => {
              setForm({ ...form, address: event.target.value, lat: "", lng: "" });
              setAddressSearchEnabled(true);
            }}
            placeholder="e.g. Ameerpet, Hyderabad"
            autoComplete="off"
          />
          {(addressLoading || addressOptions.length > 0) && (
            <div className="address-suggestions">
              {addressLoading && <div className="address-suggestion muted">Searching addresses...</div>}
              {addressOptions.map((option) => (
                <button type="button" className="address-suggestion" key={`${option.lat}-${option.lng}`} onClick={() => selectAddress(option)}>
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-row">
            <label>Latitude</label>
            <input type="number" step="any" min={-90} max={90} value={form.lat} onChange={(event) => setForm({ ...form, lat: event.target.value })} placeholder="e.g. 17.4239" />
          </div>
          <div className="form-row">
            <label>Longitude</label>
            <input type="number" step="any" min={-180} max={180} value={form.lng} onChange={(event) => setForm({ ...form, lng: event.target.value })} placeholder="e.g. 78.4738" />
          </div>
        </div>
        <div className="modal-actions">
          {editing !== "new" && <button type="button" className="header-btn danger reseller-edit-archive" onClick={() => { setDeleting(editing); setEditing(null); }}>Archive</button>}
          <button type="button" className="header-btn" onClick={() => setEditing(null)}>Cancel</button>
          <button type="submit" className="header-btn primary">Save</button>
        </div>
      </form>
    </Modal>}
    {deleting && <ConfirmDialog
      title="Archive site"
      message={`Archive "${deleting.name}"? It will be moved to Archived Sites.`}
      confirmLabel="Archive"
      onCancel={() => setDeleting(null)}
      onConfirm={() => { archiveSite.mutate(deleting.id); setDeleting(null); }}
    />}
  </>;
}
