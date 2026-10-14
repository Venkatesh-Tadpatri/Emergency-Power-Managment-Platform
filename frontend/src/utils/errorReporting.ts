const apiBase = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

export function reportClientError(error: unknown, source = "browser") {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const payload = JSON.stringify({
    message: normalized.message,
    stack: normalized.stack,
    source,
    url: window.location.href,
    user_agent: navigator.userAgent,
  });

  // Keep error reporting independent from the authenticated Axios client so an
  // expired token or interceptor failure cannot prevent the error being recorded.
  try {
    void fetch(`${apiBase}/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Reporting must never cause another application error.
  }
}

export function installGlobalErrorHandlers() {
  window.addEventListener("error", (event) => reportClientError(event.error || event.message, "window.error"));
  window.addEventListener("unhandledrejection", (event) => reportClientError(event.reason, "unhandledrejection"));
}
