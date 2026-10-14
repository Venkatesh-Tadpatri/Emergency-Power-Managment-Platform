import axios from "axios";
import { reportClientError } from "../utils/errorReporting";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE,
});

// Set from AuthTokenBridge (src/auth/AuthTokenBridge.tsx) whenever the OIDC
// access token changes, so every axios call carries a fresh bearer token
// without each call site needing to know about auth.
let currentToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentToken = token;
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
    const method = error.config?.method?.toUpperCase() || "REQUEST";
    const path = error.config?.url || "unknown URL";
    const status = error.response?.status ? ` (${error.response.status})` : "";
    reportClientError(new Error(`${method} ${path}${status}: ${error.message}`), "axios");
    return Promise.reject(error);
  },
);
