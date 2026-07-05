import {
  Anchor,
  BarChart3,
  Building2,
  ClipboardList,
  Fish,
  LayoutDashboard,
  Leaf,
  ScrollText,
  Sprout,
  Tag,
  Tractor,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import logo from '../../assets/LOGO OMAg.jpg'

const NAV_GROUPS = [
  {
    label: 'MAIN',
    roles: ['ADMIN', 'EVALUATOR'],
    items: [
      { label: 'Dashboard',             path: '/dashboard',            icon: LayoutDashboard, roles: ['ADMIN', 'EVALUATOR'] },
      { label: 'Farmers',               path: '/farmers',              icon: Sprout,          roles: ['ADMIN', 'EVALUATOR'] },
      { label: 'Fisheries',             path: '/fisheries',            icon: Fish,            roles: ['ADMIN', 'EVALUATOR'] },
      { label: 'Associations',          path: '/associations',         icon: Building2,       roles: ['ADMIN', 'EVALUATOR'] },
      { label: 'Crop Monitoring',       path: '/crop-monitoring',      icon: Leaf,            roles: ['ADMIN', 'EVALUATOR'] },
      { label: 'Fisheries Monitoring',  path: '/fisheries-monitoring', icon: Anchor,          roles: ['ADMIN', 'EVALUATOR'] },
      { label: 'Production',            path: '/production',           icon: Tractor,         roles: ['ADMIN', 'EVALUATOR'] },
      { label: 'Forecasting',           path: '/forecasting',          icon: TrendingUp,      roles: ['ADMIN', 'EVALUATOR'] },
    ],
  },
  {
    label: 'MANAGEMENT',
    roles: ['ADMIN'],
    items: [
      { label: 'Interventions', path: '/interventions', icon: ClipboardList, roles: ['ADMIN'] },
      { label: 'Reports',       path: '/reports',       icon: BarChart3,     roles: ['ADMIN'] },
    ],
  },
  {
    label: 'ADMINISTRATION',
    roles: ['ADMIN'],
    items: [
      { label: 'User Management', path: '/admin/users',     icon: Users,      roles: ['ADMIN'] },
      { label: 'Audit Log',       path: '/admin/audit-log', icon: ScrollText, roles: ['ADMIN'] },
    ],
  },
  {
    label: 'UTILITIES',
    roles: ['ADMIN'],
    items: [
      { label: 'Crop Option',   path: '/crop-options',    icon: Leaf, roles: ['ADMIN'] },
      { label: 'Crop Category', path: '/crop-categories', icon: Tag,  roles: ['ADMIN'] },
    ],
  },
]

function Sidebar({ isOpen, onClose, isCollapsed }) {
  const { user } = useAuth()
  const role = user?.role

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/50 transition-opacity md:hidden ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-[#F8F9FA] shadow-xl',
          'transition-all duration-300 ease-in-out',
          isCollapsed ? 'w-[220px] md:w-16' : 'w-[220px]',
          'md:relative md:shadow-none md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Logo — collapsed (desktop icon only) */}
        {isCollapsed && (
          <div className="hidden md:flex md:justify-center md:border-b md:border-slate-200 md:py-3">
            <img
              src={logo}
              alt="OMAg Aringay"
              className="h-8 w-8 rounded-full object-contain ring-1 ring-slate-300"
            />
          </div>
        )}

        {/* Logo — expanded */}
        <div className={`relative border-b border-slate-200 px-5 py-4 ${isCollapsed ? 'md:hidden' : ''}`}>
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="OMAg Aringay"
              className="h-10 w-10 rounded-full object-contain ring-1 ring-slate-300"
            />
            <div>
              <h1 className="text-sm font-bold text-slate-800 leading-tight">OMAg Aringay</h1>
              <p className="text-[11px] text-slate-500">Aringay, La Union</p>
            </div>
          </div>
          {/* Mobile close button */}
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
            isCollapsed ? 'md:px-1 px-3' : 'px-3',
          ].join(' ')}
        >
          {NAV_GROUPS.map((group) => {
            if (!group.roles.includes(role)) return null
            const visibleItems = group.items.filter((item) => item.roles.includes(role))
            if (!visibleItems.length) return null
            return (
              <div key={group.label} className="mb-1">
                <p
                  className={[
                    'mb-1 mt-3 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400 first:mt-0',
                    isCollapsed ? 'md:hidden' : '',
                  ].join(' ')}
                >
                  {group.label}
                </p>

                {visibleItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      title={isCollapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        [
                          'flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition-all duration-200',
                          isCollapsed ? 'md:justify-center md:px-0 md:border-l-0 md:rounded-lg' : '',
                          isActive
                            ? 'border-[#1E4620] bg-[#e8f5e9] text-[#1E4620]'
                            : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                        ].join(' ')
                      }
                    >
                      <Icon size={17} className="shrink-0" />
                      <span className={isCollapsed ? 'md:hidden' : ''}>
                        {item.label}
                      </span>
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </nav>
      </aside>
    </>
  )
}

export default Sidebar
