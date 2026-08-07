import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { AppUser } from "../types/entities";

export function useUsers(companyId: string | undefined) {
  return useQuery({
    queryKey: ["users", companyId],
    queryFn: async () =>
      (await api.get<AppUser[]>("/api/users", { params: { company_id: companyId } })).data,
    enabled: !!companyId,
  });
}

export function useUsersByReseller(resellerId: string | undefined) {
  return useQuery({
    queryKey: ["users", "reseller", resellerId],
    queryFn: async () =>
      (await api.get<AppUser[]>("/api/users", { params: { reseller_id: resellerId } })).data,
    enabled: !!resellerId,
  });
}

/** Platform-wide user list — superadmin only; the backend rejects this for anyone else. */
export function useAllUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["users", "all"],
    queryFn: async () => (await api.get<AppUser[]>("/api/users")).data,
    enabled,
  });
}

/** Finds a signed-up-but-unassigned user by exact email, so they can be given a role. */
export async function lookupUnassignedUser(email: string): Promise<AppUser | null> {
  const res = await api.get<AppUser | null>("/api/users/lookup", { params: { email } });
  return res.data;
}

export function useAssignRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      role,
      scopeType,
      resellerId,
      companyId,
    }: {
      userId: string;
      role: string;
      scopeType?: string | null;
      resellerId?: string | null;
      companyId?: string | null;
    }) =>
      (
        await api.patch<AppUser>(`/api/users/${userId}/role`, {
          role,
          scope_type: scopeType ?? null,
          reseller_id: resellerId ?? null,
          company_id: companyId ?? null,
        })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}
