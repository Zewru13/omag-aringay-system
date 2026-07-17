import { useState, useRef, useEffect } from 'react'
import { ChevronDown, HelpCircle, History, LogOut, Menu, User } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import ConfirmDialog from '../UI/ConfirmDialog.jsx'
import NotificationBell from './NotificationBell.jsx'

function formatDate(d) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function Navbar({ onToggleSidebar, isCollapsed }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const dropdownRef = useRef(null)
  const today = new Date()

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogoutConfirm = async () => {
    setShowLogoutConfirm(false)
    await logout()
    navigate('/login', { replace: true })
  }

  const userInitial = (user?.full_name || user?.email || 'U').charAt(0).toUpperCase()

  return (
    <>
      <header
        className={`h-14 bg-[color:var(--color-primary-deep)] shadow-sm fixed top-0 right-0 z-30 flex items-center justify-between px-4 left-0 ${isCollapsed ? 'md:left-16' : 'md:left-[220px]'}`}
        style={{ transition: 'left 300ms ease-in-out' }}
      >
        {/* Left: hamburger + system name */}
        <div className="flex items-center gap-3">
          <button
            className="press-scale w-9 h-9 flex items-center justify-center rounded-lg text-white hover:bg-white/10 transition-colors"
            onClick={onToggleSidebar}
            type="button"
            aria-label="Toggle sidebar"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="hidden md:block font-display text-[14px] font-medium text-white/90 tracking-tight">
            Integrated Agricultural Monitoring System
          </span>
        </div>

        {/* Right: notifications + user dropdown */}
        <div className="flex items-center gap-1">
          <NotificationBell />
          <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            onClick={() => setDropdownOpen((v) => !v)}
          >
            {/* Avatar circle with initial */}
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-[13px] font-semibold text-white leading-none">
                {userInitial}
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-[13px] font-medium text-white leading-tight">
                {user?.full_name || user?.email || 'User'}
              </p>
              <p className="text-[11px] text-white/60 leading-tight">{formatDate(today)}</p>
            </div>
            <ChevronDown size={14} className="text-white/60" />
          </button>

          {dropdownOpen && (
            <div className="stagger-item absolute right-0 top-full mt-1.5 z-50 bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-1 min-w-[190px]">
              {/* Profile header */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1 border-b border-border">
                <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0">
                  <span className="text-[12px] font-semibold text-primary">
                    {userInitial}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-text-primary leading-tight truncate">{user?.full_name || user?.email}</p>
                  <p className="text-[11px] text-text-muted leading-tight capitalize">{user?.role?.toLowerCase()}</p>
                </div>
              </div>

              <Link
                to="/profile"
                className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-[13px] text-text-primary hover:bg-surface-2 transition-colors"
                onClick={() => setDropdownOpen(false)}
              >
                <User size={14} className="text-text-muted" aria-hidden="true" />
                My Profile
              </Link>

              {user?.role === 'ADMIN' && (
                <Link
                  to="/audit-log"
                  className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-[13px] text-text-primary hover:bg-surface-2 transition-colors"
                  onClick={() => setDropdownOpen(false)}
                >
                  <History size={14} className="text-text-muted" aria-hidden="true" />
                  Activity Log
                </Link>
              )}

              <Link
                to="/help"
                className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-[13px] text-text-primary hover:bg-surface-2 transition-colors"
                onClick={() => setDropdownOpen(false)}
              >
                <HelpCircle size={14} className="text-text-muted" aria-hidden="true" />
                Help
              </Link>

              <div className="border-t border-border my-1" />

              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-[13px] text-[color:var(--color-semantic-critical)] hover:bg-[color:var(--color-semantic-critical-bg)] transition-colors"
                onClick={() => { setDropdownOpen(false); setShowLogoutConfirm(true) }}
              >
                <LogOut size={14} aria-hidden="true" />
                Logout
              </button>
            </div>
          )}
        </div>
        </div>
      </header>

      {showLogoutConfirm && (
        <ConfirmDialog
          title="Confirm Logout"
          message="Are you sure you want to log out?"
          confirmLabel="Log Out"
          onConfirm={handleLogoutConfirm}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
    </>
  )
}

export default Navbar
