import { useEffect, useState } from "react";
import {
  Activity,
  BarChart2,
  ChevronDown,
  FileBarChart,
  Fish,
  LayoutDashboard,
  Leaf,
  Settings2,
  Sprout,
  TrendingUp,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useLocation, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import logo from "../../assets/LOGO OMAg.jpg";

// ─── Nav structure ──────────────────────────────────────────────────────────
// Leaf items carry `to`, which may include a `?tab=` query — the same
// convention FarmersHub/FisherfolkHub already use for their Registry/
// Associations tabs. Groups are plain { key, label, items } and may nest
// one level (Associations under Registration); items themselves may be a
// nested group (an entry with its own `items`) instead of a leaf.

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
    label: "Registration",
    items: [
      { to: "/farmers?tab=registry", icon: Users, label: "Farmers" },
      { to: "/fisherfolk?tab=registry", icon: Fish, label: "Fisherfolk" },
      {
        key: "associations",
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
    label: "Crop Management",
    items: [
      { to: "/crop-records", icon: Sprout, label: "Crop Records" },
      { to: "/crop-monitoring", icon: BarChart2, label: "Crop Monitoring" },
    ],
  },
  {
    key: "fisheries-management",
    label: "Fisheries Management",
    items: [
      { to: "/fisheries-monitoring", icon: Activity, label: "Fisheries Monitoring" },
    ],
  },
  {
    key: "forecasting",
    label: "Forecasting",
    items: [
      { to: "/forecasting", icon: TrendingUp, label: "Crop Forecasting" },
      { to: "/fisheries-forecasting", icon: TrendingUp, label: "Fisheries Forecasting" },
    ],
  },
];

const ADMIN_GROUP = {
  key: "admin",
  label: "Admin",
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
            "relative w-10 h-10 flex items-center justify-center rounded-[10px] mx-auto mb-0.5 transition-colors cursor-pointer group",
            isActive ? "bg-[#EBF5EE]" : "hover:bg-[#F5F7F5]",
          ].join(" ")}
        >
          <Icon className={`w-[18px] h-[18px] ${isActive ? "text-[#1B4D2E]" : "text-[#7A8E7A]"}`} />
          <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-[#1A2B1A] text-white text-[12px] px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
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
          "relative flex items-center gap-2.5 rounded-lg text-[13px] transition-colors cursor-pointer mb-0.5",
          depth > 0 ? "py-[7px] pl-9 pr-3 mx-1.5" : "px-3 py-2 mx-1.5",
          isActive
            ? "bg-[#EBF5EE] text-[#1B4D2E] font-semibold"
            : "text-[#4A5E4A] hover:bg-[#F5F7F5] hover:text-[#1A2B1A]",
        ].join(" ")}
      >
        {isActive && (
          <span className="absolute left-0 w-[3px] h-5 bg-[#1B4D2E] rounded-r top-1/2 -translate-y-1/2" />
        )}
        {depth > 0 ? (
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? "bg-[#1B4D2E]" : "bg-[#C8D5C8]"}`} />
        ) : (
          <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? "text-[#1B4D2E]" : "text-[#7A8E7A]"}`} />
        )}
        <span className="text-[13px] leading-snug">{label}</span>
      </div>
    </NavLink>
  );
}

// ─── Collapsible group (also used for the nested Associations sub-group) ──────

function NavGroup({ group, isCollapsed, depth = 0 }) {
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
    <div className={depth === 0 ? "mb-1" : "mt-0.5 mb-1"}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "flex w-full items-center justify-between text-left transition-colors",
          depth === 0
            ? "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A8BCA8] hover:text-[#4A5E4A]"
            : "px-3 py-1.5 pl-9 text-[11px] font-medium text-[#7A8E7A] hover:text-[#4A5E4A]",
        ].join(" ")}
      >
        <span>{group.label}</span>
        <ChevronDown size={depth === 0 ? 12 : 11} className={`transition-transform ${open ? "" : "-rotate-90"} ${depth === 0 ? "mr-1.5" : "mr-3"}`} />
      </button>
      {open && (
        <div>
          {group.items.map((item) =>
            item.items ? (
              <NavGroup key={item.key || item.label} group={item} isCollapsed={isCollapsed} depth={depth + 1} />
            ) : (
              <LeafItem key={item.to} {...item} isCollapsed={isCollapsed} depth={depth} />
            ),
          )}
        </div>
      )}
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
          "bg-white border-r border-[#E2E8E2] flex flex-col fixed left-0 top-14 bottom-0 z-20 overflow-y-auto transition-all duration-300",
          isCollapsed ? "w-16" : "w-[220px]",
          isOpen
            ? "translate-x-0 shadow-xl"
            : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {/* Logo area */}
        <div className="relative px-4 pt-3 pb-4 border-b border-[#F0F4F0]">
          {isCollapsed ? (
            <img
              src={logo}
              alt="OMAg"
              className="w-8 h-8 object-contain mx-auto"
            />
          ) : (
            <div className="flex items-center gap-3">
              <img
                src={logo}
                alt="OMAg"
                className="w-9 h-9 object-contain rounded-lg flex-shrink-0"
              />
              <div>
                <p className="text-[14px] font-semibold text-[#1A2B1A] leading-tight">
                  OMAg Aringay
                </p>
                <p className="text-[11px] text-[#7A8E7A] mt-0.5">
                  Aringay, La Union
                </p>
              </div>
            </div>
          )}
          <button
            className="absolute right-3 top-3 rounded-lg p-1.5 text-[#7A8E7A] transition hover:bg-[#F5F7F5] hover:text-[#1A2B1A] md:hidden"
            onClick={onClose}
            type="button"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3">
          <LeafItem {...DASHBOARD_ITEM} isCollapsed={isCollapsed} />

          {isCollapsed && <div className="mx-auto w-8 border-t border-[#E2E8E2] my-2" />}

          {GROUPS.map((group) => (
            <NavGroup key={group.key} group={group} isCollapsed={isCollapsed} />
          ))}

          <LeafItem {...REPORTS_ITEM} isCollapsed={isCollapsed} />

          {isAdmin && (
            <>
              {isCollapsed && <div className="mx-auto w-8 border-t border-[#E2E8E2] my-2" />}
              <NavGroup group={ADMIN_GROUP} isCollapsed={isCollapsed} />
            </>
          )}
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;
