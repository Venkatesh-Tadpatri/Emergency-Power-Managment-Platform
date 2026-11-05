import { useAuth } from "react-oidc-context";

import { setAuthToken } from "../api/client";

/** Keeps api/client.ts's bearer token in sync with the current OIDC session. */
export function AuthTokenBridge() {
  const auth = useAuth();
  // Set this during render, before authenticated route children mount. Using an
  // effect here allowed their first API requests to race ahead without a token,
  // causing a 401/retry delay and a temporary anonymous-looking portal.
  setAuthToken(auth.user?.access_token ?? null);

  return null;
}
