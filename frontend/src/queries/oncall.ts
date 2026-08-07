import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { OnCallShift } from "../types/entities";

export function useOnCallShifts(companyId: string | undefined) {
  return useQuery({
    queryKey: ["oncall", companyId],
    queryFn: async () =>
      (await api.get<OnCallShift[]>("/api/oncall", { params: { company_id: companyId } })).data,
    enabled: !!companyId,
  });
}

export function useCreateOnCallShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<OnCallShift>) =>
      (await api.post<OnCallShift>("/api/oncall", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oncall"] }),
  });
}

export function useUpdateOnCallShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<OnCallShift> }) =>
      (await api.patch<OnCallShift>(`/api/oncall/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oncall"] }),
  });
}

export function useDeleteOnCallShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/api/oncall/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oncall"] }),
  });
}
