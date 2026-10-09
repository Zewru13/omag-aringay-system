import { useState } from 'react'
import { AlertCircle, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PasswordRequirementChecklist from '../../components/UI/PasswordRequirementChecklist.jsx'
import { passwordMeetsRules } from '../../utils/passwordRules.js'
import { useAuth } from '../../context/AuthContext.jsx'
import logo from '../../assets/LOGO OMAg.jpg'

function ForceChangePasswordPage() {
  const { user, logout } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [show,     setShow]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setLoading(true)
    try {
      await api.post('/accounts/change-password/', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmPassword,
      })
      setDone(true)
      // The backend just invalidated every token for this account (including
      // this request's own access token) — the only valid next step is a
      // fresh login with the new password.
      setTimeout(() => { logout() }, 1200)
    } catch (err) {
      const data = err.response?.data
      setError(
        data?.new_password?.[0] ||
        data?.detail ||
        data?.non_field_errors?.[0] ||
        'Unable to change password. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#f0fdf4] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm text-center">
          <img src={logo} alt="OMAg" className="w-16 h-16 object-contain mx-auto mb-4" />
          <p className="text-[15px] font-semibold text-slate-900">Password changed</p>
          <p className="text-[13px] text-slate-500 mt-2">
            Please log in again with your new password.
          </p>
          <Loader2 className="w-5 h-5 animate-spin text-[#1B4D2E] mx-auto mt-4" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f0fdf4] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm">
        <img src={logo} alt="OMAg" className="w-16 h-16 object-contain mx-auto mb-3" />

        <div className="flex items-center justify-center gap-1.5 mb-1">
          <ShieldAlert className="w-4 h-4 text-amber-600" />
          <p className="text-center font-semibold text-slate-900 text-sm">Change Your Password</p>
        </div>
        <p className="text-center text-xs text-slate-400 mb-6">
          {user?.email ? `Signed in as ${user.email}. ` : ''}
          For security, you must set a new password before continuing.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="text-sm font-medium text-slate-700 block mb-1">Current (temporary) password</label>
          <input
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            required
            disabled={loading}
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1B4D2E] focus:border-[#1B4D2E] transition-colors"
          />

          <label className="text-sm font-medium text-slate-700 block mb-1">New password</label>
          <div className="relative mb-2">
            <input
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              required
              disabled={loading}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
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

          <div className="mb-4">
            <PasswordRequirementChecklist password={newPassword} />
          </div>

          <label className="text-sm font-medium text-slate-700 block mb-1">Confirm new password</label>
          <input
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            disabled={loading}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-[#1B4D2E] focus:border-[#1B4D2E] transition-colors"
          />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !currentPassword || !passwordMeetsRules(newPassword) || !confirmPassword}
            className="w-full bg-[#1B4D2E] hover:bg-[#235E38] text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Set New Password
          </button>
        </form>

        <p className="text-center text-xs text-slate-300 mt-6">You cannot access the system until this is done.</p>
      </div>
    </div>
  )
}

export default ForceChangePasswordPage
