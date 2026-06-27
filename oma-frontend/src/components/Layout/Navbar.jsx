import { useState, useRef, useEffect } from 'react'
import { ChevronDown, LogOut, Menu, User, UserCircle } from 'lucide-react'
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

  return (
    <>
      <header
        className={`flex h-14 shrink-0 items-center justify-between bg-[#1E4620] px-4 fixed top-0 right-0 z-30 left-0 ${isCollapsed ? 'md:left-16' : 'md:left-[220px]'}`}
        style={{ transition: 'left 300ms ease-in-out' }}
      >
        {/* Left: hamburger + system name */}
        <div className="flex items-center gap-3">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-[#2D6A31]"
            onClick={onToggleSidebar}
            type="button"
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-medium text-white hidden md:block">
            Integrated Agricultural Monitoring and Production Management System
          </span>
        </div>

        {/* Right: user dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-white transition hover:bg-[#2D6A31]"
            onClick={() => setDropdownOpen((v) => !v)}
          >
            <UserCircle size={20} />
            <div className="hidden text-left sm:block">
              <p className="text-xs font-semibold leading-none">{user?.full_name || user?.email || 'User'}</p>
              <p className="text-xs text-green-200 leading-none mt-0.5">{formatDate(today)}</p>
            </div>
            <ChevronDown size={14} className="text-white/70" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-slate-100 bg-white py-1 shadow-lg">
              <Link
                to="/profile"
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setDropdownOpen(false)}
              >
                <User size={14} />
                My Profile
              </Link>
              <div className="border-t border-slate-100 my-1" />
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"
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