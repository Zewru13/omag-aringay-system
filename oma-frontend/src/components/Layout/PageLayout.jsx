import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import useIsPhone from '../../hooks/useIsPhone.js'
import CitizenPhoneShell from '../../pages/Citizen/CitizenPhoneShell.jsx'
import Navbar from './Navbar.jsx'
import Sidebar from './Sidebar.jsx'

// `subtitle` is still accepted from the pages but no longer shown.
function PageLayout({ title, action, children }) {
  const { isFisherfolk, isFarmer, isOrg, isFisherfolkOrg } = useAuth()
  const isPhone = useIsPhone()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Fisherfolk accounts: the fisheries blue theme for the whole layout (index.css
  // [data-account-theme="fisherfolk"]). Set on <html> so it also reaches modals, which portal to <body>;
  // removed when the layout unmounts (e.g. logout) or for any other role.
  useEffect(() => {
    if (!isFisherfolk && !isFisherfolkOrg) return undefined
    const root = document.documentElement
    root.setAttribute('data-account-theme', 'fisherfolk')
    return () => root.removeAttribute('data-account-theme')
  }, [isFisherfolk, isFisherfolkOrg])

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

  // A fisherfolk, farmer or organization account on a phone gets the citizen-style shell (header, avatar menu, bottom tabs)
  // instead of the admin sidebar layout. Everyone else, and tablets/desktops, keep the layout below untouched.
  if ((isFisherfolk || isFarmer || isOrg) && isPhone) {
    return <CitizenPhoneShell title={title} action={action}>{children}</CitizenPhoneShell>
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
          {/* No visible page title block: the sidebar already shows where you are. The title stays for screen readers
              and the page's action button (e.g. Create User) sits in a slim row above the content. */}
          {title && <h1 className="sr-only">{title}</h1>}
          {action && <div className="mb-4 flex justify-end">{action}</div>}
          {children}
        </main>
      </div>
    </div>
  )
}

export default PageLayout
