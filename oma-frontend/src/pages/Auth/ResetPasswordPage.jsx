import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import AuthCard from '../../components/UI/AuthCard.jsx'
import Button from '../../components/UI/Button.jsx'
import PasswordRequirementChecklist from '../../components/UI/PasswordRequirementChecklist.jsx'
import { passwordMeetsRules } from '../../utils/passwordRules.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { DEAD_LINK_NOTICE, PASSWORD_SAVED_KEY, isDeadLink, readResetLink, requestErrorText } from './passwordReset.js'

const FIELD =
  'h-12 w-full rounded-[var(--radius-sm)] border border-border-strong px-3.5 text-[16px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25'

function ResetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  // Read once, then taken out of the address bar so the token does not stay in the browser's history.
  const [link] = useState(() => readResetLink(location.hash))
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // `replace`: the Back button must not return to a finished reset.
  const goToSignIn = useCallback((notice) => {
    try { sessionStorage.setItem('omag_login_notice', notice) } catch { /* no storage: just no note */ }
    navigate('/login', { replace: true })
  }, [navigate])

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])

  // A link that is already used (the password was saved), expired or incomplete goes straight to sign-in.
  useEffect(() => {
    let left = false
    const check = link ? api.post('/accounts/reset-password/check/', link) : Promise.reject(new Error('no link'))
    check
      .then(() => { if (!left) setChecking(false) })
      .catch((err) => {
        if (left) return
        if (!link || isDeadLink(err)) goToSignIn(DEAD_LINK_NOTICE)
        else setChecking(false)          // the server could not be asked: show the form, saving checks again
      })
    return () => { left = true }
  }, [link, goToSignIn])

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
      // A session left open in this browser belongs to the old password.
      if (user) await logout()
      try { localStorage.setItem(PASSWORD_SAVED_KEY, String(Date.now())) } catch { /* other tabs just stay as they are */ }
      goToSignIn(data.detail)
    } catch (err) {
      if (isDeadLink(err)) {
        goToSignIn(DEAD_LINK_NOTICE)
        return
      }
      setError(requestErrorText(err))
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <AuthCard>
        <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
          <p className="text-[14px] text-text-secondary">Checking your link…</p>
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

        <label htmlFor="reset-confirm" className="mb-1.5 mt-4 block text-[13px] font-medium text-text-primary">Confirm password</label>
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
