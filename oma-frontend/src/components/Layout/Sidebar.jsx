import { useEffect, useMemo, useState } from "react";
import {
  BarChart2,
  ClipboardList,
  FileBarChart,
  Fish,
  LayoutDashboard,
  Leaf,
  Settings2,
  Shield,
  Sprout,
  TrendingUp,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useLocation, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import logo from "../../assets/LOGO OMAg.jpg";

// ─── Nav model ────────────────────────────────────────────────────────────────
// Two-pane RAIL + PANEL. Every `to` destination and the admin gate below are
// preserved exactly from the previous grouped sidebar — only the *presentation*
// (rail vs. panel) changed.
//
//  kind: "direct"  → a single destination; the rail icon is a link. Clicking
//                    navigates immediately and closes any open panel.
//  kind: "panel"   → multiple destinations; the rail icon opens a persistent
//                    second column listing that domain's pages.
//
// Route→panel ownership and active highlighting reuse isItemActive() unchanged,
// so ?tab= matching, sub-routes and default-tab fallback behave identically.

const DEFAULT_TAB_BY_PATH = { "/farmers": "registry", "/fisherfolk": "registry" };

const NAV = [
  { key: "dashboard", kind: "direct", to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", hint: "Overview & indicators" },
  {
    key: "registration",
    kind: "panel",
    icon: ClipboardList,
    label: "Registration",
    sections: [
      {
        items: [
          { to: "/farmers?tab=registry", icon: Users, label: "Farmers" },
          { to: "/fisherfolk?tab=registry", icon: Fish, label: "Fisherfolk" },
        ],
      },
      {
        label: "Associations",
        items: [
          { to: "/farmers?tab=associations", icon: Users, label: "Farmers Associations" },
          { to: "/fisherfolk?tab=associations", icon: Fish, label: "Fisherfolk Associations" },
        ],
      },
    ],
  },
  {
    key: "crop-management",
    kind: "panel",
    icon: Sprout,
    label: "Crop Management",
    sections: [
      {
        items: [
          { to: "/crop-records", icon: Sprout, label: "Crop Records" },
          { to: "/crop-monitoring", icon: BarChart2, label: "Crop Monitoring" },
        ],
      },
    ],
  },
  { key: "fisheries", kind: "direct", to: "/fisheries-monitoring", icon: Fish, label: "Fisheries Monitoring", hint: "Stocking, culture & vessels" },
  {
    key: "forecasting",
    kind: "panel",
    icon: TrendingUp,
    label: "Forecasting",
    sections: [
      {
        items: [
          { to: "/forecasting", icon: TrendingUp, label: "Crop Forecasting" },
          { to: "/fisheries-forecasting", icon: TrendingUp, label: "Fisheries Forecasting" },
        ],
      },
    ],
  },
  { key: "reports", kind: "direct", to: "/reports", icon: FileBarChart, label: "Reports", hint: "Generate & export" },
];

// Admin-only. Pushed into the rail list solely when the signed-in user is an
// admin, so its rail icon and panel are entirely absent from the DOM otherwise.
const ADMIN_NAV = {
  key: "admin",
  kind: "panel",
  icon: Shield,
  label: "Admin",
  sections: [
    {
      items: [
        { to: "/crop-settings", icon: Leaf, label: "Crop Settings" },
        { to: "/fisheries-settings", icon: Settings2, label: "Fisheries Settings" },
        { to: "/users", icon: UserCog, label: "Users" },
      ],
    },
  ],
};

// ─── Path/tab matching (unchanged behavior) ───────────────────────────────────

function splitTo(to) {
  const [path, query] = to.split("?");
  return { path, tab: new URLSearchParams(query || "").get("tab") };
}

// Exact match used to highlight the active item AND to decide which panel owns
// the current route. Pathname must match; if the link specifies a ?tab=, the
// current tab must agree too (falling back to DEFAULT_TAB_BY_PATH when the URL
// carries no tab at all) — this is what keeps "Farmers" and "Farmers
// Associations" (same pathname, different tab) from both lighting up.
function isItemActive(to, location) {
  const { path, tab } = splitTo(to);
  const isSubRoute = location.pathname !== path && location.pathname.startsWith(path + "/");
  if (isSubRoute) {
    return !tab || tab === DEFAULT_TAB_BY_PATH[path];
  }
  if (location.pathname !== path) return false;
  if (!tab) return true;
  const currentTab = new URLSearchParams(location.search).get("tab");
  if (currentTab === tab) return true;
  return !currentTab && tab === DEFAULT_TAB_BY_PATH[path];
}

function itemsOf(domain) {
  return domain.sections.flatMap((s) => s.items);
}

function domainActive(domain, location) {
  return itemsOf(domain).some((it) => isItemActive(it.to, location));
}

// The panel key that owns the current route, or null when a direct-link
// destination (or nothing) is active. Drives auto-open-on-load, swap-on-
// navigate, and close-on-direct-link.
function panelKeyForLocation(navList, location) {
  for (const item of navList) {
    if (item.kind === "panel" && domainActive(item, location)) return item.key;
  }
  return null;
}

function activeDirect(navList, location) {
  return navList.find((i) => i.kind === "direct" && isItemActive(i.to, location)) || null;
}

// ─── Rail button ──────────────────────────────────────────────────────────────

function RailButton({ item, collapsed, selected, active, onOpenPanel }) {
  const Icon = item.icon;
  const highlight = active || selected;

  const shell = [
    "group/rail relative mx-auto flex h-11 w-11 items-center justify-center rounded-[12px] cursor-pointer",
    "transition-[background-color,transform,box-shadow] duration-200 ease-in-out will-change-transform",
    "hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]",
    highlight ? "bg-white/12" : "hover:bg-white/8",
  ].join(" ");

  const iconEl = (
    <Icon
      className={["h-[19px] w-[19px] transition-colors duration-200", highlight ? "text-white" : "text-white/65 group-hover/rail:text-white/90"].join(" ")}
      aria-hidden="true"
    />
  );

  // The signature active-tab marker: a harvest-amber bar that grows on the
  // selected/active rail icon like a pulled-out records-drawer tab.
  const marker = (
    <span
      className={[
        "absolute -left-[10px] top-1/2 w-[3px] -translate-y-1/2 rounded-r-full bg-[color:var(--color-accent)]",
        "transition-[height,opacity] duration-200 ease-in-out",
        highlight ? "h-6 opacity-100" : "h-2 opacity-0",
      ].join(" ")}
      aria-hidden="true"
    />
  );

  // Collapsed-rail hover label (icon-only mode needs a name affordance).
  const tip = collapsed ? (
    <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-[color:var(--color-primary-deep)] px-2.5 py-1 text-[12px] font-medium text-white opacity-0 shadow-md ring-1 ring-white/10 transition-opacity duration-200 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
      {item.label}
    </span>
  ) : null;

  // A direct item is always a link. In collapsed mode a panel item has nowhere
  // to show its panel, so it links to its first destination instead; in
  // expanded mode a panel item is a button that opens its column.
  if (item.kind === "direct" || collapsed) {
    const to = item.kind === "direct" ? item.to : itemsOf(item).find(Boolean).to;
    return (
      <NavLink
        to={to}
        aria-label={item.label}
        title={item.label}
        className={shell}
        onClick={() => onOpenPanel(item.kind === "direct" ? null : item.key)}
      >
        {marker}
        {iconEl}
        {tip}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      aria-label={item.label}
      title={item.label}
      aria-expanded={selected}
      aria-controls="sidebar-panel"
      className={shell}
      onClick={() => onOpenPanel(item.key)}
    >
      {marker}
      {iconEl}
    </button>
  );
}

// ─── Panel link (a page within an open domain) ────────────────────────────────

function PanelLink({ to, icon: Icon, label, index }) {
  const location = useLocation();
  const active = isItemActive(to, location);

  return (
    <NavLink
      to={to}
      className={[
        "stagger-item group/link relative flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] cursor-pointer",
        "transition-[background-color,color,transform] duration-200 ease-in-out will-change-transform hover:translate-x-0.5",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]",
        active
          ? "bg-primary-light text-primary font-semibold"
          : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
      ].join(" ")}
      style={{ "--stagger-index": index }}
    >
      <span
        className={[
          "absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-[height,opacity] duration-200 ease-in-out",
          active ? "h-5 opacity-100" : "h-2 opacity-0",
        ].join(" ")}
        aria-hidden="true"
      />
      <Icon
        className={["h-[17px] w-[17px] flex-shrink-0 transition-colors duration-200", active ? "text-primary" : "text-text-muted group-hover/link:text-text-secondary"].join(" ")}
        aria-hidden="true"
      />
      <span className="leading-snug">{label}</span>
    </NavLink>
  );
}

// ─── Panel body ───────────────────────────────────────────────────────────────

function PanelBody({ domain, contextItem }) {
  // A panel domain is open → list its pages (keyed remount replays the staggered
  // entrance when the domain swaps).
  if (domain) {
    let i = 0;
    return (
      <div key={domain.key} className="px-2.5 py-3">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          {domain.label}
        </p>
        {domain.sections.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-3" : ""}>
            {section.label && (
              <p className="px-3 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.1em] text-text-muted/80">
                {section.label}
              </p>
            )}
            {section.items.map((it) => (
              <PanelLink key={it.to} {...it} index={i++} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // No panel open (a direct-link destination is active) → a calm "you are here"
  // header for the current view. Within the fixed 220px footprint the column
  // stays present; this reads as a quiet spine header rather than empty space.
  const Icon = contextItem?.icon || LayoutDashboard;
  return (
    <div key={contextItem?.key || "none"} className="stagger-item px-4 py-5" style={{ "--stagger-index": 0 }}>
      <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary-light">
        <Icon className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
      </div>
      <p className="mt-2.5 font-display text-[15px] font-semibold text-text-primary">{contextItem?.label || "OMAg Aringay"}</p>
      <p className="mt-0.5 text-[12px] text-text-muted">{contextItem?.hint || "Municipal agriculture console"}</p>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ isOpen, onClose, isCollapsed }) {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const navList = useMemo(() => (isAdmin ? [...NAV, ADMIN_NAV] : NAV), [isAdmin]);

  // Panel state syncs to the route on load and on every navigation (auto-open
  // to match, swap when the route enters another domain, close on a direct
  // link). Manually opening a panel via a rail click sets it without waiting
  // for navigation; this effect only re-runs when the route actually changes.
  const [activePanelKey, setActivePanelKey] = useState(() => panelKeyForLocation(navList, location));
  useEffect(() => {
    setActivePanelKey(panelKeyForLocation(navList, location));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, isAdmin]);

  const activeDomain = activePanelKey ? navList.find((i) => i.key === activePanelKey) : null;
  const contextItem = activeDomain ? null : activeDirect(navList, location);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-300 md:hidden ${
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        className={[
          "fixed left-0 top-14 bottom-0 z-50 flex overflow-hidden transition-transform duration-300 md:top-0 md:z-30",
          isCollapsed ? "w-16" : "w-[220px]",
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {/* ── Rail (records spine) ── */}
        <div className="flex w-16 flex-shrink-0 flex-col bg-[color:var(--color-primary-deep)]">
          {/* Header cell — h-14 aligns the top band flush with the navbar */}
          <div className="flex h-14 flex-shrink-0 items-center justify-center">
            <img src={logo} alt="OMAg Aringay seal" className="h-9 w-9 rounded-md object-contain ring-1 ring-white/15" />
          </div>
          <nav aria-label="Primary" className="flex flex-1 flex-col items-center gap-1.5 py-3">
            {navList.map((item) => (
              <RailButton
                key={item.key}
                item={item}
                collapsed={isCollapsed}
                selected={activePanelKey === item.key}
                active={item.kind === "direct" ? isItemActive(item.to, location) : domainActive(item, location)}
                onOpenPanel={setActivePanelKey}
              />
            ))}
          </nav>
        </div>

        {/* ── Panel (opened drawer) — hidden in collapsed desktop mode ── */}
        {!isCollapsed && (
          <div className="flex min-w-0 flex-1 flex-col border-r border-border bg-surface">
            {/* Header cell — canopy, continues the unified top band across the wordmark */}
            <div className="flex h-14 flex-shrink-0 items-center gap-2.5 bg-[color:var(--color-primary-deep)] pl-3 pr-2">
              <div className="min-w-0">
                <p className="font-display text-[15px] font-semibold leading-tight text-white truncate">OMAg Aringay</p>
                <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/55 leading-tight mt-0.5">
                  Aringay, La Union
                </p>
              </div>
              <button
                className="ml-auto flex-shrink-0 rounded-lg p-1.5 text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)] md:hidden"
                onClick={onClose}
                type="button"
                aria-label="Close menu"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Panel body */}
            <div id="sidebar-panel" role="region" aria-label={activeDomain ? activeDomain.label : contextItem?.label || "Navigation"} className="flex-1 overflow-y-auto">
              <PanelBody domain={activeDomain} contextItem={contextItem} />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

export default Sidebar;
