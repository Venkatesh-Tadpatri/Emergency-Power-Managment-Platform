import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { QueryState } from "../../components/common/QueryState";
import { useMe } from "../../queries/me";
import { removeResellerLogo, uploadResellerLogo, useReseller, useUpdateReseller } from "../../queries/resellers";

export function ResellerBranding() {
  const { resellerId } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { data: me } = useMe(auth.isAuthenticated);
  const resellerQuery = useReseller(resellerId);
  const { data: reseller } = resellerQuery;
  const updateReseller = useUpdateReseller();
  const [logo, setLogo] = useState(null);
  const [reportChoice, setReportChoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  usePageHeader("Branding");

  if (me && (me.role !== "reseller_admin" || me.reseller_id !== resellerId)) return <Navigate to={resellerId ? `/resellers/${resellerId}` : "/"} replace />;
  if (resellerQuery.isPending) return <QueryState loading title="Loading branding..." />;
  if (resellerQuery.isError || !reseller) return <QueryState title="Branding unavailable" message="The reseller branding settings could not be loaded." onRetry={() => resellerQuery.refetch()} />;

  const includeOnReports = reportChoice ?? !!reseller.show_logo_on_reports;
  const cacheReseller = (saved) => {
    queryClient.setQueryData(["resellers", resellerId], saved);
    queryClient.setQueryData(["resellers"], (current) => current?.map((item) => item.id === saved.id ? saved : item));
  };
  const save = async (event) => {
    event.preventDefault();
    if (!resellerId) return;
    setSaving(true);
    setMessage("");
    try {
      let saved = await updateReseller.mutateAsync({ id: resellerId, data: { show_logo_on_reports: includeOnReports } });
      if (logo) saved = await uploadResellerLogo(resellerId, logo);
      cacheReseller(saved);
      setLogo(null);
      setMessage("Branding saved successfully.");
    } catch (error) {
      setMessage(error?.response?.data?.detail || "Branding could not be saved. Please check the logo and try again.");
    } finally { setSaving(false); }
  };

  return <div className="branding-settings-page">
    <div className="section-title">Company Branding</div>
    <p className="section-sub">Manage the logo used in your reseller portal and customer-facing reports.</p>
    <form className="card branding-settings-card" onSubmit={save}>
      <div className="form-row">
        <label>Current company logo</label>
        <div className="branding-logo-stage">
          <img src={reseller.logo_data || "/images/cpc-logo.png"} alt={reseller.logo_data ? `${reseller.name} logo` : "CPC logo"} />
          <div><strong>{reseller.logo_data ? reseller.name : "CPC default branding"}</strong><small>{reseller.logo_data ? "Displayed as your primary portal logo with Powered by CPC." : "Upload a logo to replace CPC as the primary portal logo."}</small></div>
        </div>
      </div>
      <div className="form-row"><label>Upload a new logo</label><input type="file" accept="image/png,image/jpeg" onChange={(event) => setLogo(event.target.files?.[0] || null)} /><small>PNG or JPEG, maximum 2 MB.</small></div>
      <label className="branding-checkbox"><input type="checkbox" checked={includeOnReports} onChange={(event) => setReportChoice(event.target.checked)} /> Include reseller logo on customer reports and PDFs</label>
      <div className="modal-actions">
        {reseller.logo_data && <button type="button" className="header-btn danger" onClick={async () => { if (!resellerId) return; setMessage(""); try { cacheReseller(await removeResellerLogo(resellerId)); setMessage("Logo removed."); } catch { setMessage("Logo could not be removed."); } }}>Remove Logo</button>}
        <button type="submit" className="header-btn primary" disabled={saving}>{saving ? "Saving..." : "Save Branding"}</button>
      </div>
      {message && <div className={`branding-save-message${message.includes("successfully") || message.includes("removed") ? " success" : " error"}`}>{message}</div>}
    </form>
  </div>;
}
