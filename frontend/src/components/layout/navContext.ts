import { useLocation } from "react-router-dom";

export type NavContextState = { contextPath: string; contextBreadcrumb: { label: string; path: string }[] };

// Last hierarchy context seen, and the page it belongs to. Module-level so the Sidebar and Header
// agree on it without extra providers.
let remembered: { pathname: string; state: NavContextState } | null = null;

// The context the sidebar is currently showing (published by Sidebar on every render), so links
// outside the sidebar — e.g. the header's profile menu — can carry the user's place with them.
let current: NavContextState | null = null;
export function setCurrentNavContext(state: NavContextState | null) { current = state; }
/** Router `state` for a navigation that should keep the current reseller/customer/site/system. */
export function currentNavState(): NavContextState | undefined { return current ?? undefined; }

const isNavContext = (value: unknown): value is NavContextState =>
  !!value && typeof (value as NavContextState).contextPath === "string";

/**
 * The reseller → customer → site → system context a sidebar option was opened from.
 *
 * It travels in router state, but in-page URL updates (tab switches, filter changes via
 * setSearchParams) replace the history entry without that state. While the pathname is unchanged
 * we therefore keep the remembered context; navigating to a different page without state clears it.
 */
export function useNavContext(): NavContextState | null {
  const location = useLocation();
  if (isNavContext(location.state)) {
    remembered = { pathname: location.pathname, state: location.state };
    return location.state;
  }
  if (remembered && remembered.pathname === location.pathname) return remembered.state;
  remembered = null;
  return null;
}
