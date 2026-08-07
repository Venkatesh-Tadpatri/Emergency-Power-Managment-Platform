import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface HeaderState {
  title: string;
  breadcrumb: { label: string; onClick?: () => void }[];
}

interface HeaderContextValue extends HeaderState {
  setHeader: (title: string, breadcrumb?: HeaderState["breadcrumb"]) => void;
}

const HeaderContext = createContext<HeaderContextValue | null>(null);

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HeaderState>({ title: "Dashboard", breadcrumb: [] });

  const setHeader: HeaderContextValue["setHeader"] = (title, breadcrumb = []) =>
    setState({ title, breadcrumb });

  return (
    <HeaderContext.Provider value={{ ...state, setHeader }}>{children}</HeaderContext.Provider>
  );
}

export function useHeader() {
  const ctx = useContext(HeaderContext);
  if (!ctx) throw new Error("useHeader must be used within HeaderProvider");
  return ctx;
}

/** Convenience hook: call once per page to set the header title/breadcrumb. */
export function usePageHeader(title: string, breadcrumb: HeaderState["breadcrumb"] = []) {
  const { setHeader } = useHeader();
  const key = title + JSON.stringify(breadcrumb.map((b) => b.label));
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current !== key) {
      last.current = key;
      setHeader(title, breadcrumb);
    }
  });
}
