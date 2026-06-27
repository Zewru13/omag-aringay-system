import {
  BarChart2,
  Building2,
  ClipboardList,
  FileBarChart,
  HeartHandshake,
  LayoutDashboard,
  Leaf,
  ScrollText,
  Settings,
  Sprout,
  Tag,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import NavGroup from './NavGroup.jsx'
import logo from '../../assets/LOGO OMAg.jpg'

function SideNavLink({ to, icon: Icon, children, isCollapsed, insideGroup = false }) {
  const label = typeof children === 'string' ? children : undefined
  return (
    <NavLink
      to={to}
      onClick={(e) => {/* let parent handle close */}}
      title={isCollapsed ? label : undefined}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 w-full mb-0.5',
          insideGroup ? '' : 'border-l-2',
          isCollapsed ? 'md:justify-center md:px-0 md:border-l-0 md:rounded-lg md:w-10 md:h-10 md:mx-auto' : '',
          isActive
            ? insideGroup
              ? 'bg-[#f0f7f0] text-[#1E4620] font-semibold'
              : 'border-[#1E4620] bg-[#f0f7f0] text-[#1E4620] font-semibold'
            : insideGroup
            ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        ].join(' ')
      }
    >
      <Icon size={16} className="shrink-0" />
      <span className={isCollapsed ? 'md:hidden' : ''}>{children}</span>
    </NavLink>
  )
}

function Sidebar({ isOpen, onClose, isCollapsed }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={[
          'fixed top-14 bottom-0 left-0 z-20 flex shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white',
          'transition-all duration-300 ease-in-out',
          isCollapsed ? 'w-[220px] md:w-16' : 'w-[220px]',
          isOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        {/* Logo area */}
        <div className={`relative border-b border-slate-100 px-4 py-4 ${isCollapsed ? 'md:hidden' : ''}`}>
          <div className="flex items-center gap-2.5">
            <img
              src={logo}
              alt="OMAg Aringay"
              className="h-8 w-8 flex-shrink-0 rounded-full object-contain"
            />
            <div>
              <p className="text-sm font-bold text-slate-900 leading-none">OMAg Aringay</p>
              <p className="text-xs text-slate-400 leading-none mt-0.5">Aringay, La Union</p>
            </div>
          </div>
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 md:hidden"
            onClick={onClose}
            type="button"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav
          className={[
            'flex-1 overflow-y-auto py-3',
            isCollapsed ? 'md:px-1 px-2' : 'px-2',
          ].join(' ')}
        >
          {/* Dashboard — standalone */}
          <SideNavLink to="/dashboard" icon={LayoutDashboard} isCollapsed={isCollapsed}>
            Dashboard
          </SideNavLink>

          {/* Farmers group */}
          <NavGroup label="Farmers" icon={Users} isCollapsed={isCollapsed}>
            <SideNavLink to="/farmers" icon={UserCheck} isCollapsed={isCollapsed} insideGroup>
              Farmer Registry
            </SideNavLink>
            <SideNavLink to="/associations" icon={Building2} isCollapsed={isCollapsed} insideGroup>
              Farmer Associations
            </SideNavLink>
          </NavGroup>

          {/* Crop Management group */}
          <NavGroup label="Crop Management" icon={Sprout} isCollapsed={isCollapsed}>
            <SideNavLink to="/crop-information" icon={ClipboardList} isCollapsed={isCollapsed} insideGroup>
              Crop Information
            </SideNavLink>
            <SideNavLink to="/crop-monitoring" icon={BarChart2} isCollapsed={isCollapsed} insideGroup>
              Crop Monitoring
            </SideNavLink>
            <SideNavLink to="/forecasting" icon={TrendingUp} isCollapsed={isCollapsed} insideGroup>
              Forecasting
            </SideNavLink>
          </NavGroup>

          {/* Interventions — standalone (Admin only) */}
          {isAdmin && (
            <SideNavLink to="/interventions" icon={HeartHandshake} isCollapsed={isCollapsed}>
              Interventions
            </SideNavLink>
          )}

          {/* Report Generation — standalone (Admin only) */}
          {isAdmin && (
            <SideNavLink to="/reports" icon={FileBarChart} isCollapsed={isCollapsed}>
              Report Generation
            </SideNavLink>
          )}

          {/* Administration group — Admin only */}
          {isAdmin && (
            <>
              {!isCollapsed && (
                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest px-3 mt-4 mb-1">
                  Administration
                </p>
              )}
              <NavGroup label="Administration" icon={Settings} isCollapsed={isCollapsed}>
                <SideNavLink to="/admin/users" icon={Users} isCollapsed={isCollapsed} insideGroup>
                  User Management
                </SideNavLink>
                <SideNavLink to="/crop-options" icon={Leaf} isCollapsed={isCollapsed} insideGroup>
                  Crop Options
                </SideNavLink>
                <SideNavLink to="/crop-categories" icon={Tag} isCollapsed={isCollapsed} insideGroup>
                  Crop Categories
                </SideNavLink>
                <SideNavLink to="/admin/audit-log" icon={ScrollText} isCollapsed={isCollapsed} insideGroup>
                  Audit Log
                </SideNavLink>
              </NavGroup>
            </>
          )}
        </nav>
      </aside>
    </>
  )
}

export default Sidebar
