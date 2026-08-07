import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";

export interface Meter {
  id: string;
  ats_id: string;
  make?: string | null;
  model?: string | null;
}

export function useMeter(atsId: string | undefined) {
  return useQuery({
    queryKey: ["meters", atsId],
    queryFn: async () => (await api.get<Meter | null>("/api/meters", { params: { ats_id: atsId } })).data,
    enabled: !!atsId,
  });
}

export function useCreateMeter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { ats_id: string; make?: string; model?: string }) =>
      (await api.post<Meter>("/api/meters", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meters"] }),
  });
}

export function useUpdateMeter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { make?: string; model?: string } }) =>
      (await api.patch<Meter>(`/api/meters/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meters"] }),
  });
}
