import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "react-oidc-context";
import "leaflet/dist/leaflet.css";

import { App } from "./App";
import { oidcConfig } from "./auth/oidcConfig";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { installGlobalErrorHandlers } from "./utils/errorReporting";
import "./styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep recently viewed portfolio data on screen while it refreshes. This avoids
      // flashing false zero/empty states when navigating back through the hierarchy.
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider {...oidcConfig}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
