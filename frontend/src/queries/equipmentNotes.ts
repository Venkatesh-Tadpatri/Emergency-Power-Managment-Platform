import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

/** A note on one piece of equipment, shared by every user who can view the system. */
export type EquipmentNote = {
  id: string;
  system_id: string;
  record_key: string;
  text: string;
  author_id: string | null;
  author_name: string;
  author_email: string | null;
  author_role: string | null;
  created_at: string;
  /** True when the current user may remove it (its author, or a Super Admin). */
  can_delete: boolean;
};

const notesKey = (systemId: string, recordKey: string) => ["equipment-notes", systemId, recordKey];

export function useEquipmentNotes(systemId: string | undefined, recordKey: string) {
  return useQuery({
    queryKey: notesKey(systemId || "", recordKey),
    enabled: Boolean(systemId),
    queryFn: async () =>
      (await api.get<EquipmentNote[]>(`/api/systems/${systemId}/equipment-notes`, { params: { record_key: recordKey } })).data,
    // Notes are shared, so pick up ones added from other portals without a manual refresh.
    refetchInterval: 30_000,
  });
}

export function useAddEquipmentNote(systemId: string | undefined, recordKey: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: { error: "Could not save the note." },
    mutationFn: async (note: { text: string; created_at?: string }) =>
      (await api.post<EquipmentNote>(`/api/systems/${systemId}/equipment-notes`, { record_key: recordKey, ...note })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(systemId || "", recordKey) }),
  });
}

export function useDeleteEquipmentNote(systemId: string | undefined, recordKey: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: { error: "Could not remove the note." },
    mutationFn: async (noteId: string) => {
      await api.delete(`/api/systems/${systemId}/equipment-notes/${noteId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(systemId || "", recordKey) }),
  });
}
