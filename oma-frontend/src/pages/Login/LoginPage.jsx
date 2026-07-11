import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, MailWarning } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import logo from '../../assets/LOGO OMAg.jpg'

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [show,     setShow]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendState, setResendState] = useState('idle') // idle | sending | sent | error

  const from = location.state?.from?.pathname || '/dashboard'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError(''); setNeedsVerification(false); setResendState('idle'); setLoading(true)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      if (err.code === 'email_not_verified') {
        setNeedsVerification(true)
        setError(err.message)
      } else {
        setError('Invalid email, username, or password. Please try again.')
      }
    } finally { setLoading(false) }
  }

  const handleResend = async () => {
    setResendState('sending')
    try {
      await api.post('/accounts/resend-verification/', { email: email.trim() })
      setResendState('sent')
    } catch {
      setResendState('error')
    }
  }

  return (
    <div className="min-h-screen bg-[#f0fdf4] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm">

        <img src={logo} alt="OMAg" className="w-20 h-20 object-contain mx-auto mb-3" />

        <p className="text-center font-semibold text-slate-900 text-sm leading-snug mb-1">
          Integrated Agricultural Monitoring<br />
          and Production Management System
        </p>
        <p className="text-center text-xs text-slate-400 mb-6">
          Office of the Municipal Agriculturist - Aringay, La Union
        </p>

        <form onSubmit={handleSubmit}>
          <label className="text-sm font-medium text-slate-700 block mb-1">Email or Username</label>
          <input
            type="text"
            autoComplete="username"
            required
            disabled={loading}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com or username"
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1B4D2E] focus:border-[#1B4D2E] transition-colors"
          />

          <label className="text-sm font-medium text-slate-700 block mb-1">Password</label>
          <div className="relative mb-5">
            <input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              disabled={loading}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-[#1B4D2E] focus:border-[#1B4D2E] transition-colors"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShow(v => !v)}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && !needsVerification && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {needsVerification && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 text-sm text-amber-800 mb-4">
              <div className="flex items-start gap-2">
                <MailWarning className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {resendState === 'sent' ? (
                <p className="mt-2 flex items-center gap-1.5 text-emerald-700 text-xs font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verification email sent — check your inbox.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendState === 'sending'}
                  className="mt-2 text-xs font-semibold text-amber-900 underline hover:no-underline disabled:opacity-60"
                >
                  {resendState === 'sending' ? 'Resending…' : 'Resend verification email'}
                </button>
              )}
              {resendState === 'error' && (
                <p className="mt-1 text-xs text-red-600">Could not resend. Please try again shortly.</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="w-full bg-[#1B4D2E] hover:bg-[#235E38] text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Log In
          </button>
        </form>

        <p className="text-center text-xs text-slate-300 mt-6">Authorized personnel only.</p>
      </div>
    </div>
  )
}

export default LoginPage
