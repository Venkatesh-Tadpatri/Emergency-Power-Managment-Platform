import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { currentNavState, useNavContext } from "./navContext";
import { useAuth } from "../../auth/LocalAuth";

import { IconAlert, IconBell, IconBuilding, IconDashboard, IconMap, IconPanel, IconResellers, IconSearch, IconSettings, IconUsers } from "../common/Icons";
import { useAlarms } from "../../queries/alarms";
import { useCompany } from "../../queries/companies";
import { useMe } from "../../queries/me";
import { useReseller } from "../../queries/resellers";
import { useGlobalSearchData } from "../../queries/search";
import { activeAlarmOnly } from "../../utils/alarmClassification";
import { useHeader } from "./HeaderContext";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  reseller_admin: "Reseller Admin",
  company_admin: "Customer Admin",
  system_operator: "System Operator",
  system_viewer: "System Viewer",
};

const SEARCH_LIMIT_PER_GROUP = 5;

type SearchResult = { key: string; title: string; subtitle: string; path: string };
type SearchGroup = { label: string; icon: ComponentType<{ size?: number }>; results: SearchResult[] };

export function Header() {
  const { title, breadcrumb: pageBreadcrumb } = useHeader();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // When a sidebar option was opened from a reseller/customer/site/system context (see Sidebar's
  // `go`), keep showing that full context trail instead of the page's own shorter breadcrumb.
  const navContext = useNavContext();
  const savedContextBreadcrumb = navContext && navContext.contextPath !== location.pathname
    ? navContext.contextBreadcrumb.map((item) => ({ label: item.label, onClick: () => navigate(item.path) }))
    : null;
  const breadcrumb = savedContextBreadcrumb?.length ? savedContextBreadcrumb : pageBreadcrumb;
  const { data: me } = useMe(auth.isAuthenticated);
  const { data: reseller } = useReseller(me?.reseller_id || undefined);
  const { data: company } = useCompany(me?.company_id || undefined);
  const { data: alarms } = useAlarms(
    {
      resellerId: me?.role === "reseller_admin" ? me.reseller_id ?? undefined : undefined,
      companyId: me?.role && ["company_admin", "system_operator", "system_viewer"].includes(me.role) ? me.company_id ?? undefined : undefined,
    },
    { enabled: me?.role === "superadmin" || !!me?.reseller_id || !!me?.company_id }
  );
  const activeAlarms = activeAlarmOnly(alarms);
  const activeCount = activeAlarms.length;
  const unackedCount = activeAlarms.filter((alarm) => !alarm.ack_by).length;
  const previewAlarms = [...activeAlarms]
    .sort((a, b) => Number(!!a.ack_by) - Number(!!b.ack_by) || new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, 5);
  // Zitadel's ID token here doesn't carry name/email claims — `me` (from our own
  // /api/me, backed by the UserInfo-endpoint fetch) is the reliable source.
  const displayName = me?.display_name || me?.email || auth.user?.profile.name || auth.user?.profile.email;
  const displayEmail = me?.email || auth.user?.profile.email;
  const roleLabel = me ? (me.role && ROLE_LABEL[me.role]) || "No role assigned" : "Signed in";
  const firstName = (displayName || "there").split(/[\s@]/)[0];
  const headingDetails = {
    Dashboard: { icon: IconDashboard, subtitle: `Welcome back, ${firstName}!` },
    "Active Resellers": { icon: IconResellers, subtitle: "View and manage active reseller partners across your organization" },
    "Active Customers": { icon: IconBuilding, subtitle: "View and manage active customers across your organization" },
    "Archived Customers": { icon: IconBuilding, subtitle: "Review and restore archived customers" },
    "Archived Sites": { icon: IconMap, subtitle: "Review, restore, or permanently delete archived sites" },
    "Platform Users": { icon: IconUsers, subtitle: "Manage access, roles, and organization scope" },
    "Map View": { icon: IconMap, subtitle: "Monitor facilities and systems across the network" },
    Alarms: { icon: IconAlert, subtitle: "Review active events and power-system alerts" },
    Analytics: { icon: IconDashboard, subtitle: "Explore operational performance and system insights" },
    Settings: { icon: IconSettings, subtitle: "Configure platform preferences and integrations" },
  }[title] || { icon: IconDashboard, subtitle: "Critical Power Command" };
  const HeadingIcon = headingDetails.icon;

  const [menuOpen, setMenuOpen] = useState(false);
  const [alarmOpen, setAlarmOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  // Dark is the application default. Once a user explicitly selects light mode,
  // preserve that preference instead of resetting it on every page load/login.
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("cpc-theme") !== "light");
  const menuRef = useRef<HTMLDivElement>(null);
  const alarmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.toggle("dark-dashboard", darkMode);
    localStorage.setItem("cpc-theme", darkMode ? "dark" : "light");
    return () => document.body.classList.remove("dark-dashboard");
  }, [darkMode]);

  // Global search: one box that finds resellers, customers, sites, systems and
  // (for superadmins) users. Data loads the first time the box is focused and
  // is already scoped by the API to what this user is allowed to see.
  const [searchUsed, setSearchUsed] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchData = useGlobalSearchData(searchUsed && auth.isAuthenticated, me?.role);
  const searchQuery = searchText.trim().toLowerCase();

  const searchGroups = useMemo<SearchGroup[]>(() => {
    if (!searchQuery) return [];
    const resellerById = new Map(searchData.resellers.map((item) => [item.id, item.name]));
    const companyById = new Map(searchData.companies.map((item) => [item.id, item]));
    // Name matches beat secondary-field matches; exact > prefix > substring.
    const rank = (values: (string | null | undefined)[]) => {
      let best = -1;
      values.forEach((value, index) => {
        const text = value?.toLowerCase();
        if (!text) return;
        const score = text === searchQuery ? 4 : text.startsWith(searchQuery) ? 3 : text.includes(searchQuery) ? 2 : -1;
        if (score > 0) best = Math.max(best, index === 0 ? score + 3 : score);
      });
      return best;
    };
    function pick<T>(items: T[], fields: (item: T) => (string | null | undefined)[], toResult: (item: T) => SearchResult): SearchResult[] {
      return items
        .map((item) => ({ item, score: rank(fields(item)) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, SEARCH_LIMIT_PER_GROUP)
        .map((entry) => toResult(entry.item));
    }
    const groups: SearchGroup[] = [
      {
        label: "Resellers",
        icon: IconResellers,
        results: pick(searchData.resellers.filter((item) => item.status !== "archived"), (item) => [item.name, item.contact_name], (item) => ({
          key: `reseller-${item.id}`, title: item.name, subtitle: item.contact_name || "Reseller", path: `/resellers/${item.id}/companies`,
        })),
      },
      {
        label: "Customers",
        icon: IconBuilding,
        results: pick(searchData.companies.filter((item) => item.status !== "archived"), (item) => [item.name, item.address, item.contact_name], (item) => ({
          key: `customer-${item.id}`, title: item.name, subtitle: [resellerById.get(item.reseller_id), item.address].filter(Boolean).join(" · ") || "Customer", path: `/companies/${item.id}`,
        })),
      },
      {
        label: "Sites",
        icon: IconMap,
        results: pick(searchData.sites.filter((item) => item.status !== "archived"), (item) => [item.name, item.address], (item) => ({
          key: `site-${item.id}`, title: item.name, subtitle: [companyById.get(item.customer_id)?.name, item.address].filter(Boolean).join(" · ") || "Site", path: `/companies/${item.customer_id}/sites/${item.id}`,
        })),
      },
      {
        label: "Systems",
        icon: IconPanel,
        results: pick(searchData.systems.filter((item) => !item.archived), (item) => [item.name, item.site_name], (item) => ({
          key: `system-${item.id}`, title: item.name, subtitle: [item.site_name, companyById.get(item.company_id)?.name].filter(Boolean).join(" · ") || "System", path: `/systems/${item.id}`,
        })),
      },
      {
        label: "Users",
        icon: IconUsers,
        results: pick(searchData.users, (item) => [item.display_name, item.email], (item) => ({
          key: `user-${item.id}`, title: item.display_name || item.email, subtitle: [item.email, item.role ? ROLE_LABEL[item.role] : "Unassigned"].join(" · "), path: `/users?search=${encodeURIComponent(item.email)}`,
        })),
      },
    ];
    return groups.filter((group) => group.results.length > 0);
  }, [searchQuery, searchData.resellers, searchData.companies, searchData.sites, searchData.systems, searchData.users]);
  const flatResults = searchGroups.flatMap((group) => group.results);

  useEffect(() => {
    setSearchText("");
    setSuggestOpen(false);
  }, [location.pathname]);

  useEffect(() => { setActiveIndex(0); }, [searchQuery]);

  // The results panel is right-aligned under the search box and grows leftwards to fit long
  // addresses. Left unchecked it slides under the sidebar (which sits above the header) whenever the
  // page is zoomed or the window is narrow. Cap it to the room between the header's left edge (= just
  // right of the sidebar) and the search box's right edge, re-measured on resize, zoom and sidebar
  // collapse; long text then truncates with an ellipsis instead.
  const [resultsMaxWidth, setResultsMaxWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const search = searchRef.current;
    const header = search?.closest(".header") as HTMLElement | null;
    if (!suggestOpen || !search || !header) return;
    const GUTTER = 16;
    const measure = () => {
      const room = search.getBoundingClientRect().right - header.getBoundingClientRect().left - GUTTER;
      setResultsMaxWidth(Math.max(220, Math.floor(room)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(search);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [suggestOpen]);

  useEffect(() => {
    if (!suggestOpen) return;
    const onClickAway = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSuggestOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [suggestOpen]);

  const openResult = (result: SearchResult) => {
    setSuggestOpen(false);
    setSearchText("");
    navigate(result.path);
  };

  useEffect(() => {
    if (!menuOpen && !alarmOpen) return;
    const onClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (alarmRef.current && !alarmRef.current.contains(e.target as Node)) setAlarmOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMenuOpen(false); setAlarmOpen(false); }
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen, alarmOpen]);

  const orgLabel = reseller?.name
    ? "Reseller"
    : company?.name
    ? "Customer"
    : me?.role === "superadmin"
    ? null
    : null;
  const orgName = reseller?.name || company?.name;

  return (
    <div className="header">
      <div className="header-left">
        {breadcrumb.length > 0 && (
          <div className="breadcrumb-trail">
            {breadcrumb.map((b, i) => (
              <span key={i}>
                <span className="bc-link" onClick={b.onClick}>
                  {b.label}
                </span>
                <span className="bc-sep">&rsaquo;</span>
              </span>
            ))}
          </div>
        )}
        <div className="page-heading">
          <div className="page-heading-icon"><HeadingIcon size={23} /></div>
          <div className="page-heading-copy">
            <div className="page-title">{title}</div>
            <div className="page-heading-subtitle">{headingDetails.subtitle}</div>
          </div>
        </div>
      </div>
      <div className="header-right">
        <button
          className="theme-toggle"
          type="button"
          onClick={() => setDarkMode((mode) => !mode)}
          aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
          title={`Switch to ${darkMode ? "light" : "dark"} mode`}
        >
          <span aria-hidden="true">{darkMode ? "☀" : "◐"}</span>
          {darkMode ? "Light" : "Dark"}
        </button>
        <div className="search-box header-search" ref={searchRef}>
          <IconSearch size={13} />
          <input
            type="text"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setSuggestOpen(!!e.target.value.trim());
            }}
            onFocus={() => { setSearchUsed(true); setSuggestOpen(!!searchText.trim()); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && flatResults.length) { e.preventDefault(); setSuggestOpen(true); setActiveIndex((index) => (index + 1) % flatResults.length); }
              if (e.key === "ArrowUp" && flatResults.length) { e.preventDefault(); setActiveIndex((index) => (index - 1 + flatResults.length) % flatResults.length); }
              if (e.key === "Enter" && flatResults[activeIndex]) openResult(flatResults[activeIndex]);
              if (e.key === "Escape") setSuggestOpen(false);
            }}
            placeholder={me?.role === "superadmin" ? "Search resellers, customers, sites, systems, users…" : "Search customers, sites, systems…"}
            aria-label="Global search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestOpen && !!searchQuery}
            aria-controls="global-search-results"
          />
          {suggestOpen && searchQuery && (
            <div
              className="header-search-results"
              id="global-search-results"
              role="listbox"
              aria-label="Search results"
              style={resultsMaxWidth ? { maxWidth: resultsMaxWidth, minWidth: Math.min(380, resultsMaxWidth) } : undefined}
            >
              {searchGroups.map((group) => {
                const GroupIcon = group.icon;
                return (
                  <div className="header-search-group" key={group.label}>
                    <div className="header-search-group-label">{group.label}</div>
                    {group.results.map((result) => {
                      const index = flatResults.indexOf(result);
                      return (
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === activeIndex}
                          key={result.key}
                          className={`header-search-result${index === activeIndex ? " active" : ""}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => openResult(result)}
                          title={`${result.title} — ${result.subtitle}`}
                        >
                          <GroupIcon size={14} />
                          <span><strong>{result.title}</strong><small>{result.subtitle}</small></span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {!flatResults.length && (
                <div className="header-search-empty">{searchData.isLoading ? "Searching…" : `No results for “${searchText.trim()}”.`}</div>
              )}
            </div>
          )}
        </div>
        <div className="alarm-preview-wrap" ref={alarmRef}>
          <button type="button" className="header-icon-btn" onClick={() => { setAlarmOpen((open) => !open); setMenuOpen(false); }} aria-label={activeCount > 0 ? `Open alarm preview — ${activeCount} active alarms` : "Open alarm preview"} aria-expanded={alarmOpen} title="Active alarms">
            <IconBell size={16} />
            {activeCount > 0 && <span className="header-icon-dot">{activeCount > 9 ? "9+" : activeCount}</span>}
          </button>
          {alarmOpen && <div className="alarm-preview" role="dialog" aria-label="Active alarm preview">
            <div className="alarm-preview-head"><div><strong>Active alarms</strong><span>{activeCount} in your scope</span></div>{unackedCount > 0 && <span className="alarm-preview-unacked">{unackedCount} unacknowledged</span>}</div>
            <div className="alarm-preview-list">
              {previewAlarms.map((alarm) => <div className="alarm-preview-item" key={alarm.id}><span className={`alarm-preview-severity ${alarm.severity}`} aria-hidden="true" /><div className="alarm-preview-copy"><strong>{alarm.message}</strong><span>{alarm.device_label || alarm.system_id} · {new Date(alarm.occurred_at).toLocaleString()}</span></div>{!alarm.ack_by && <span className="alarm-preview-new">Unacked</span>}</div>)}
              {!previewAlarms.length && <div className="alarm-preview-empty">No active alarms in your scope.</div>}
            </div>
            <button className="alarm-preview-all" type="button" onClick={() => { setAlarmOpen(false); navigate("/alarms", { state: currentNavState() }); }}>View all alarms</button>
          </div>}
        </div>
        <div className="header-user" ref={menuRef} onClick={() => { setMenuOpen((v) => !v); setAlarmOpen(false); }}>
          <div className="header-user-avatar">{(displayEmail || "?").slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="header-user-name">{displayName || "Signed in"}</div>
            <div className="header-user-role">{roleLabel}</div>
          </div>

          {menuOpen && (
            <div className="header-user-menu">
              <div className="header-user-menu-name">{displayName || "Signed in"}</div>
              <div className="header-user-menu-email">{displayEmail}</div>
              <div className="header-user-menu-info">
                <div className="header-user-menu-row">
                  <span className="header-user-menu-label">Role</span>
                  <span className="header-user-menu-value">{roleLabel}</span>
                </div>
                {orgName && (
                  <div className="header-user-menu-row">
                    <span className="header-user-menu-label">{orgLabel}</span>
                    <span className="header-user-menu-value">{orgName}</span>
                  </div>
                )}
                {me?.scope_type && (
                  <div className="header-user-menu-row">
                    <span className="header-user-menu-label">Scope</span>
                    <span className="header-user-menu-value">
                      {me.scope_type === "assigned" ? "Assigned systems" : "Customer-wide"}
                    </span>
                  </div>
                )}
              </div>
              <div className="header-user-menu-actions">
                <button
                  className="header-btn"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/profile", { state: currentNavState() });
                  }}
                >
                  View Profile
                </button>
                <button className="header-btn" onClick={() => auth.signoutRedirect()}>
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
