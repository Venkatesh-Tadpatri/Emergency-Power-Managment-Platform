import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";
import { InfoCard } from "../../components/common/StatCard";
import { IconResellers } from "../../components/common/Icons";
import { Modal } from "../../components/common/Modal";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { removeResellerLogo, uploadResellerLogo, useArchiveReseller, useCreateReseller, useResellers, useUpdateReseller } from "../../queries/resellers";
import { useSites, useSystems } from "../../queries/systems";
import { getWorstStatus } from "../../utils/customerCardStats";

const blank = { name: "", contact_name: "", contact_email: "", contact_phone: "", show_logo_on_reports: false };

export function ResellersList() {
  const navigate = useNavigate(), [params] = useSearchParams(), auth = useAuth();
  const queryClient = useQueryClient();
  const { data: me } = useMe(auth.isAuthenticated), { data: resellers } = useResellers(), { data: companies } = useCompanies(), { data: systems } = useSystems(), { data: sites } = useSites();
  const create = useCreateReseller(), update = useUpdateReseller(), archive = useArchiveReseller();
  const [editing, setEditing] = useState(null), [archiving, setArchiving] = useState(null), [form, setForm] = useState(blank), [logo, setLogo] = useState(null);
  usePageHeader("Active Resellers");
  if (me?.role === "reseller_admin" && me.reseller_id) return <Navigate to={`/resellers/${me.reseller_id}`} replace />;
  const search = (params.get("search") || "").trim().toLowerCase();
  const rows = (resellers || []).filter(r => r.status !== "archived" && (!search || r.name.toLowerCase().includes(search)));
  const rids = new Set(rows.map(r => r.id)), cs = (companies || []).filter(c => rids.has(c.reseller_id)), cids = new Set(cs.map(c => c.id));
  const ss = (systems || []).filter(s => cids.has(s.company_id)), siteRows = (sites || []).filter(s => s.status !== "archived" && cids.has(s.customer_id));
  const totals = [["Total Resellers", rows.length, "purple"], ["Total Customers", cs.length, "blue"], ["Total Sites", siteRows.length, "amber"], ["Total Systems", ss.length, "cyan"]];
  const edit = (r, e) => { e?.stopPropagation(); setEditing(r); setLogo(null); setForm(r === "new" ? blank : { name:r.name, contact_name:r.contact_name||"", contact_email:r.contact_email||"", contact_phone:r.contact_phone||"", show_logo_on_reports:!!r.show_logo_on_reports }); };
  const submit = async e => { e.preventDefault(); const data = {...form, contact_name:form.contact_name||undefined, contact_email:form.contact_email||undefined, contact_phone:form.contact_phone||undefined}; const saved = editing === "new" ? await create.mutateAsync(data) : await update.mutateAsync({id:editing.id,data}); if (logo) { await uploadResellerLogo(saved.id, logo); await queryClient.invalidateQueries({queryKey:["resellers"]}); } setEditing(null); };
  return <>
    {!!me?.permissions.manage_resellers && <div className="section-header"><div/><button className="header-btn primary" onClick={() => edit("new")}>+ New Reseller</button></div>}
    <div className="reseller-total-strip">{totals.map(([l,v,t]) => <div className={`reseller-total-item ${t}`} key={l}><span>{l}</span><strong>{v}</strong></div>)}</div>
    <div className="card-grid">{rows.map(r => { const rc=(companies||[]).filter(c=>c.reseller_id===r.id), rs=(systems||[]).filter(s=>rc.some(c=>c.id===s.company_id)), rst=(sites||[]).filter(s=>s.status!=="archived"&&rc.some(c=>c.id===s.customer_id)), off=rs.filter(s=>s.status==="offline").length; return <div className="reseller-card-shell" key={r.id}><InfoCard title={r.name} status={getWorstStatus(rs)} icon={IconResellers} stats={[{label:"Customers",value:rc.length,color:"var(--blue)"},{label:"Sites",value:rst.length,color:"var(--cyan)"},{label:"Total systems",value:rs.length,color:"var(--cyan)"},{label:"Offline devices",value:off,color:off?"var(--red)":"var(--green)"}]} onClick={()=>navigate(`/resellers/${r.id}`)}/>{!!me?.permissions.manage_resellers&&<div className="reseller-card-actions"><button className="header-btn" onClick={e=>edit(r,e)}>Edit</button></div>}</div>; })}</div>
    {archiving && <ConfirmDialog title="Archive reseller" message={`Archive "${archiving.name}"? It will be moved to Archived Resellers.`} confirmLabel="Archive" onCancel={()=>setArchiving(null)} onConfirm={()=>{archive.mutate(archiving.id);setArchiving(null);}}/>}
    {editing && <Modal title={editing==="new"?"New Reseller":"Edit Reseller"} onClose={()=>setEditing(null)}><form onSubmit={submit}>
      <div className="form-row"><label>Company Name *</label><input required minLength={2} maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} autoFocus/></div>
      <div className="form-row"><label>Primary Contact Name</label><input value={form.contact_name} onChange={e=>setForm({...form,contact_name:e.target.value})}/></div>
      <div className="form-row"><label>Contact Email</label><input type="email" value={form.contact_email} onChange={e=>setForm({...form,contact_email:e.target.value})}/></div>
      <div className="form-row"><label>Contact Phone</label><input type="tel" value={form.contact_phone} onChange={e=>setForm({...form,contact_phone:e.target.value})}/></div>
      <div className="form-row"><label>Brand logo (optional)</label>{editing!=="new"&&editing.logo_data&&<img className="reseller-logo-preview" src={editing.logo_data} alt={`${editing.name} logo`}/>}<input type="file" accept="image/png,image/jpeg" onChange={e=>setLogo(e.target.files?.[0]||null)}/><small>PNG or JPEG, up to 2 MB. This becomes the primary navigation logo for the reseller and its customers.</small></div>
      <label className="branding-checkbox"><input type="checkbox" checked={form.show_logo_on_reports} onChange={e=>setForm({...form,show_logo_on_reports:e.target.checked})}/> Include reseller logo on customer reports and PDFs</label>
      <div className="modal-actions">{editing!=="new"&&editing.logo_data&&<button type="button" className="header-btn" onClick={async()=>{await removeResellerLogo(editing.id);setEditing({...editing,logo_data:null});}}>Remove logo</button>}{editing!=="new"&&<button type="button" className="header-btn danger reseller-edit-archive" onClick={()=>{setArchiving(editing);setEditing(null);}}>Archive</button>}<button type="button" className="header-btn" onClick={()=>setEditing(null)}>Cancel</button><button type="submit" className="header-btn primary">Save</button></div>
    </form></Modal>}
  </>;
}
