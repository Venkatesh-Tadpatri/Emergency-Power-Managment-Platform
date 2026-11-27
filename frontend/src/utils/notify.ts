/**
 * App-wide success/error notifications for every data-changing action.
 *
 * Every mutation in queries/*.ts declares `meta.success` (and optionally `meta.error`) messages.
 * The MutationCache handlers in main.tsx call `reportMutationResult` after each action settles.
 * Screens that already show their own, more specific toast win: the automatic message is held
 * back briefly (and while follow-up actions in the same flow are still running), then dropped if
 * any toast appeared after the action finished. So nothing goes silent and nothing doubles up.
 */

type ToastSink = { success: (message: string) => void; error: (message: string) => void };

let sink: ToastSink | null = null;
let lastToastAt = 0;

/** Called by ToastProvider so code outside React can raise toasts. */
export function registerToastSink(next: ToastSink | null) {
  sink = next;
}

/** Called by ToastProvider whenever any toast is shown (screen-level or automatic). */
export function markToastShown() {
  lastToastAt = performance.now();
}

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** Shown when the action succeeds and the screen did not show its own message. */
      success?: string;
      /** Fallback when the server gives no readable reason. */
      error?: string;
      /** Never notify. */
      silent?: boolean;
      /** Report failures only (background auto-save that runs on every edit). */
      errorsOnly?: boolean;
    };
  }
}

type Pending = { variant: "success" | "error"; message: string; settledAt: number };
const queue: Pending[] = [];
let timer: number | undefined;
let isBusy: () => boolean = () => false;

/** Let the reporter know whether other actions are still in flight (chained flows). */
export function setBusyCheck(check: () => boolean) {
  isBusy = check;
}

const GRACE_MS = 450;

function flush() {
  timer = undefined;
  if (isBusy()) { schedule(); return; }
  const items = queue.splice(0);
  // A screen-level toast shown after these actions settled already told the user the outcome.
  const unreported = items.filter((item) => item.settledAt > lastToastAt);
  if (!unreported.length || !sink) return;
  const errors = unreported.filter((item) => item.variant === "error");
  if (errors.length) {
    [...new Set(errors.map((item) => item.message))].forEach((message) => sink!.error(message));
    return;
  }
  // Several successes in one flow (e.g. save + push) collapse into the last, most specific one.
  sink.success(unreported[unreported.length - 1].message);
}

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(flush, GRACE_MS);
}

/** Readable reason from an API error (FastAPI `detail` string or validation list). */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail.charAt(0).toUpperCase() + detail.slice(1);
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string; loc?: unknown[] };
    const last = Array.isArray(first?.loc) ? String(first.loc[first.loc.length - 1] ?? "") : "";
    // "body"/"query" mean a whole-form rule (e.g. breaker ratings), not a single field.
    const field = ["body", "query", "path"].includes(last) ? "" : last;
    if (first?.msg) return field ? `${field.replace(/_/g, " ")}: ${first.msg}` : first.msg;
  }
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That item no longer exists. Refresh and try again.";
  if (!(error as { response?: unknown })?.response) return "Could not reach the server. Check your connection and try again.";
  return fallback;
}

export function reportMutationResult(variant: "success" | "error", message: string) {
  queue.push({ variant, message, settledAt: performance.now() });
  schedule();
}
