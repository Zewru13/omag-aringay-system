import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, XCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import AuthCard from '../../components/UI/AuthCard.jsx'
import Button from '../../components/UI/Button.jsx'
import PasswordRequirementChecklist from '../../components/UI/PasswordRequirementChecklist.jsx'
import { passwordMeetsRules } from '../../utils/passwordRules.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { isDeadLink, readResetLink, requestErrorText } from './passwordReset.js'

const FIELD =
  'h-12 w-full rounded-[var(--radius-sm)] border border-border-strong px-3.5 text-[16px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25'

function ResetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  // Read once, then taken out of the address bar so the token does not stay in the browser's history.
  const [link] = useState(() => readResetLink(location.hash))
  const [dead, setDead] = useState(!link)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('New password and confirmation do not match.')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/accounts/reset-password/', { ...link, new_password: password, confirm_new_password: confirm })
      try { sessionStorage.setItem('omag_login_notice', data.detail) } catch { /* no storage: just no note */ }
      // A session left open in this browser belongs to the old password.
      if (user) await logout()
      navigate('/login', { replace: true })
    } catch (err) {
      if (isDeadLink(err)) setDead(true)
      else setError(requestErrorText(err))
      setLoading(false)
    }
  }

  if (dead) {
    return (
      <AuthCard>
        <div className="text-center">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-rose-500" aria-hidden="true" />
          <h1 className="text-[18px] font-bold text-text-primary">This link no longer works</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
            A reset link works once, for 30 minutes. Ask for a new one.
          </p>
          <Button type="button" variant="primary" className="mt-5 w-full" onClick={() => navigate('/forgot-password')}>
            Send a new link
          </Button>
          <Link to="/login" className="mt-4 inline-block text-[13px] font-semibold text-primary hover:underline">Back to sign in</Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <form onSubmit={save}>
        <h1 className="text-[18px] font-bold text-text-primary">Set a new password</h1>

        <label htmlFor="reset-password" className="mb-1.5 mt-5 block text-[13px] font-medium text-text-primary">New password</label>
        <div className="relative">
          <input
            id="reset-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            autoFocus
            disabled={loading}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${FIELD} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted hover:text-text-primary"
          >
            {show ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
          </button>
        </div>
        <div className="mt-2">
          <PasswordRequirementChecklist password={password} />
        </div>

        <label htmlFor="reset-confirm" className="mb-1.5 mt-4 block text-[13px] font-medium text-text-primary">Type it again</label>
        <input
          id="reset-confirm"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          required
          disabled={loading}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={FIELD}
        />

        {error && <p role="alert" className="mt-3 text-[13px] text-[color:var(--color-semantic-critical)]">{error}</p>}
        <Button type="submit" variant="primary" disabled={loading || !passwordMeetsRules(password) || !confirm} className="mt-5 w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {loading ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </AuthCard>
  )
}

export default ResetPasswordPage
