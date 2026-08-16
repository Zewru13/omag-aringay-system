import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import api from '../api/axiosInstance.js'
import Button from './UI/Button.jsx'
import ModalShell from './UI/ModalShell.jsx'

const labelCls = 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'

// Shared across the Farmer/Fisherfolk/FarmersOrganization/
// FisherfolkOrganization detail pages — each passes its own record's
// `citizen_account` field (see accounts.utils.citizen_account_info) and a
// refetch callback. Renders nothing when there's no linked account, or it's
// already active.
//
// Staff generate the account's password here — a strong random string
// (accounts.utils.generate_default_password, same generator used for
// ADMIN/EVALUATOR accounts) — and read it aloud to the person in front of
// them, same identity check enrollment itself relies on. The person can use
// the account immediately with it; there is no forced change-password step,
// though they can change it later at their own discretion from their
// profile.
export default function ActivateCitizenAccountButton({ citizenAccount, personLabel, onActivated }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  if (!citizenAccount || citizenAccount.is_active) return null

  const handleClose = () => {
    // onActivated (the parent's refetch) is deliberately deferred to here,
    // not called right after the POST succeeds — the parent pages refetch
    // by toggling a loading flag that unmounts this component's whole
    // subtree, which would wipe the just-generated password off the screen
    // before staff ever got to read it aloud. Waiting until the one-time
    // password screen is actually dismissed means nothing pulls the rug out
    // from under it while it's still showing.
    const didActivate = Boolean(result)
    setIsOpen(false)
    setResult(null)
    setError('')
    setCopied(false)
    if (didActivate) onActivated?.()
  }

  const handleActivate = async () => {
    setIsSubmitting(true)
    setError('')
    try {
      const { data } = await api.post(`/accounts/users/${citizenAccount.id}/set-citizen-password/`)
      setResult(data)
    } catch (err) {
      const data = err?.response?.data
      const msg = typeof data === 'string' ? data
        : Object.values(data || {}).flat().join(' ') || 'Failed to set up account.'
      setError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.generated_password)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable — password is still visible to copy manually */ }
  }

  return (
    <>
      <Button icon={KeyRound} onClick={() => setIsOpen(true)} variant="primary">
        Set Up Account
      </Button>

      {isOpen && (
        <ModalShell title="Set Up Account" subtitle={personLabel} onClose={handleClose} maxWidth="max-w-lg">
          {!result ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-3">
                <p className="text-[13px] font-medium text-amber-900">
                  This generates a password for {personLabel || 'the person'}'s account and activates it immediately.
                </p>
                <p className="mt-1.5 text-[12px] text-amber-800">
                  Read the password aloud to them once it's shown — do not write it down or send it anywhere.
                </p>
              </div>
              {error && <p className="text-[12px] text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-3">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button type="button" variant="primary" isLoading={isSubmitting} onClick={handleActivate}>
                  Generate &amp; Activate
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-50 border border-emerald-300 px-4 py-3">
                <p className="text-[13px] font-medium text-emerald-900">
                  Account is now active. Read this password aloud to {personLabel || 'the person'} now — it won't be shown again.
                </p>
              </div>
              <div>
                <label className={labelCls}>Password (shown once)</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2 text-[14px] font-mono text-[#1A2B1A] break-all">
                    {result.generated_password}
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
              </div>
              <div className="flex justify-end border-t border-[#F0F4F0] pt-3">
                <Button type="button" variant="primary" onClick={handleClose}>Done</Button>
              </div>
            </div>
          )}
        </ModalShell>
      )}
    </>
  )
}
