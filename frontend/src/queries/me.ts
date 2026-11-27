import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import type { Me } from "../types/entities";

export function useMe(enabled: boolean) {
  return useQuery({
    queryKey: ["me"],
    // This request also verifies the token and provisions/refreshes the local
    // user profile.  It can legitimately take longer than ordinary API reads
    // when the identity service or customer tunnel is under load.  A 10-second
    // override was aborting successful requests and showing the portal error
    // screen even though the backend later completed them with HTTP 200.
    queryFn: async () => (await api.get<Me>("/api/me", { timeout: 60_000 })).data,
    enabled,
    staleTime: 5 * 60_000,
    // A 401 means the token is dead; the API client already signs the user out.
    retry: (count, error: any) => error?.response?.status !== 401 && count < 3,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
    refetchOnReconnect: "always",
  });
}
