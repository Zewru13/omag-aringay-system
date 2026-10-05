import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import useIsPhone from '../../hooks/useIsPhone.js'
import CitizenPhoneShell from '../../pages/Citizen/CitizenPhoneShell.jsx'
import Navbar from './Navbar.jsx'
import Sidebar from './Sidebar.jsx'

function PageLayout({ title, subtitle, action, children }) {
  const { isFisherfolk, isFarmer } = useAuth()
  const isPhone = useIsPhone()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Fisherfolk accounts: the fisheries blue theme for the whole layout (index.css
  // [data-account-theme="fisherfolk"]). Set on <html> so it also reaches modals, which portal to <body>;
  // removed when the layout unmounts (e.g. logout) or for any other role.
  useEffect(() => {
    if (!isFisherfolk) return undefined
    const root = document.documentElement
    root.setAttribute('data-account-theme', 'fisherfolk')
    return () => root.removeAttribute('data-account-theme')
  }, [isFisherfolk])

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const handleSidebarToggle = () => {
    if (window.innerWidth < 768) {
      setSidebarOpen((prev) => !prev)
    } else {
      setSidebarCollapsed((prev) => {
        const next = !prev
        try {
          localStorage.setItem('sidebar_collapsed', String(next))
        } catch {}
        return next
      })
    }
  }

  // A fisherfolk or farmer account on a phone gets the citizen-style shell (header, avatar menu, bottom tabs)
  // instead of the admin sidebar layout. Everyone else, and tablets/desktops, keep the layout below untouched.
  if ((isFisherfolk || isFarmer) && isPhone) {
    return <CitizenPhoneShell title={title} subtitle={subtitle} action={action}>{children}</CitizenPhoneShell>
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar onToggleSidebar={handleSidebarToggle} isCollapsed={sidebarCollapsed} />
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
      />

      <div
        className="sidebar-content-offset min-h-screen bg-white pt-14 transition-all duration-300"
        style={{ '--sidebar-w': sidebarCollapsed ? '64px' : '248px' }}
      >
        <main className="p-4 sm:p-6">
          {(title || action) && (
            <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
              <div>
                {title && <h1 className="font-display text-[22px] font-semibold text-text-primary leading-tight tracking-tight">{title}</h1>}
                {subtitle && <p className="text-[13px] text-text-secondary mt-0.5">{subtitle}</p>}
              </div>
              {action && <div className="ml-auto flex-shrink-0">{action}</div>}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}

export default PageLayout
