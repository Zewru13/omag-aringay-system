import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
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
    <div className="min-h-screen flex">

      {/* LEFT PANEL — 40% width, green bg, hidden on mobile */}
      <div className="hidden md:flex md:w-2/5 bg-[#1B4D2E] flex-col items-center justify-center relative px-10 py-12">
        {/* Logo */}
        <img src={logo} alt="OMAg" className="w-16 h-16 object-contain brightness-0 invert" />

        {/* System name */}
        <h1 className="mt-5 text-center text-[18px] font-semibold text-white leading-relaxed max-w-[280px]">
          Integrated Agricultural<br />
          Monitoring and Production<br />
          Management System
        </h1>

        {/* Divider */}
        <div className="w-12 h-px bg-white/20 my-5" />

        {/* Office name */}
        <p className="text-[13px] text-white/75 text-center">Office of the Municipal Agriculturist</p>
        <p className="text-[12px] text-white/55 text-center mt-1.5">Aringay, La Union</p>

        {/* Bottom footer */}
        <div className="absolute bottom-6 text-center">
          <p className="text-[11px] text-white/40">Department of Agriculture</p>
          <p className="text-[11px] text-white/40 mt-0.5">Region I — Ilocos</p>
        </div>
      </div>

      {/* RIGHT PANEL — 60% width (full width on mobile) */}
      <div className="flex-1 bg-[#F5F7F5] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px]">

          {/* Mobile: logo above form */}
          <div className="flex flex-col items-center mb-6 md:hidden">
            <img src={logo} alt="OMAg" className="w-10 h-10 object-contain" />
            <p className="text-center text-[13px] font-semibold text-[#1A2B1A] leading-snug mt-2 max-w-[240px]">
              Integrated Agricultural Monitoring and Production Management System
            </p>
          </div>

          {/* Welcome text */}
          <h2 className="text-[22px] font-semibold text-[#1A2B1A]">Welcome back</h2>
          <p className="text-[13px] text-[#7A8E7A] mt-1 mb-7">Sign in to your account</p>

          {/* Form card */}
          <div className="bg-white border border-[#E2E8E2] rounded-2xl p-7">
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Email field */}
              <div>
                <label className="block text-[13px] font-medium text-[#4A5E4A] mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8BCA8] pointer-events-none" size={16} />
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 border border-[#E2E8E2] rounded-lg text-[13px] text-[#1A2B1A] bg-white placeholder-[#A8BCA8] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label className="block text-[13px] font-medium text-[#4A5E4A] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8BCA8] pointer-events-none" size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-10 pl-9 pr-10 border border-[#E2E8E2] rounded-lg text-[13px] text-[#1A2B1A] bg-white placeholder-[#A8BCA8] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A8BCA8] hover:text-[#7A8E7A] transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg px-3.5 py-2.5">
                  <AlertCircle className="text-[#991B1B] flex-shrink-0" size={16} />
                  <p className="text-[13px] text-[#991B1B]">{error}</p>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading || !email.trim() || !password}
                className="w-full h-[42px] bg-[#1B4D2E] hover:bg-[#235E38] text-white text-[14px] font-medium rounded-lg mt-2 flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Signing in...
                  </>
                ) : 'Sign In'}
              </button>

            </form>
          </div>

          {/* Footer note */}
          <p className="text-center text-[11px] text-[#A8BCA8] mt-6">
            Authorized personnel only.
          </p>
        </div>
      </div>

    </div>
  )
}

export default LoginPage
