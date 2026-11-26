import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import AuthCard from '../../components/UI/AuthCard.jsx'
import Button from '../../components/UI/Button.jsx'
import EmailInput from '../../components/UI/EmailInput.jsx'
import { requestErrorText } from './passwordReset.js'

const BACK = 'mt-5 flex min-h-10 items-center justify-center gap-1.5 text-[13px] font-semibold text-primary hover:underline'

function ForgotPasswordPage() {
  const location = useLocation()
  const [email, setEmail] = useState(location.state?.email || '')
  const [sentTo, setSentTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const send = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setError('')
    setLoading(true)
    try {
      await api.post('/accounts/forgot-password/', { email: email.trim() })
      setSentTo(email.trim())
    } catch (err) {
      setError(requestErrorText(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard>
      {sentTo ? (
        <div role="status" className="text-center">
          <MailCheck className="mx-auto mb-3 h-10 w-10 text-primary" aria-hidden="true" />
          <h1 className="text-[18px] font-bold text-text-primary">Check your email</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
            If <span className="font-semibold break-all">{sentTo}</span> has an account, we sent it a link to set a new password.
            The link works once, for 30 minutes.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-text-secondary">
            Nothing after a few minutes? Look in your Spam folder, or visit the Office of the Municipal Agriculturist with a valid ID.
          </p>
        </div>
      ) : (
        <form onSubmit={send}>
          <h1 className="text-[18px] font-bold text-text-primary">Forgot your password?</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-text-secondary">
            Enter the email you sign in with. We will send you a link to set a new password.
          </p>
          <label htmlFor="forgot-email" className="mb-1.5 mt-5 block text-[13px] font-medium text-text-primary">Email</label>
          <EmailInput
            id="forgot-email"
            required
            autoFocus
            disabled={loading}
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            className="h-12 w-full rounded-[var(--radius-sm)] border border-border-strong px-3.5 text-[16px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
          {error && <p role="alert" className="mt-3 text-[13px] text-[color:var(--color-semantic-critical)]">{error}</p>}
          <Button type="submit" variant="primary" disabled={loading || !email.trim()} className="mt-5 w-full">
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {loading ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <Link to="/login" className={BACK}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to sign in
      </Link>
    </AuthCard>
  )
}

export default ForgotPasswordPage
