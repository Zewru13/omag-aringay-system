import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import api from '../api/axiosInstance.js'
import Button from './UI/Button.jsx'
import ModalShell from './UI/ModalShell.jsx'
import { useToast } from '../context/ToastContext.jsx'

const labelCls = 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'
const inputCls = 'w-full rounded-lg border border-[#C8D5C8] px-3 py-2 text-[13px] text-[#1A2B1A] focus:outline-none focus:border-[#4A7A4A]'

// Shared across the Farmer/Fisherfolk/FarmersOrganization/
// FisherfolkOrganization detail pages — each passes its own record's
// `citizen_account` field (see accounts.utils.citizen_account_info) and a
// refetch callback. Renders nothing when there's no linked account, or it's
// already active.
//
// This account has no email on file, so the person must be physically
// present for staff to have confirmed who they are — same identity check
// enrollment itself relies on. They type their own password here directly;
// staff never see or relay it, and there is no temp password anywhere in
// this flow to force a later change away from.
export default function ActivateCitizenAccountButton({ citizenAccount, personLabel, onActivated }) {
  const { showToast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  if (!citizenAccount || citizenAccount.is_active) return null

  const reset = () => { setPassword(''); setConfirmPassword(''); setError('') }

  const handleClose = () => { setIsOpen(false); reset() }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Password and confirmation do not match.')
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      await api.post(`/accounts/users/${citizenAccount.id}/set-citizen-password/`, {
        password, confirm_password: confirmPassword,
      })
      showToast('Account is now active.', 'success')
      handleClose()
      onActivated?.()
    } catch (err) {
      const data = err?.response?.data
      const msg = typeof data === 'string' ? data
        : Object.values(data || {}).flat().join(' ') || 'Failed to set up account.'
      setError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button icon={KeyRound} onClick={() => setIsOpen(true)} variant="primary">
        Set Up Account
      </Button>

      {isOpen && (
        <ModalShell title="Set Up Account" subtitle={personLabel} onClose={handleClose} maxWidth="max-w-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-3">
              <p className="text-[13px] font-medium text-amber-900">
                Hand this device to {personLabel || 'the person'} now. They should type their own password directly below — staff should not enter it on their behalf.
              </p>
              <p className="mt-1.5 text-[12px] text-amber-800">
                It is never shown to or stored by staff. The account activates immediately once submitted.
              </p>
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputCls}
                autoComplete="new-password"
                required
              />
            </div>
            {error && <p className="text-[12px] text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-3">
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" variant="primary" isLoading={isSubmitting}>Activate Account</Button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  )
}
