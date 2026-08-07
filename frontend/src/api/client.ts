import axios from "axios";

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
