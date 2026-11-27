import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import type { AppUser, Company, Reseller, Site, System } from "../types/entities";

/**
 * Data for the header's global search. Each query uses the same cache key as
 * the page-level hooks (useResellers, useCompanies, useSites, useSystems,
 * useAllUsers), so results are shared with the rest of the app and nothing is
 * fetched until the search box is first used (`enabled`).
 * The API already scopes every list to what the signed-in user may see.
 */
export function useGlobalSearchData(enabled: boolean, role?: string | null) {
  const canSeeResellers = role === "superadmin" || role === "reseller_admin";
  const resellers = useQuery({
    queryKey: ["resellers"],
    queryFn: async () => (await api.get<Reseller[]>("/api/resellers")).data,
    enabled: enabled && canSeeResellers,
  });
  const companies = useQuery({
    queryKey: ["companies", { resellerId: undefined }],
    queryFn: async () => (await api.get<Company[]>("/api/companies", { params: {} })).data,
    enabled,
  });
  const sites = useQuery({
    queryKey: ["sites", { customerId: undefined }],
    queryFn: async () => (await api.get<Site[]>("/api/sites", { params: {} })).data,
    enabled,
  });
  const systems = useQuery({
    queryKey: ["systems", { companyId: undefined, siteId: undefined, includeArchived: false }],
    queryFn: async () => (await api.get<System[]>("/api/systems", { params: {} })).data,
    staleTime: 30_000,
    enabled,
  });
  const users = useQuery({
    queryKey: ["users", "all"],
    queryFn: async () => (await api.get<AppUser[]>("/api/users")).data,
    enabled: enabled && role === "superadmin",
  });
  return {
    resellers: canSeeResellers ? resellers.data || [] : [],
    companies: companies.data || [],
    sites: sites.data || [],
    systems: systems.data || [],
    users: role === "superadmin" ? users.data || [] : [],
    isLoading: [resellers, companies, sites, systems, users].some((query) => query.isFetching && !query.data),
  };
}
