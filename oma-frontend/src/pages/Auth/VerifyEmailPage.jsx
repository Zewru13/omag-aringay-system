import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, MailWarning, XCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import logo from '../../assets/LOGO OMAg.jpg'

function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [status, setStatus] = useState(token ? 'verifying' : 'missing') // verifying | success | invalid | expired | missing
  const [message, setMessage] = useState('')
  const [resendEmail, setResendEmail] = useState('')
  const [resendState, setResendState] = useState('idle') // idle | sending | sent | error

  useEffect(() => {
    if (!token) return
    api.post('/accounts/verify-email/', { token })
      .then(r => {
        setStatus('success')
        setMessage(r.data.detail)
      })
      .catch(err => {
        const code = err.response?.data?.code
        setStatus(code === 'expired_token' ? 'expired' : 'invalid')
        setMessage(err.response?.data?.detail || 'This verification link is invalid.')
      })
  }, [token])

  const handleResend = async (e) => {
    e.preventDefault()
    if (!resendEmail.trim()) return
    setResendState('sending')
    try {
      await api.post('/accounts/resend-verification/', { email: resendEmail.trim() })
      setResendState('sent')
    } catch {
      setResendState('error')
    }
  }

  return (
    <div className="min-h-screen bg-[#f0fdf4] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm text-center">
        <img src={logo} alt="OMAg" className="w-16 h-16 object-contain mx-auto mb-4" />

        {status === 'verifying' && (
          <>
            <Loader2 className="w-8 h-8 text-[#1B4D2E] animate-spin mx-auto mb-3" />
            <p className="text-[15px] font-semibold text-slate-900">Verifying your email…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
            <p className="text-[15px] font-semibold text-slate-900">Email verified!</p>
            <p className="text-[13px] text-slate-500 mt-2">
              You can now log in with the temporary password from your email.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="mt-5 w-full bg-[#1B4D2E] hover:bg-[#235E38] text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
            >
              Go to Login
            </button>
          </>
        )}

        {(status === 'invalid' || status === 'expired' || status === 'missing') && (
          <>
            <XCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
            <p className="text-[15px] font-semibold text-slate-900">
              {status === 'missing' ? 'No verification token provided.' : 'Verification failed'}
            </p>
            <p className="text-[13px] text-slate-500 mt-2">
              {status === 'missing'
                ? 'This link is missing its token — make sure you opened the full link from your email.'
                : message}
            </p>

            {status === 'expired' && (
              <div className="mt-5 pt-5 border-t border-slate-100 text-left">
                {resendState === 'sent' ? (
                  <p className="flex items-center gap-1.5 text-emerald-700 text-[13px] font-medium justify-center">
                    <CheckCircle2 className="w-4 h-4" /> New verification link sent — check your inbox.
                  </p>
                ) : (
                  <form onSubmit={handleResend}>
                    <label className="text-[12px] font-medium text-slate-700 flex items-center gap-1.5 mb-1.5">
                      <MailWarning className="w-3.5 h-3.5 text-amber-600" /> Request a new verification link
                    </label>
                    <input
                      type="email"
                      required
                      value={resendEmail}
                      onChange={e => setResendEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#1B4D2E] focus:border-[#1B4D2E] transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={resendState === 'sending'}
                      className="w-full bg-[#1B4D2E] hover:bg-[#235E38] text-white font-semibold py-2 rounded-xl text-sm transition-colors disabled:opacity-60"
                    >
                      {resendState === 'sending' ? 'Sending…' : 'Resend verification email'}
                    </button>
                    {resendState === 'error' && (
                      <p className="mt-1.5 text-xs text-red-600 text-center">Could not resend. Please try again shortly.</p>
                    )}
                  </form>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default VerifyEmailPage
