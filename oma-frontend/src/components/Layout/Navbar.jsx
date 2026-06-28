import { useState, useRef, useEffect } from 'react'
import { ChevronDown, LogOut, Menu, User } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import ConfirmDialog from '../UI/ConfirmDialog.jsx'

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
        className={`h-14 bg-[#1B4D2E] fixed top-0 right-0 z-30 flex items-center justify-between px-4 left-0 ${isCollapsed ? 'md:left-16' : 'md:left-[220px]'}`}
        style={{ transition: 'left 300ms ease-in-out' }}
      >
        {/* Left: hamburger + system name */}
        <div className="flex items-center gap-3">
          <button
            className="w-9 h-9 flex items-center justify-center rounded-lg text-white hover:bg-white/10 transition-colors"
            onClick={onToggleSidebar}
            type="button"
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>
          <span className="hidden md:block text-[13px] font-medium text-white/85">
            Integrated Agricultural Monitoring System
          </span>
        </div>

        {/* Right: user dropdown */}
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
            <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-[#E2E8E2] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-1 min-w-[180px]">
              {/* Profile header */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1 border-b border-[#F0F4F0]">
                <div className="w-7 h-7 rounded-full bg-[#EBF5EE] flex items-center justify-center flex-shrink-0">
                  <span className="text-[12px] font-semibold text-[#1B4D2E]">
                    {userInitial}
                  </span>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[#1A2B1A] leading-tight">{user?.full_name || user?.email}</p>
                  <p className="text-[11px] text-[#7A8E7A] leading-tight capitalize">{user?.role?.toLowerCase()}</p>
                </div>
              </div>

              <Link
                to="/profile"
                className="flex items-center gap-2 px-3 py-2 rounded-md text-[13px] text-[#1A2B1A] hover:bg-[#F5F7F5] transition-colors"
                onClick={() => setDropdownOpen(false)}
              >
                <User size={14} className="text-[#7A8E7A]" />
                My Profile
              </Link>

              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-[13px] text-[#C0392B] hover:bg-[#FEE2E2] transition-colors"
                onClick={() => { setDropdownOpen(false); setShowLogoutConfirm(true) }}
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          )}
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
