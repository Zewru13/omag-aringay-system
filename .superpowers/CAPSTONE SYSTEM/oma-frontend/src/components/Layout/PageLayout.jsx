import { useState } from 'react'
import Navbar from './Navbar.jsx'
import Sidebar from './Sidebar.jsx'

function PageLayout({ title, subtitle, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar onToggleSidebar={handleSidebarToggle} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {(title || subtitle) && (
            <div className="px-4 pb-2 pt-6 md:px-6">
              {title && <h1 className="text-xl font-bold text-slate-900">{title}</h1>}
              {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
            </div>
          )}
          <div className="p-4 md:p-6 md:pt-4">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default PageLayout
