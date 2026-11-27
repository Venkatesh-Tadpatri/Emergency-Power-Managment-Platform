import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setAuthToken, setUnauthorizedHandler } from "../api/client";

const TOKEN_KEY = "cpc.localAccessToken";
const EMAIL_KEY = "cpc.localUserEmail";

type LocalUser = { access_token: string; profile: { email?: string; name?: string; preferred_username?: string } };
type AuthValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: LocalUser | null;
  login: (token: string, email: string) => void;
  signinRedirect: () => Promise<void>;
  signoutRedirect: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function clearStoredSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
  } catch { /* storage unavailable */ }
}

function isExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp * 1000 <= Date.now();
  } catch { return false; }
}

function storedUser(): LocalUser | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    if (isExpired(token)) { clearStoredSession(); return null; }
    return { access_token: token, profile: { email: localStorage.getItem(EMAIL_KEY) || undefined } };
  } catch { return null; }
}

export function LocalAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(() => storedUser());
  setAuthToken(user?.access_token ?? null);
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearStoredSession();
      setAuthToken(null);
      setUser(null);
      if (window.location.pathname !== "/login") window.location.assign("/login");
    });
    return () => setUnauthorizedHandler(null);
  }, []);
  const value = useMemo<AuthValue>(() => ({
    isLoading: false,
    isAuthenticated: Boolean(user),
    user,
    login(token, email) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(EMAIL_KEY, email);
      setAuthToken(token);
      setUser({ access_token: token, profile: { email } });
    },
    async signinRedirect() { window.location.assign("/login"); },
    async signoutRedirect() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
      setAuthToken(null);
      setUser(null);
      window.location.assign("/login");
    },
  }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside LocalAuthProvider");
  return auth;
}
