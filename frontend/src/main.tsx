import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "leaflet/dist/leaflet.css";

import { App } from "./App";
import { LocalAuthProvider } from "./auth/LocalAuth";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { installGlobalErrorHandlers } from "./utils/errorReporting";
import { errorMessage, reportMutationResult, setBusyCheck } from "./utils/notify";
import "./styles/global.css";

// Every create/update/delete/archive/... action reports its outcome. Screens that show their own
// toast keep theirs; otherwise the action's meta.success / server error is shown (utils/notify.ts).
const mutationCache = new MutationCache({
  onSuccess: (_data, _variables, _context, mutation) => {
    const meta = mutation.options.meta;
    if (meta?.silent || meta?.errorsOnly) return;
    reportMutationResult("success", meta?.success || "Changes saved successfully.");
  },
  onError: (error, _variables, _context, mutation) => {
    const meta = mutation.options.meta;
    if (meta?.silent) return;
    // An expired session is handled by signing the user out, not by an error toast.
    if ((error as { response?: { status?: number } })?.response?.status === 401) return;
    reportMutationResult("error", errorMessage(error, meta?.error));
  },
});

const queryClient = new QueryClient({
  mutationCache,
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
setBusyCheck(() => queryClient.isMutating() > 0);
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <LocalAuthProvider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </LocalAuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
