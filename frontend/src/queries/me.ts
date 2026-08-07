import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import type { Me } from "../types/entities";

export function useMe(enabled: boolean) {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get<Me>("/api/me")).data,
    enabled,
  });
}
