import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { markToastShown, registerToastSink } from "../../utils/notify";

type ToastItem = { id: number; message: string; variant: "success" | "error" };
type ToastApi = { success: (message: string) => void; error: (message: string) => void };

const ToastContext = createContext<ToastApi | null>(null);
let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const success = useCallback((message: string) => {
    markToastShown();
    const id = nextToastId++;
    setItems((current) => [...current, { id, message, variant: "success" }]);
    window.setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);
  const error = useCallback((message: string) => {
    markToastShown();
    const id = nextToastId++;
    setItems((current) => [...current, { id, message, variant: "error" }]);
    window.setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);
  const value = useMemo(() => ({ success, error }), [success, error]);
  // Lets the app-wide mutation reporter (utils/notify.ts) raise toasts from outside React.
  useEffect(() => { registerToastSink(value); return () => registerToastSink(null); }, [value]);

  return <ToastContext.Provider value={value}>
    {children}
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {items.map((item) => <div className={`app-toast ${item.variant}`} role={item.variant === "error" ? "alert" : "status"} key={item.id}>
        <span className="toast-check" aria-hidden="true">{item.variant === "error" ? "!" : "✓"}</span>
        <div><b>{item.variant === "error" ? "Error" : "Success"}</b><span>{item.message}</span></div>
        <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(item.id)}>×</button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
