import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

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

export function useMeters(atsIds: string[]) {
  const ids = [...new Set(atsIds.filter(Boolean))];
  const queries = useQueries({
    queries: ids.map((atsId) => ({
      queryKey: ["meters", atsId],
      queryFn: async () => (await api.get<Meter | null>("/api/meters", { params: { ats_id: atsId } })).data,
      staleTime: 30_000,
    })),
  });
  return queries.map((query) => query.data).filter((meter): meter is Meter => Boolean(meter));
}

export function useCreateMeter() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Meter created.", error: "Could not create the meter." },
    mutationFn: async (data: { ats_id: string; make?: string; model?: string }) =>
      (await api.post<Meter>("/api/meters", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meters"] }),
  });
}

export function useUpdateMeter() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Meter updated.", error: "Could not update the meter." },
    mutationFn: async ({ id, data }: { id: string; data: { make?: string; model?: string } }) =>
      (await api.patch<Meter>(`/api/meters/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meters"] }),
  });
}
