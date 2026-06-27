import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLocation } from 'react-router-dom'

function NavGroup({ label, icon: Icon, children, isCollapsed }) {
  const location = useLocation()

  const childPaths = Array.isArray(children)
    ? children.map(c => c?.props?.to).filter(Boolean)
    : children?.props?.to ? [children.props.to] : []

  const hasActiveChild = childPaths.some(p => location.pathname === p || location.pathname.startsWith(p + '/'))

  const storageKey = `nav_group_${label}_open`

  const [isOpen, setIsOpen] = useState(() => {
    if (hasActiveChild) return true
    try {
      const stored = localStorage.getItem(storageKey)
      return stored !== null ? stored === 'true' : false
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (hasActiveChild) setIsOpen(true)
  }, [location.pathname, hasActiveChild])

  const toggle = () => {
    setIsOpen(v => {
      const next = !v
      try { localStorage.setItem(storageKey, String(next)) } catch {}
      return next
    })
  }

  if (isCollapsed) {
    return (
      <div className="relative group mb-0.5">
        <button
          type="button"
          className="flex items-center justify-center w-10 h-10 rounded-xl mx-auto text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
        </button>
        <div className="absolute left-full ml-2 top-0 bg-slate-800 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          {label}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={toggle}
        className={[
          'flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors mb-0.5',
          isOpen || hasActiveChild
            ? 'text-[#1E4620] bg-[#f0f7f0] font-semibold'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
        ].join(' ')}
      >
        <span className="flex items-center gap-3">
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span>{label}</span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="ml-3 pl-3 border-l-2 border-slate-100 space-y-0.5 mb-1">
          {children}
        </div>
      </div>
    </div>
  )
}

export default NavGroup
