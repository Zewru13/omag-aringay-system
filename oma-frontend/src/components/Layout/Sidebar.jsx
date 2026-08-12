import { useEffect, useState } from "react";
import {
  Activity,
  BarChart2,
  Building2,
  ChevronDown,
  ClipboardList,
  FileBarChart,
  Fish,
  HandHeart,
  HeartHandshake,
  HeartPulse,
  History,
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
// Organizations tabs. Groups are plain { key, label, icon, items }; an item
// may itself be a nested group (an entry with its own `items`) instead of a
// leaf — NavGroup renders those one level deeper — though no group currently
// nests another (Organizations was split out to its own top-level group).

const DASHBOARD_ITEM = { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" };

// Batch A: Reports was a single leaf item landing on ReportsPage's default
// tab (Harvested Crop) no matter which report you actually wanted — now a
// group of 5 deep-links, same ?tab= convention as every other tabbed hub
// below, so each one lands directly on the right report.
const REPORTS_GROUP = {
  key: "reports",
  label: "Reports",
  icon: FileBarChart,
  items: [
    { to: "/reports?tab=harvested", icon: Wheat, label: "Harvested Crop Report" },
    { to: "/reports?tab=organization", icon: Building2, label: "Organization List" },
    { to: "/reports?tab=crop_options", icon: Leaf, label: "Crop Options" },
    { to: "/reports?tab=fisheries", icon: Fish, label: "Fisheries Production" },
    { to: "/reports?tab=farmer_crop_history", icon: History, label: "Farmer Crop History" },
  ],
};

// FarmersHub/FisherfolkHub both default to the "registry" tab when the URL
// carries no ?tab= at all (`searchParams.get('tab') || 'registry'`) — this
// mirrors that so a bare /farmers (e.g. an old link, or the farmer detail
// page's back-navigation) still correctly highlights "Farmers", not nothing.
// /reports mirrors the same idea for its default "harvested" report.
const DEFAULT_TAB_BY_PATH = { "/farmers": "registry", "/fisherfolk": "registry", "/reports": "harvested" };

const GROUPS = [
  {
    key: "registration",
    label: "Registration",
    icon: ClipboardList,
    items: [
      { to: "/farmers?tab=registry", icon: Users, label: "Farmers" },
      { to: "/fisherfolk?tab=registry", icon: Fish, label: "Fisherfolk" },
    ],
  },
  {
    key: "organization-management",
    label: "Organizations",
    icon: Building2,
    items: [
      { to: "/farmers?tab=organizations", icon: Users, label: "Farmers Organizations" },
      { to: "/fisherfolk?tab=organizations", icon: Fish, label: "Fisherfolk Organizations" },
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
    label: "Fisheries",
    icon: Waves,
    items: [
      { to: "/fisheries-monitoring", icon: Activity, label: "Fisheries Monitoring" },
      { to: "/fisheries-health-monitoring", icon: HeartPulse, label: "Health & Feeding Monitoring" },
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
  {
    key: "assistance-management",
    label: "Assistance",
    icon: HandHeart,
    items: [
      { to: "/crop-assistance", icon: Sprout, label: "Crop Assistance" },
      { to: "/fisheries-assistance", icon: Fish, label: "Fisheries Assistance" },
    ],
  },
];

const ADMIN_GROUP = {
  key: "admin",
  label: "Admin",
  icon: ShieldCheck,
  adminOnly: true,
  items: [
    // Restored (Batch 6) — accidentally dropped in a July 5 sidebar rewrite
    // unrelated to Interventions itself (the commit also silently dropped
    // /help and /audit-log links in the same pass); the /interventions route
    // itself (App.jsx, allowedRoles=["ADMIN"]) was never removed. Placed
    // here rather than as its own top-level group because it's the only
    // group in GROUPS whose visibility already matches its admin-only route
    // restriction — Assistance Management next to it is visible to
    // EVALUATOR too, which /interventions is not.
    { to: "/interventions", icon: HeartHandshake, label: "Interventions" },
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
// keeps "Farmers" and "Farmers Organizations" (same pathname, different tab)
// from both lighting up, and what stops the Organizations sub-group from
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
            isActive ? "bg-nav-active" : "hover:bg-white/5",
          ].join(" ")}
        >
          <Icon className={`w-[18px] h-[18px] ${isActive ? "text-nav-item-on" : "text-nav-item"}`} aria-hidden="true" />
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
          "relative flex items-center gap-2.5 rounded-[8px] text-[13px] cursor-pointer mb-0.5",
          "transition-[background-color,color] duration-200 ease-in-out",
          // Sub-items sit further in and carry no icon of their own — the
          // reference hangs them off the group's vertical rail instead.
          // Indent is measured from the rail the parent group draws, not
          // from the sidebar edge — the rail already carries the offset.
          depth > 0 ? "py-[7px] pl-4 pr-3 mr-2" : "px-3 py-2.5 mx-2",
          isActive
            ? "bg-nav-active text-nav-item-on font-medium"
            : "text-nav-item hover:bg-white/5 hover:text-nav-item-on",
        ].join(" ")}
      >
        {depth === 0 && (
          <Icon className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />
        )}
        <span className="text-[13px] leading-snug">{label}</span>
      </div>
    </NavLink>
  );
}

// ─── Collapsible group ──────────────────────────────────────────────────────
// Renders a top-level nav section (Registration Management, Organization
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
          "flex w-full items-center justify-between text-left rounded-[var(--radius-sm)] transition-colors duration-200 ease-in-out cursor-pointer hover:text-nav-item-on",
          // ADMIN is the reference's one coloured group label — it marks the
          // privileged section, and every item under it is admin-gated, so
          // the colour is carrying meaning rather than decorating.
          group.adminOnly ? "text-nav-admin" : "text-nav-label",
          depth === 0 ? "px-4 py-2" : "px-3 py-2 pl-9",
        ].join(" ")}
      >
        <span
          className={[
            "flex items-center gap-2 min-w-0",
            depth === 0
              ? "text-[11px] font-semibold uppercase tracking-[0.06em]"
              : "text-[11px] font-medium",
          ].join(" ")}
        >
          {depth === 0 && GroupIcon && (
            <GroupIcon className="w-[14px] h-[14px] flex-shrink-0" aria-hidden="true" />
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
        {/* The reference hangs sub-items off a hairline rail rather than
            indenting them with a dot each. Sits at the group icon's centre. */}
        <div className="overflow-hidden min-h-0">
          <div className={depth === 0 ? "border-l border-nav-rail ml-[22px]" : ""}>
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
          "bg-nav-bg flex flex-col fixed left-0 top-14 md:top-0 bottom-0 z-50 md:z-20 overflow-y-auto transition-all duration-300",
          isCollapsed ? "w-16" : "w-[248px]",
          isOpen
            ? "translate-x-0 shadow-xl"
            : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {/* Logo area — h-14 + md:top-0 on the aside makes this header fill the
            top-left corner flush with the navbar (no gap above the wordmark) */}
        <div className="h-[72px] flex items-center px-4 border-b border-nav-rail flex-shrink-0">
          {isCollapsed ? (
            <img
              src={logo}
              alt="OMAg"
              className="w-9 h-9 object-contain mx-auto rounded-[9px]"
            />
          ) : (
            <div className="flex items-center gap-3 min-w-0">
              {/* The reference draws a solid rounded tile here rather than a
                  photo. Keeping the real logo inside it: the tile is the
                  reference's shape, the mark is the municipality's own. */}
              <span className="w-9 h-9 flex-shrink-0 rounded-[9px] bg-nav-logo overflow-hidden flex items-center justify-center">
                <img src={logo} alt="OMAg" className="w-full h-full object-cover" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-nav-item-on leading-tight tracking-tight truncate">
                  OMAg
                </p>
                <p className="text-[11px] text-nav-label leading-tight truncate">
                  Aringay, La Union
                </p>
              </div>
            </div>
          )}
          <button
            className="press-scale ml-auto rounded-lg p-1.5 text-nav-item transition-colors duration-200 hover:bg-white/10 hover:text-nav-item-on md:hidden"
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

          {isCollapsed && <div className="mx-auto w-8 border-t border-nav-rail my-2" />}

          {GROUPS.map((group) => (
            <NavGroup key={group.key} group={group} isCollapsed={isCollapsed} />
          ))}

          <NavGroup group={REPORTS_GROUP} isCollapsed={isCollapsed} />

          {isAdmin && (
            <>
              {isCollapsed && <div className="mx-auto w-8 border-t border-nav-rail my-2" />}
              <NavGroup group={ADMIN_GROUP} isCollapsed={isCollapsed} />
            </>
          )}
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;
