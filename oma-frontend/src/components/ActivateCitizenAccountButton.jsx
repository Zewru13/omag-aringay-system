import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import api from '../api/axiosInstance.js'
import Button from './UI/Button.jsx'
import ModalShell from './UI/ModalShell.jsx'
import { useToast } from '../context/ToastContext.jsx'

const labelCls = 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'

// Batch 10: shared across the Farmer/Fisherfolk/FarmersOrganization/
// FisherfolkOrganization detail pages — each passes its own record's
// `citizen_account` field (see accounts.utils.citizen_account_info) and a
// refetch callback. Renders nothing when there's no linked account, or it's
// already active — matching "visible only when a linked CITIZEN account
// exists and is_active=False" from the spec.
export default function ActivateCitizenAccountButton({ citizenAccount, personLabel, onActivated }) {
  const { showToast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  if (!citizenAccount || citizenAccount.is_active) return null

  const handleActivate = async () => {
    setIsSubmitting(true)
    try {
      const r = await api.post(`/accounts/users/${citizenAccount.id}/activate-citizen/`)
      setResult(r.data)
      // Deliberately NOT calling onActivated() here. Most parent pages'
      // refetch toggles an isLoading flag that unmounts this component's
      // entire subtree (and this local `result` state with it) while the
      // modal is supposed to be showing the one-time password. Refreshing
      // is deferred to modal dismissal instead — see handleClose.
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to activate account.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.temp_password)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable — value is still visible to copy manually */ }
  }

  const handleClose = () => {
    setResult(null)
    onActivated?.()
  }

  return (
    <>
      <Button icon={KeyRound} onClick={handleActivate} variant="primary" isLoading={isSubmitting}>
        Activate Account
      </Button>

      {result && (
        <ModalShell title="Account Activated" subtitle={personLabel} onClose={handleClose} maxWidth="max-w-lg">
          <div className="space-y-4">
            <div className="rounded-lg bg-[#FEF3C7] border border-[#FDE68A] px-4 py-3 text-[12px] text-[#92400E]">
              This account has no email on file — this is the only place the temporary password is shown. Relay it to the person directly.
            </div>
            <div>
              <label className={labelCls}>Temporary Password (shown once)</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2 text-[13px] font-mono text-[#1A2B1A] break-all">
                  {result.temp_password}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 rounded-lg border border-[#C8D5C8] p-2 text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors"
                  title="Copy password"
                >
                  {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                </button>
              </div>
              <p className="text-[11px] text-[#A8BCA8] mt-1">
                They'll be required to set their own password on first login.
              </p>
            </div>
            <div className="flex justify-end border-t border-[#F0F4F0] pt-3">
              <Button type="button" variant="outline" onClick={handleClose}>Done</Button>
            </div>
          </div>
        </ModalShell>
      )}
    </>
  )
}
