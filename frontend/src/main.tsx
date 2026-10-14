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

const queryClient = new QueryClient();
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
