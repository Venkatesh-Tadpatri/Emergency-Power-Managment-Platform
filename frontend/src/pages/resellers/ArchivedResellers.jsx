import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";

import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useMe } from "../../queries/me";
import { useDeleteReseller, useResellers, useUnarchiveReseller } from "../../queries/resellers";

export function ArchivedResellers() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: resellers } = useResellers();
  const unarchiveReseller = useUnarchiveReseller();
  const deleteReseller = useDeleteReseller();
  const [deleting, setDeleting] = useState(null);

  usePageHeader("Archived Resellers", [{ label: "Resellers", onClick: () => navigate("/resellers") }]);

  const canManage = !!me?.permissions.manage_resellers;
  if (!canManage) {
    return <div className="center-screen" style={{ height: "auto", padding: 40 }}>Only superadmins can manage archived resellers.</div>;
  }

  const archived = (resellers || []).filter((r) => r.status === "archived");

  return (
    <>
      <div className="directory-filter-count">{archived.length} archived reseller{archived.length === 1 ? "" : "s"}</div>
      {archived.length === 0 ? (
        <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No archived resellers.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Phone</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {archived.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td>{r.contact_name || "—"}</td>
                <td className="mono">{r.contact_email || "—"}</td>
                <td className="mono">{r.contact_phone || "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button className="header-btn" onClick={() => unarchiveReseller.mutate(r.id)}>Unarchive</button>
                    <button className="header-btn danger" onClick={() => setDeleting(r)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete reseller permanently"
          message={`Permanently delete "${deleting.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => { deleteReseller.mutate(deleting.id); setDeleting(null); }}
        />
      )}
    </>
  );
}
