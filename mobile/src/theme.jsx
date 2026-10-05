import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";

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
  amber: "#d97706",
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
  amber: "#f59e0b",
  cyan: "#22d3ee",
  statusBar: "light-content",
};

const THEME_KEY = "cpc.theme";
const ThemeContext = createContext({ theme: darkTheme, toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  // Match the web app: dark is the default, while an explicit light selection is
  // remembered on the device for later launches and sign-ins.
  const [mode, setMode] = useState("dark");

  useEffect(() => {
    SecureStore.getItemAsync(THEME_KEY)
      .then((savedMode) => {
        if (savedMode === "light" || savedMode === "dark") setMode(savedMode);
      })
      .catch(() => {});
  }, []);

  const theme = mode === "dark" ? darkTheme : lightTheme;
  const toggleTheme = () => setMode((current) => {
    const next = current === "dark" ? "light" : "dark";
    SecureStore.setItemAsync(THEME_KEY, next).catch(() => {});
    return next;
  });
  const value = useMemo(() => ({ theme, toggleTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
