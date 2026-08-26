import { createContext, useContext, useMemo, useState } from "react";

export const lightTheme = {
  mode: "light",
  bg: "#f6f8fc",
  surface: "#ffffff",
  surface2: "#f1f5f9",
  border: "#e2e8f0",
  text: "#0f172a",
  textDim: "#64748b",
  textMuted: "#94a3b8",
  blue: "#2563eb",
  blueSoft: "#eff6ff",
  green: "#16a34a",
  greenSoft: "#dcfce7",
  red: "#dc2626",
  redSoft: "#fee2e2",
  purple: "#7c3aed",
  cyan: "#0891b2",
  statusBar: "dark-content",
};

export const darkTheme = {
  mode: "dark",
  bg: "#06111f",
  surface: "#09192b",
  surface2: "#0c2037",
  border: "#1c3856",
  text: "#edf5ff",
  textDim: "#a8bed5",
  textMuted: "#718ba7",
  blue: "#3b82f6",
  blueSoft: "#0f2740",
  green: "#22c55e",
  greenSoft: "#0f2e1c",
  red: "#f87171",
  redSoft: "#3a1414",
  purple: "#a78bfa",
  cyan: "#22d3ee",
  statusBar: "light-content",
};

const ThemeContext = createContext({ theme: lightTheme, toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState("light");
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const toggleTheme = () => setMode((m) => (m === "dark" ? "light" : "dark"));
  const value = useMemo(() => ({ theme, toggleTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
