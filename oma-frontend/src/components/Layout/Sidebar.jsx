import { useEffect, useState } from "react";
import {
  Activity,
  BarChart2,
  Building2,
  ChevronDown,
  ClipboardList,
  FileBarChart,
  Fish,
  LayoutDashboard,
  Leaf,
  LineChart,
  Settings2,
  ShieldCheck,
  Sprout,
  TrendingUp,
  UserCog,
  Users,
  Waves,
  Wheat,
  X,
} from "lucide-react";
import { useLocation, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import logo from "../../assets/LOGO OMAg.jpg";

// ─── Nav structure ──────────────────────────────────────────────────────────
// Leaf items carry `to`, which may include a `?tab=` query — the same
// convention FarmersHub/FisherfolkHub already use for their Registry/
// Associations tabs. Groups are plain { key, label, icon, items }; an item
// may itself be a nested group (an entry with its own `items`) instead of a
// leaf — NavGroup renders those one level deeper — though no group currently
// nests another (Associations was split out to its own top-level group).

const DASHBOARD_ITEM = { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" };
const REPORTS_ITEM = { to: "/reports", icon: FileBarChart, label: "Reports" };

// FarmersHub/FisherfolkHub both default to the "registry" tab when the URL
// carries no ?tab= at all (`searchParams.get('tab') || 'registry'`) — this
// mirrors that so a bare /farmers (e.g. an old link, or the farmer detail
// page's back-navigation) still correctly highlights "Farmers", not nothing.
const DEFAULT_TAB_BY_PATH = { "/farmers": "registry", "/fisherfolk": "registry" };

const GROUPS = [
  {
    key: "registration",
    label: "Registration Management",
    icon: ClipboardList,
    items: [
      { to: "/farmers?tab=registry", icon: Users, label: "Farmers" },
      { to: "/fisherfolk?tab=registry", icon: Fish, label: "Fisherfolk" },
    ],
  },
  {
    key: "association-management",
    label: "Association Management",
    icon: Building2,
    items: [
      { to: "/farmers?tab=associations", icon: Users, label: "Farmers Associations" },
      { to: "/fisherfolk?tab=associations", icon: Fish, label: "Fisherfolk Associations" },
    ],
  },
  {
    key: "crop-management",
    label: "Crop Management",
    icon: Wheat,
    items: [
      { to: "/crop-records", icon: Sprout, label: "Crop Records" },
      { to: "/crop-monitoring", icon: BarChart2, label: "Crop Monitoring" },
    ],
  },
  {
    key: "fisheries-management",
    label: "Fisheries Management",
    icon: Waves,
    items: [
      { to: "/fisheries-monitoring", icon: Activity, label: "Fisheries Monitoring" },
    ],
  },
  {
    key: "forecasting",
    label: "Forecasting",
    icon: LineChart,
    items: [
      { to: "/forecasting", icon: TrendingUp, label: "Crop Forecasting" },
      { to: "/fisheries-forecasting", icon: TrendingUp, label: "Fisheries Forecasting" },
    ],
  },
];

const ADMIN_GROUP = {
  key: "admin",
  label: "Admin",
  icon: ShieldCheck,
  adminOnly: true,
  items: [
    { to: "/crop-settings", icon: Leaf, label: "Crop Settings" },
    { to: "/fisheries-settings", icon: Settings2, label: "Fisheries Settings" },
    { to: "/users", icon: UserCog, label: "Users" },
  ],
};

// ─── Path/tab matching ──────────────────────────────────────────────────────

function splitTo(to) {
  const [path, query] = to.split("?");
  return { path, tab: new URLSearchParams(query || "").get("tab") };
}

// Exact match used both to highlight the active leaf item AND to decide
// whether a group/sub-group should auto-expand. Pathname must match; if the
// link specifies a ?tab=, the current tab must agree too (falling back to
// DEFAULT_TAB_BY_PATH when the URL carries no tab at all) — this is what
// keeps "Farmers" and "Farmers Associations" (same pathname, different tab)
// from both lighting up, and what stops the Associations sub-group from
// auto-expanding while merely viewing the plain Farmers registry.
function isItemActive(to, location) {
  const { path, tab } = splitTo(to);
  const isSubRoute = location.pathname !== path && location.pathname.startsWith(path + "/");
  if (isSubRoute) {
    // Sub-routes (e.g. /farmers/123) aren't tab-addressable — only the
    // path's default-tab item (or a tab-less item) claims them.
    return !tab || tab === DEFAULT_TAB_BY_PATH[path];
  }
  if (location.pathname !== path) return false;
  if (!tab) return true;
  const currentTab = new URLSearchParams(location.search).get("tab");
  if (currentTab === tab) return true;
  return !currentTab && tab === DEFAULT_TAB_BY_PATH[path];
}

function flattenLeaves(items) {
  return items.flatMap((item) => (item.items ? flattenLeaves(item.items) : [item]));
}

function groupContainsPath(group, location) {
  return flattenLeaves(group.items).some((leaf) => isItemActive(leaf.to, location));
}

// ─── Leaf item ──────────────────────────────────────────────────────────────

function LeafItem({ to, icon: Icon, label, isCollapsed, depth = 0 }) {
  const location = useLocation();
  const isActive = isItemActive(to, location);

  if (isCollapsed) {
    return (
      <NavLink to={to}>
        <div
          className={[
            "relative w-10 h-10 flex items-center justify-center rounded-[10px] mx-auto mb-0.5 cursor-pointer group",
            "transition-[background-color,box-shadow,transform] duration-200 ease-in-out will-change-transform hover:translate-x-0.5",
            isActive ? "bg-primary-light shadow-[0_1px_3px_rgba(27,77,46,0.16)]" : "hover:bg-surface-2",
          ].join(" ")}
        >
          <Icon className={`w-[18px] h-[18px] ${isActive ? "text-primary" : "text-text-muted"}`} aria-hidden="true" />
          <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-[color:var(--color-primary-deep)] text-white text-[12px] px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 shadow-md">
            {label}
          </div>
        </div>
      </NavLink>
    );
  }

  return (
    <NavLink to={to}>
      <div
        className={[
          "relative flex items-center gap-2.5 rounded-[10px] text-[13px] cursor-pointer mb-0.5",
          "transition-[background-color,color,box-shadow,transform] duration-200 ease-in-out will-change-transform hover:translate-x-0.5",
          depth > 0 ? "py-2 pl-9 pr-3 mx-1.5" : "px-3 py-2.5 mx-1.5",
          isActive
            ? "bg-primary-light text-primary font-semibold shadow-[0_1px_3px_rgba(27,77,46,0.16)]"
            : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
        ].join(" ")}
      >
        <span
          className={[
            "absolute left-0 w-[3px] rounded-r bg-[color:var(--color-accent)] top-1/2 -translate-y-1/2",
            "transition-[height,opacity] duration-200 ease-in-out",
            isActive ? "h-5 opacity-100" : "h-2 opacity-0",
          ].join(" ")}
          aria-hidden="true"
        />
        {depth > 0 ? (
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-200 ${isActive ? "bg-primary" : "bg-border-strong"}`} aria-hidden="true" />
        ) : (
          <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-200 ${isActive ? "text-primary" : "text-text-muted"}`} aria-hidden="true" />
        )}
        <span className="text-[13px] leading-snug">{label}</span>
      </div>
    </NavLink>
  );
}

// ─── Collapsible group ──────────────────────────────────────────────────────
// Renders a top-level nav section (Registration Management, Association
// Management, etc.). Also handles a nested sub-group one level deeper, should
// an item ever carry its own `items` again — none currently do.

function NavGroup({ group, isCollapsed, depth = 0 }) {
  const GroupIcon = group.icon;
  const location = useLocation();
  const [open, setOpen] = useState(() => groupContainsPath(group, location));

  // Auto-expand when navigation brings the user inside this group — does not
  // forcibly collapse a group the user opened manually elsewhere.
  useEffect(() => {
    if (groupContainsPath(group, location)) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  if (isCollapsed) {
    // Icon-collapsed sidebar mode: group headers carry no icon of their own
    // and collapse/expand has no meaning with no labels visible, so every
    // leaf renders as a flat icon in place, same as before groups existed.
    return (
      <>
        {group.items.map((item) =>
          item.items ? (
            <NavGroup key={item.key || item.label} group={item} isCollapsed={isCollapsed} />
          ) : (
            <LeafItem key={item.to} {...item} isCollapsed={isCollapsed} />
          ),
        )}
      </>
    );
  }

  return (
    <div className={depth === 0 ? "mt-4" : "mt-1 mb-1"}>
      {/* Font-size/weight are set on the inner <span>, not this <button> —
          index.css's `button, input, select, textarea { font: inherit }`
          is unlayered CSS, which beats Tailwind's layered utilities on the
          button element itself regardless of specificity (CSS Cascade
          Layers: unlayered always wins). `color` isn't part of the `font`
          shorthand, so it's unaffected and stays here; children inherit it
          normally. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "flex w-full items-center justify-between text-left rounded-[var(--radius-sm)] transition-colors duration-200 ease-in-out cursor-pointer text-text-muted hover:text-text-secondary",
          depth === 0 ? "px-3 py-2" : "px-3 py-2 pl-9",
        ].join(" ")}
      >
        <span
          className={[
            "flex items-center gap-2 min-w-0",
            depth === 0
              ? "text-[10px] font-semibold uppercase tracking-[0.03em]"
              : "text-[11px] font-medium",
          ].join(" ")}
        >
          {depth === 0 && GroupIcon && (
            <GroupIcon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{group.label}</span>
        </span>
        <ChevronDown
          size={depth === 0 ? 12 : 11}
          className={`transition-transform duration-200 ease-in-out flex-shrink-0 ${open ? "" : "-rotate-90"}`}
          aria-hidden="true"
        />
      </button>
      <div
        className={[
          "grid transition-[grid-template-rows] duration-[250ms] ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden min-h-0">
          {group.items.map((item) =>
            item.items ? (
              <NavGroup key={item.key || item.label} group={item} isCollapsed={isCollapsed} depth={depth + 1} />
            ) : (
              <LeafItem key={item.to} {...item} isCollapsed={isCollapsed} depth={depth} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function Sidebar({ isOpen, onClose, isCollapsed }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${
          isOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        className={[
          "bg-surface border-r border-border flex flex-col fixed left-0 top-14 md:top-0 bottom-0 z-50 md:z-20 overflow-y-auto transition-all duration-300",
          isCollapsed ? "w-16" : "w-[220px]",
          isOpen
            ? "translate-x-0 shadow-xl"
            : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {/* Logo area — h-14 + md:top-0 on the aside makes this header fill the
            top-left corner flush with the navbar (no gap above the wordmark) */}
        <div className="h-14 flex items-center px-4 border-b border-border flex-shrink-0">
          {isCollapsed ? (
            <img
              src={logo}
              alt="OMAg"
              className="w-8 h-8 object-contain mx-auto rounded-md ring-1 ring-border-strong/60"
            />
          ) : (
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={logo}
                alt="OMAg"
                className="w-8 h-8 object-contain rounded-md ring-1 ring-border-strong/60 flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-text-primary leading-tight tracking-tight truncate">
                  OMAg Aringay
                </p>
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.08em] mt-0.5">
                  Aringay, La Union
                </p>
              </div>
            </div>
          )}
          <button
            className="press-scale ml-auto rounded-lg p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-text-primary md:hidden"
            onClick={onClose}
            type="button"
            aria-label="Close menu"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3">
          <LeafItem {...DASHBOARD_ITEM} isCollapsed={isCollapsed} />

          {isCollapsed && <div className="mx-auto w-8 border-t border-border my-2" />}

          {GROUPS.map((group) => (
            <NavGroup key={group.key} group={group} isCollapsed={isCollapsed} />
          ))}

          <LeafItem {...REPORTS_ITEM} isCollapsed={isCollapsed} />

          {isAdmin && (
            <>
              {isCollapsed && <div className="mx-auto w-8 border-t border-border my-2" />}
              <NavGroup group={ADMIN_GROUP} isCollapsed={isCollapsed} />
            </>
          )}
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;
