import {
  Activity,
  BarChart2,
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

function NavItem({ to, icon: Icon, children, adminOnly, isCollapsed, user }) {
  if (adminOnly && user?.role !== "ADMIN") return null;

  const location = useLocation();
  const isActive =
    location.pathname === to || location.pathname.startsWith(to + "/");

  if (isCollapsed) {
    return (
      <NavLink to={to}>
        <div
          className={[
            "relative w-10 h-10 flex items-center justify-center rounded-[10px] mx-auto mb-0.5 transition-colors cursor-pointer group",
            isActive ? "bg-[#EBF5EE]" : "hover:bg-[#F5F7F5]",
          ].join(" ")}
        >
          <Icon
            className={`w-[18px] h-[18px] ${isActive ? "text-[#1B4D2E]" : "text-[#7A8E7A]"}`}
          />
          <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-[#1A2B1A] text-white text-[12px] px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            {children}
          </div>
        </div>
      </NavLink>
    );
  }

  return (
    <NavLink to={to}>
      <div
        className={[
          "relative flex items-center gap-2.5 px-3 py-2 rounded-lg mx-1.5 text-[13px] transition-colors cursor-pointer mb-0.5",
          isActive
            ? "bg-[#EBF5EE] text-[#1B4D2E] font-semibold"
            : "text-[#4A5E4A] hover:bg-[#F5F7F5] hover:text-[#1A2B1A]",
        ].join(" ")}
      >
        {isActive && (
          <span className="absolute left-0 w-[3px] h-5 bg-[#1B4D2E] rounded-r top-1/2 -translate-y-1/2" />
        )}
        <Icon
          className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? "text-[#1B4D2E]" : "text-[#7A8E7A]"}`}
        />
        <span className="text-[13px] leading-snug">{children}</span>
      </div>
    </NavLink>
  );
}

function Sidebar({ isOpen, onClose, isCollapsed }) {
  const { user } = useAuth();

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
          {/* MAIN */}
          {!isCollapsed && (
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A8BCA8]">
              MAIN
            </p>
          )}

          <NavItem
            to="/dashboard"
            icon={LayoutDashboard}
            isCollapsed={isCollapsed}
            user={user}
          >
            Dashboard
          </NavItem>
          <NavItem
            to="/farmers"
            icon={Users}
            isCollapsed={isCollapsed}
            user={user}
          >
            Farmers
          </NavItem>
          <NavItem
            to="/crop-records"
            icon={Sprout}
            isCollapsed={isCollapsed}
            user={user}
          >
            Crop Records
          </NavItem>
          <NavItem
            to="/crop-monitoring"
            icon={BarChart2}
            isCollapsed={isCollapsed}
            user={user}
          >
            Crop Monitoring
          </NavItem>
          <NavItem
            to="/forecasting"
            icon={TrendingUp}
            isCollapsed={isCollapsed}
            user={user}
          >
            Crop Forecasting
          </NavItem>
          <NavItem
            to="/fisherfolk"
            icon={Fish}
            isCollapsed={isCollapsed}
            user={user}
          >
            Fisherfolk
          </NavItem>
          <NavItem
            to="/fisheries-monitoring"
            icon={Activity}
            isCollapsed={isCollapsed}
            user={user}
          >
            Fisheries Management
          </NavItem>
          <NavItem
            to="/reports"
            icon={FileBarChart}
            isCollapsed={isCollapsed}
            user={user}
          >
            Reports
          </NavItem>

          {/* ADMIN */}
          {!isCollapsed && (
            <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A8BCA8]">
              ADMIN
            </p>
          )}
          {isCollapsed && user?.role === "ADMIN" && (
            <div className="mx-auto w-8 border-t border-[#E2E8E2] my-2" />
          )}

          <NavItem
            to="/crop-settings"
            icon={Leaf}
            adminOnly
            isCollapsed={isCollapsed}
            user={user}
          >
            Crop Settings
          </NavItem>
          <NavItem
            to="/fisheries-settings"
            icon={Settings2}
            adminOnly
            isCollapsed={isCollapsed}
            user={user}
          >
            Fisheries Settings
          </NavItem>
          <NavItem
            to="/users"
            icon={UserCog}
            adminOnly
            isCollapsed={isCollapsed}
            user={user}
          >
            Users
          </NavItem>
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;
