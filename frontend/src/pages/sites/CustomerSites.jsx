import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { IconBuilding, IconMap } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { StatusPill } from "../../components/common/StatusPill";
import { QueryState } from "../../components/common/QueryState";
import { useToast } from "../../components/common/Toast";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { useArchiveSite, useCreateSite, useSites, useSystems, useUpdateSite } from "../../queries/systems";
import { googleMapsUrl, parseMapLink } from "../../utils/mapLink";

export function CustomerSites() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
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
  const [saveError, setSaveError] = useState("");
  const [addressOptions, setAddressOptions] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressSearchEnabled, setAddressSearchEnabled] = useState(false);
  const [deleting, setDeleting] = useState(null);
  // "search" = OpenStreetMap address search; "link" = paste a Google Maps link or coordinates.
  const [locationTab, setLocationTab] = useState("search");
  const [mapLinkInput, setMapLinkInput] = useState("");
  const mapLinkResult = mapLinkInput.trim() ? parseMapLink(mapLinkInput) : null;
  const canManage = me?.role === "superadmin";
  const canViewReseller = me?.role === "superadmin" || me?.role === "reseller_admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const siteSearch = (searchParams.get("search") || "").trim().toLowerCase();
  const activeSites = (sites || []).filter((site) => site.status !== "archived");
  const visibleSites = siteSearch
    ? activeSites.filter((site) => [site.name, site.address].some((value) => value?.toLowerCase().includes(siteSearch)))
    : activeSites;
  // Only count systems that belong to an active (non-archived) site so the totals match the table below.
  const activeSiteIds = new Set(activeSites.map((site) => site.id));
  const activeSystems = (systems || []).filter((system) => activeSiteIds.has(system.site_id));
  const offlineDevices = activeSystems.filter((system) => system.status === "offline").length;
  // Events are abnormal states on systems that are actually reporting; offline is counted separately.
  const events = activeSystems.filter((system) => !["normal", "offline"].includes(system.status)).length;
  const statusFromSystems = (siteSystems) => {
    if (siteSystems.some((system) => system.status === "emergency")) return "emergency";
    if (siteSystems.some((system) => system.status === "alarm")) return "alarm";
    if (siteSystems.some((system) => system.status === "test")) return "test";
    if (siteSystems.every((system) => system.status === "offline")) return "offline";
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
    setSaveError("");
    setForm({ name: "", address: "", lat: "", lng: "" });
    setAddressOptions([]);
    setAddressSearchEnabled(false);
    setLocationTab("search");
    setMapLinkInput("");
    setEditing("new");
  }
  /** Fills latitude/longitude (and the address, when the link names the place and none is set) from the pasted link. */
  function applyMapLink() {
    if (!mapLinkResult?.ok) return;
    setForm((current) => ({
      ...current,
      lat: String(mapLinkResult.lat),
      lng: String(mapLinkResult.lng),
      address: current.address.trim() ? current.address : (mapLinkResult.placeName || current.address),
    }));
    setAddressOptions([]);
    setAddressSearchEnabled(false);
    toast.success(`Location set to ${mapLinkResult.lat}, ${mapLinkResult.lng}${mapLinkResult.placeName ? ` (${mapLinkResult.placeName})` : ""}.`);
  }
  function openEdit(site, event) {
    event.stopPropagation();
    setSaveError("");
    setForm({ name: site.name, address: site.address || "", lat: site.lat?.toString() || "", lng: site.lng?.toString() || "" });
    setAddressOptions([]);
    setAddressSearchEnabled(false);
    setLocationTab("search");
    setMapLinkInput("");
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
    const isSaving = createSite.isPending || updateSite.isPending;
    if (isSaving || !form.name.trim() || !companyId) return;
    setSaveError("");
    const duplicate = (sites || []).find(site => site.id !== editing?.id && site.name.trim().toLowerCase() === form.name.trim().toLowerCase());
    if (duplicate) { const message = `A site named "${duplicate.name}" already exists.`; setSaveError(message); toast.error(message); return; }
    const data = {
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      lat: form.lat ? Number(form.lat) : undefined,
      lng: form.lng ? Number(form.lng) : undefined,
    };
    const onSuccess = (saved) => { setEditing(null); toast.success(editing === "new" ? `Site "${saved.name}" created successfully.` : `Site "${saved.name}" updated successfully.`); };
    const onError = (error) => { const detail = error?.response?.data?.detail; const message = typeof detail === "string" ? detail : "Unable to save the site. Please try again."; setSaveError(message); toast.error(message); };
    if (editing === "new") createSite.mutate({ ...data, customer_id: companyId }, { onSuccess, onError });
    else updateSite.mutate({ id: editing.id, data }, { onSuccess, onError });
  }

  if (customerQuery.isPending) return <QueryState loading title="Loading customer…" message="Preparing customer details." />;
  if (customerQuery.isError) return <QueryState title="Customer unavailable" message="We couldn't retrieve this customer." onRetry={() => { void customerQuery.refetch(); }} />;

  if (customer?.status === "archived") {
    if (me?.permissions.create_company) return <Navigate to="/companies/archived" replace />;
    return <QueryState title="Customer archived" message="This customer portfolio is archived and is no longer accessible." />;
  }

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
      <div className="reseller-total-item cyan"><span>Total Systems</span><strong>{activeSystems.length}</strong></div>
      <div className={`reseller-total-item ${offlineDevices ? "red" : "green"}`}><span>Offline Devices</span><strong>{offlineDevices}</strong></div>
      <div className="reseller-total-item amber"><span>Events</span><strong>{events}</strong></div>
    </div>
    <div className="directory-toolbar">
      <div className="directory-filters reseller-search-bar">
        <input type="search" value={searchParams.get("search") || ""} onChange={(event) => setSearchParams(event.target.value ? { search: event.target.value } : {}, { replace: true })} placeholder="Search sites by name or location..." aria-label="Search sites by name or location" />
      </div>
    </div>
    <div className="section-header"><div><div className="section-title">Active Sites</div><div className="section-sub">{siteSearch ? <>Showing {visibleSites.length} of {activeSites.length} sites matching “{searchParams.get("search")}” · <button type="button" className="bc-link" style={{ background: "none", border: 0, padding: 0, color: "var(--blue)", cursor: "pointer", font: "inherit" }} onClick={() => setSearchParams({}, { replace: true })}>Clear</button></> : "Select a site to view its systems"}</div></div>{canManage && <button className="header-btn primary" onClick={openNew}>+ New Site</button>}</div>
    <table className="data-table">
      <thead><tr><th>Sl.</th><th>Site</th><th>Location</th><th>Systems</th><th>Online</th><th>Events</th><th>Status</th><th /></tr></thead>
      <tbody>{sitesQuery.isPending && <tr><td colSpan={8} className="table-loading-row">Loading sites...</td></tr>}{sitesQuery.isError && <tr><td colSpan={8} className="table-loading-row error">Sites could not be loaded. <button className="header-btn" onClick={() => sitesQuery.refetch()}>Retry</button></td></tr>}{!sitesQuery.isPending && siteSearch && !visibleSites.length && <tr><td colSpan={8} className="table-loading-row">No sites match “{searchParams.get("search")}”.</td></tr>}{visibleSites.map((site, index) => {
        const siteSystems = (systems || []).filter((system) => system.site_id === site.id);
        const siteOnline = siteSystems.filter((system) => system.status !== "offline").length;
        const siteEvents = siteSystems.filter((system) => !["normal", "offline"].includes(system.status)).length;
        const siteStatus = statusFromSystems(siteSystems);
        return <tr key={site.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/companies/${companyId}/sites/${site.id}`)}>
          <td className="mono">{String(index + 1).padStart(2, "0")}</td><td style={{ fontWeight: 600 }}><span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 8, color: "var(--blue)" }}><IconMap size={16} /></span>{site.name}</td>
          <td>{site.address || "—"}</td><td>{siteSystems.length}</td><td style={{ color: "var(--green)", fontWeight: 600 }}>{siteOnline}</td><td style={{ color: siteEvents ? "var(--red)" : "var(--text-dim)", fontWeight: 600 }}>{siteEvents}</td><td><StatusPill status={siteStatus} /></td>
          <td onClick={(event) => event.stopPropagation()}>{canManage && <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button className="header-btn" onClick={(event) => openEdit(site, event)}>Edit</button>
          </span>}</td>
        </tr>;
      })}</tbody>
    </table>
    {editing && <Modal title={editing === "new" ? "New Site" : "Edit Site"} onClose={() => !(createSite.isPending || updateSite.isPending) && setEditing(null)}>
      <form onSubmit={submit}>
        <div className="form-row">
          <label>Site Name *</label>
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Ameerpet Hospital" autoFocus />
        </div>
        <div className="site-location-tabs" role="tablist" aria-label="How to set the site location">
          <button type="button" role="tab" aria-selected={locationTab === "search"} className={locationTab === "search" ? "active" : ""} onClick={() => setLocationTab("search")}>Search address</button>
          <button type="button" role="tab" aria-selected={locationTab === "link"} className={locationTab === "link" ? "active" : ""} onClick={() => { setLocationTab("link"); setAddressOptions([]); setAddressSearchEnabled(false); }}>Paste Google Maps link</button>
        </div>
        {locationTab === "link" && <div className="form-row site-map-link">
          <label>Google Maps link or coordinates</label>
          <textarea
            rows={3}
            value={mapLinkInput}
            onChange={(event) => setMapLinkInput(event.target.value)}
            placeholder={"https://www.google.com/maps/place/...\nor 17.4484, 78.4295"}
            spellCheck={false}
            autoFocus
          />
          <small>In Google Maps, open the place and copy the link from the address bar — or right-click the exact spot and click the coordinates to copy them.</small>
          {mapLinkResult && !mapLinkResult.ok && <div className="site-map-link-result error" role="alert">{mapLinkResult.error}</div>}
          {mapLinkResult?.ok && <div className="site-map-link-result ok" role="status">
            <div>
              {mapLinkResult.placeName && <b>{mapLinkResult.placeName}</b>}
              <span>Latitude <b>{mapLinkResult.lat}</b> · Longitude <b>{mapLinkResult.lng}</b></span>
              <small>Read from the {mapLinkResult.source}{mapLinkResult.source === "map centre" ? " — click the exact place in Google Maps for a precise pin" : ""}. <a href={googleMapsUrl(mapLinkResult.lat, mapLinkResult.lng)} target="_blank" rel="noreferrer">Check on Google Maps ↗</a></small>
            </div>
            <button type="button" className="header-btn primary" onClick={applyMapLink}>Use this location</button>
          </div>}
        </div>}
        <div className="form-row address-autocomplete">
          <label>Address / Area</label>
          <input
            value={form.address}
            onChange={(event) => {
              // In the paste tab the coordinates come from the link, so editing the address text keeps them.
              setForm(locationTab === "search" ? { ...form, address: event.target.value, lat: "", lng: "" } : { ...form, address: event.target.value });
              setAddressSearchEnabled(locationTab === "search");
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
        {saveError && <div className="reseller-save-error" role="alert">{saveError}</div>}
        <div className="modal-actions">
          {editing !== "new" && <button type="button" className="header-btn danger reseller-edit-archive" disabled={createSite.isPending || updateSite.isPending} onClick={() => { setDeleting(editing); setEditing(null); }}>Archive</button>}
          <button type="button" className="header-btn" disabled={createSite.isPending || updateSite.isPending} onClick={() => setEditing(null)}>Cancel</button>
          <button type="submit" className="header-btn primary" disabled={createSite.isPending || updateSite.isPending}>{createSite.isPending || updateSite.isPending ? "Saving..." : "Save"}</button>
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
