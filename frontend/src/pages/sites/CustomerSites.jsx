import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { IconBuilding, IconMap } from "../../components/common/Icons";
import { LeafletMap } from "../../components/map/LeafletMap";
import { Modal } from "../../components/common/Modal";
import { PageHero } from "../../components/common/PageHero";
import { StatusPill } from "../../components/common/StatusPill";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useArchiveSite, useCreateSite, useSites, useSystems, useUpdateSite } from "../../queries/systems";

export function CustomerSites() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { data: customer } = useCompany(companyId);
  const { data: sites } = useSites(companyId);
  const { data: systems } = useSystems(companyId);
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

  usePageHeader(customer?.name || "Customer", canViewReseller ? [{ label: "Resellers", onClick: () => navigate("/resellers") }] : []);

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

  return <>
    <PageHero title={customer?.name || "Customer"} subtitle={customer?.address} icon={IconBuilding} color="#2563eb" bgImage="/images/hero-bg.jpg" showText={false} showIcon={false} />
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
      <tbody>{activeSites.map((site, index) => {
        const siteSystems = (systems || []).filter((system) => system.site_id === site.id);
        const siteOnline = siteSystems.filter((system) => system.status === "normal").length;
        const siteStatus = statusFromSystems(siteSystems);
        return <tr key={site.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/companies/${companyId}/sites/${site.id}`)}>
          <td className="mono">{String(index + 1).padStart(2, "0")}</td><td style={{ fontWeight: 600 }}><span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 8, color: "var(--blue)" }}><IconMap size={16} /></span>{site.name}</td>
          <td>{site.address || "—"}</td><td>{siteSystems.length}</td><td style={{ color: "var(--green)", fontWeight: 600 }}>{siteOnline}</td><td style={{ color: siteSystems.length - siteOnline ? "var(--red)" : "var(--text-dim)", fontWeight: 600 }}>{siteSystems.length - siteOnline}</td><td><StatusPill status={siteStatus} /></td>
          <td onClick={(event) => event.stopPropagation()}>{canManage && <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button className="header-btn" onClick={(event) => openEdit(site, event)}>Edit</button>
            <button className="header-btn" onClick={() => navigate(`/companies/${companyId}/sites/${site.id}`)}>View Details</button>
            <button className="header-btn danger" onClick={() => setDeleting(site)}>Delete</button>
          </span>}</td>
        </tr>;
      })}</tbody>
    </table>
    <div className="section-header"><div><div className="section-title">Site Locations</div><div className="section-sub">{activeSites.filter((site) => site.lat != null && site.lng != null).length} of {activeSites.length} sites plotted on the map</div></div></div>
    <div style={{ position: "relative", height: 420, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
      <LeafletMap
        markers={activeSites.filter((site) => site.lat != null && site.lng != null).map((site) => {
          const siteSystems = (systems || []).filter((system) => system.site_id === site.id);
          return { id: site.id, lat: site.lat, lng: site.lng, status: statusFromSystems(siteSystems), label: site.name };
        })}
        onMarkerClick={(id) => navigate(`/companies/${companyId}/sites/${id}`)}
        singleMarkerZoom={12}
      />
    </div>
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
          <button type="button" className="header-btn" onClick={() => setEditing(null)}>Cancel</button>
          <button type="submit" className="header-btn primary">Save</button>
        </div>
      </form>
    </Modal>}
    {deleting && <ConfirmDialog
      title="Delete site"
      message={`Delete "${deleting.name}"? This hides the site and its systems from active monitoring.`}
      confirmLabel="Delete"
      onCancel={() => setDeleting(null)}
      onConfirm={() => { archiveSite.mutate(deleting.id); setDeleting(null); }}
    />}
  </>;
}
