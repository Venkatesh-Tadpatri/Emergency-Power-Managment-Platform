import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { InfoCard } from "../../components/common/StatCard";
import { IconBuilding } from "../../components/common/Icons";
import { usePageHeader } from "../../components/layout/HeaderContext";
import { useCompanies } from "../../queries/companies";
import { useResellers } from "../../queries/resellers";
import { useSystems } from "../../queries/systems";

export function CompaniesList() {
    const navigate = useNavigate();
    const { data: companies } = useCompanies();
    const { data: resellers } = useResellers();
    const { data: systems } = useSystems();
    const [nameFilter, setNameFilter] = useState("");
    const [resellerFilter, setResellerFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    usePageHeader("Customers");
    const filteredCompanies = (companies || []).filter((company) => {
        const matchesName = company.name.toLowerCase().includes(nameFilter.trim().toLowerCase());
        const matchesReseller = resellerFilter === "all" || company.reseller_id === resellerFilter;
        const matchesStatus = statusFilter === "all" || company.status === statusFilter;
        return matchesName && matchesReseller && matchesStatus;
    });
    return (_jsxs("div", { className: "companies-directory", children: [_jsxs("div", { className: "directory-filters", children: [_jsx("input", { value: nameFilter, onChange: (event) => setNameFilter(event.target.value), placeholder: "Filter by customer name..." }), _jsxs("select", { value: resellerFilter, onChange: (event) => setResellerFilter(event.target.value), children: [_jsx("option", { value: "all", children: "All resellers" }), (resellers || []).map((reseller) => (_jsx("option", { value: reseller.id, children: reseller.name }, reseller.id)))] }), _jsxs("select", { value: statusFilter, onChange: (event) => setStatusFilter(event.target.value), children: [_jsx("option", { value: "all", children: "All statuses" }), _jsx("option", { value: "active", children: "Active" }), _jsx("option", { value: "archived", children: "Archived" })] }), (nameFilter || resellerFilter !== "all" || statusFilter !== "all") && (_jsx("button", { className: "header-btn", onClick: () => { setNameFilter(""); setResellerFilter("all"); setStatusFilter("all"); }, children: "Clear filters" }))] }), _jsx("div", { className: "directory-filter-count", children: `${filteredCompanies.length} of ${(companies || []).length} customers` }), _jsx("div", { className: "card-grid", children: filteredCompanies.map((company) => {
                    const companySystems = (systems || []).filter((system) => system.company_id === company.id);
                    const normal = companySystems.filter((system) => system.status === "normal").length;
                    const reseller = (resellers || []).find((item) => item.id === company.reseller_id);
                    return (_jsx(InfoCard, { title: company.name, subtitle: reseller?.name || "Independent customer", status: company.status, icon: IconBuilding, stats: [
                            { label: "Systems", value: companySystems.length, color: "var(--blue)" },
                            { label: "Normal", value: normal, color: "var(--green)" },
                            { label: "Events", value: companySystems.length - normal, color: "var(--red)" },
                        ], onClick: () => navigate(`/companies/${company.id}`) }, company.id));
                }) })] }));
}
