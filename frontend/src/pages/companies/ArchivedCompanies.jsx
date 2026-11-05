import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies, useUnarchiveCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";

export function ArchivedCompanies() {
  const { resellerId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: reseller } = useReseller(resellerId);
  const { data: companies } = useCompanies(resellerId);
  const unarchiveCompany = useUnarchiveCompany();
  const activePath = resellerId ? `/resellers/${resellerId}/companies` : "/companies";
  usePageHeader("Archived Customers", [
    ...(resellerId ? [{ label: "Active Resellers", onClick: () => navigate("/resellers") }, { label: reseller?.name || "", onClick: () => navigate(`/resellers/${resellerId}`) }] : []),
    { label: "Active Customers", onClick: () => navigate(activePath) },
  ]);
  const canManage = !!me?.permissions.create_company;
  const archived = (companies || []).filter((company) => company.status === "archived");
  return <>{archived.length === 0 ? <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No archived customers.</p> : <><div className="directory-filter-count">{archived.length} archived customer{archived.length === 1 ? "" : "s"}</div><table className="data-table"><thead><tr><th>Name</th><th>Address</th><th>Status</th><th /></tr></thead><tbody>{archived.map((company) => <tr key={company.id}><td style={{ fontWeight: 600 }}>{company.name}</td><td>{company.address || "—"}</td><td>Archived</td><td style={{ textAlign: "right" }}>{canManage && <button className="header-btn" onClick={() => unarchiveCompany.mutate(company.id)} disabled={unarchiveCompany.isPending}>Unarchive</button>}</td></tr>)}</tbody></table></>}</>;
}
