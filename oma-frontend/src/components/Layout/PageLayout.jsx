import { useState } from 'react'
import Navbar from './Navbar.jsx'
import Sidebar from './Sidebar.jsx'

function PageLayout({ title, subtitle, action, children }) {
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
    <div className="min-h-screen bg-bg">
      <Navbar onToggleSidebar={handleSidebarToggle} isCollapsed={sidebarCollapsed} />
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
      />

      <div
        className={[
          'min-h-screen bg-bg pt-14 transition-all duration-300',
          sidebarCollapsed ? 'md:pl-16' : 'md:pl-[248px]',
        ].join(' ')}
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
