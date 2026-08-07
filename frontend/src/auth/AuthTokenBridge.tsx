import { useEffect } from "react";
import { useAuth } from "react-oidc-context";

import { setAuthToken } from "../api/client";

/** Keeps api/client.ts's bearer token in sync with the current OIDC session. */
export function AuthTokenBridge() {
  const auth = useAuth();

  useEffect(() => {
    setAuthToken(auth.user?.access_token ?? null);
  }, [auth.user?.access_token]);

  return null;
}
