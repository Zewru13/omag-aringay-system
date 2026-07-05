import { useState, useRef, useEffect } from 'react'
import { ChevronDown, LogOut, Menu, User } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

function Navbar({ onToggleSidebar }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    setDropdownOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  const roleLabel = user?.role === 'ADMIN' ? 'Admin' : 'Evaluator'
  const roleBg = user?.role === 'ADMIN' ? 'bg-white/10 text-white' : 'bg-blue-500/20 text-blue-200'

  return (
    <header className="flex h-14 shrink-0 items-center justify-between bg-[#2D6A31] px-4 md:px-6">
      {/* Left: hamburger toggle + brand */}
      <div className="flex items-center gap-3">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-white/10"
          onClick={onToggleSidebar}
          type="button"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
        <span className="text-sm font-medium text-white">OMAg Aringay</span>
      </div>

      {/* Right: user dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-white transition hover:bg-white/10"
          onClick={() => setDropdownOpen((v) => !v)}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white">
            {(user?.full_name || user?.email || 'U')[0].toUpperCase()}
          </div>
          <div className="hidden items-start sm:flex sm:flex-col">
            <span className="text-xs font-medium leading-none text-white">
              {user?.full_name || user?.email || 'User'}
            </span>
            <span className={`mt-0.5 rounded-full px-1.5 py-px text-[10px] font-medium ${roleBg}`}>
              {roleLabel}
            </span>
          </div>
          <ChevronDown size={14} className="text-white/70" />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-slate-100 bg-white py-1 shadow-lg">
            <Link
              to="/profile"
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => setDropdownOpen(false)}
            >
              <User size={14} />
              My Profile
            </Link>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"
              onClick={handleLogout}
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

export default Navbar
