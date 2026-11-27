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

/** Duplicate-email check for the Create User form (emails are unique platform-wide). */
export async function checkEmailAvailable(email: string): Promise<boolean> {
  const res = await api.get<{ available: boolean }>("/api/users/check-email", { params: { email } });
  return res.data.available;
}

export type CreateUserInput = {
  first_name: string;
  last_name: string;
  email: string;
  contact_number: string;
  reseller_id?: string | null;
  company_id?: string | null;
};
export type CreateUserResult = { user: AppUser; email_sent: boolean; message: string };

/** Admin creates an account; the user is emailed and activates it via First-time login. */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "User account created.", error: "Could not create the user." },
    mutationFn: async (data: CreateUserInput) => (await api.post<CreateUserResult>("/api/users", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useResendInvite() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Account email sent again.", error: "Could not resend the account email." },
    mutationFn: async (userId: string) => (await api.post<CreateUserResult>(`/api/users/${userId}/resend-invite`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

/** Deletes an account that was created but never activated. */
export function useCancelInvite() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "User account deleted.", error: "Could not delete the user account." },
    mutationFn: async (userId: string) => api.delete(`/api/users/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useAssignRole() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "User role updated.", error: "Could not update the user's role." },
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

export function useAssignSystems() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "User access updated.", error: "Could not update the user's site/system access." },
    mutationFn: async ({ userId, systemIds, siteIds = [] }: { userId: string; systemIds: string[]; siteIds?: string[] }) =>
      (await api.patch<AppUser>(`/api/users/${userId}/assigned-systems`, { system_ids: systemIds, site_ids: siteIds })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

/** Deactivate ("suspended") or reactivate ("active") an activated account. History is kept. */
export function useSetUserState() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "User status updated.", error: "Could not update the user's status." },
    mutationFn: async ({ userId, accountState }: { userId: string; accountState: "active" | "suspended" }) =>
      (await api.patch<AppUser>(`/api/users/${userId}/state`, { account_state: accountState })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

/** Permanently deletes a deactivated account (Super Admin only; enforced by the server). */
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "User deleted.", error: "Could not delete the user." },
    mutationFn: async (userId: string) => api.delete(`/api/users/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}
