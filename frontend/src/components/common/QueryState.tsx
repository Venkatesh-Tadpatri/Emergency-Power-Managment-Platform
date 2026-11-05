type QueryStateProps = {
  title?: string;
  message?: string;
  loading?: boolean;
  onRetry?: () => void;
};

export function QueryState({ title, message, loading = false, onRetry }: QueryStateProps) {
  return (
    <div className={`query-state${loading ? " loading" : " error"}`} role={loading ? "status" : "alert"} aria-live="polite">
      {loading && <span className="query-state-spinner" aria-hidden="true" />}
      <div>
        <b>{title || (loading ? "Loading…" : "We couldn't load this page")}</b>
        {message && <span>{message}</span>}
      </div>
      {!loading && onRetry && <button type="button" className="header-btn primary" onClick={onRetry}>Try again</button>}
    </div>
  );
}
