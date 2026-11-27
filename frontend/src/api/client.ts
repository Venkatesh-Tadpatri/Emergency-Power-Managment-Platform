import axios from "axios";
import { reportClientError } from "../utils/errorReporting";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE,
  timeout: 20_000,
});

// Set from AuthTokenBridge (src/auth/AuthTokenBridge.tsx) whenever the OIDC
// access token changes, so every axios call carries a fresh bearer token
// without each call site needing to know about auth.
let currentToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentToken = token;
}

// Registered by the auth provider. Called when the backend rejects the bearer
// token (expired / rotated secret) so the user is sent back to login instead of
// being stuck on the "Loading your portal access..." screen.
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

api.interceptors.request.use((config) => {
  if (currentToken) {
    config.headers.Authorization = `Bearer ${currentToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const sentToken = Boolean(error.config?.headers?.Authorization);
    if (error.response?.status === 401 && sentToken && unauthorizedHandler) {
      unauthorizedHandler();
      return Promise.reject(error);
    }
    const method = error.config?.method?.toUpperCase() || "REQUEST";
    const path = error.config?.url || "unknown URL";
    const status = error.response?.status ? ` (${error.response.status})` : "";
    reportClientError(new Error(`${method} ${path}${status}: ${error.message}`), "axios");
    return Promise.reject(error);
  },
);
