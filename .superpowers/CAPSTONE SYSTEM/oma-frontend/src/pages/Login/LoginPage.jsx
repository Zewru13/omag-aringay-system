import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import logo from '../../assets/LOGO OMAg.jpg'

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const from = location.state?.from?.pathname || '/dashboard'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError('')
    setIsLoading(true)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch {
      setError('Invalid email or password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f0fdf4] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-10 shadow-lg">

        {/* Logo + branding */}
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={logo}
            alt="OMAg Aringay"
            className="mb-3 h-20 w-20 rounded-full object-contain"
          />
          <h1 className="text-lg font-bold text-[#1E4620]">OMAg Aringay</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Agricultural Monitoring System
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Email Address
            </label>
            <input
              autoComplete="email"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1E4620] focus:outline-none focus:ring-2 focus:ring-[#1E4620]/30 transition-colors"
              disabled={isLoading}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1E4620] focus:outline-none focus:ring-2 focus:ring-[#1E4620]/30 transition-colors"
                disabled={isLoading}
                placeholder="••••••••"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !email.trim() || !password}
            className="w-full rounded-xl bg-[#1E4620] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2D6A31] disabled:opacity-60"
          >
            {isLoading ? 'Signing in…' : 'Login'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          © 2026 OMAg Aringay · Aringay, La Union
        </p>
      </div>
    </div>
  )
}

export default LoginPage
