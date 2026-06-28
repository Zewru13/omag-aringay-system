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
    <div className="min-h-screen bg-[#F5F7F5]">
      <Navbar onToggleSidebar={handleSidebarToggle} isCollapsed={sidebarCollapsed} />
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
      />

      <div
        className={[
          'min-h-screen bg-[#F5F7F5] pt-14 transition-all duration-300',
          sidebarCollapsed ? 'md:pl-16' : 'md:pl-[220px]',
        ].join(' ')}
      >
        <main className="p-6">
          {(title || action) && (
            <div className="flex items-start justify-between mb-5">
              <div>
                {title && <h1 className="text-[20px] font-semibold text-[#1A2B1A] leading-tight">{title}</h1>}
                {subtitle && <p className="text-[13px] text-[#7A8E7A] mt-0.5">{subtitle}</p>}
              </div>
              {action && <div className="ml-4 flex-shrink-0">{action}</div>}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}

export default PageLayout
