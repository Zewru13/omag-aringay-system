import { useEffect, useState } from 'react'
import { Check, Copy, KeyRound, RotateCcw } from 'lucide-react'
import api from '../api/axiosInstance.js'
import { readPasswordReveal, storePasswordReveal } from '../utils/passwordReveal.js'
import Button from './UI/Button.jsx'
import ModalShell from './UI/ModalShell.jsx'

const labelCls = 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'

// Shared across the Farmer/Fisherfolk/FarmersOrganization/
// FisherfolkOrganization detail pages — each passes its own record's
// `citizen_account` field (see accounts.utils.citizen_account_info) and a
// refetch callback. Renders nothing when there's no linked account at all.
//
// Staff generate the account's password here — a strong random string
// (accounts.utils.generate_default_password, same generator used for
// ADMIN/EVALUATOR accounts) — and read it aloud to the person in front of
// them, same identity check enrollment itself relies on. The person can use
// the account immediately with it; there is no forced change-password step,
// though they can change it later at their own discretion from their
// profile.
//
// Password-reveal batch: the generated password used to live only in this
// component's own React state, which any navigation away (even mid-modal)
// or a refresh would destroy with no way back — confirmed live: closing the
// button's parent record and reopening it left the "Set Up Account" button
// permanently gone (the account was already active) with no way to see the
// password again. It's now also mirrored into sessionStorage (see
// utils/passwordReveal.js) keyed by the account's real id, so a fresh mount
// of this exact component — same account, same browser tab/session — can
// recover it. The backend is completely unchanged for the original
// activation; this is a client-side durability fix, not a new persistence
// layer for the password itself (no new stored-plaintext field anywhere).
//
// This also resolves the "multi-account" scenario from Step 0 as a side
// effect, not a targeted fix: since each account's reveal is now keyed and
// recoverable independently, activating a second account no longer matters
// to the first's — there was never any shared state between them to begin
// with (Step 0 found the original bug was that leaving ANY account's page
// destroyed ITS OWN reveal instantly, not that two accounts interfered with
// each other).
export default function ActivateCitizenAccountButton({ citizenAccount, personLabel, onActivated }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)
  // Only the ORIGINAL activation (inactive -> active) needs the parent to
  // refetch — that's the one field change (is_active, plus whatever else
  // the parent's own record shape carries) it can't otherwise know about.
  // Regenerating a password, and recovering an already-stored reveal on
  // mount, change nothing the parent's record displays.
  const [justActivated, setJustActivated] = useState(false)
  // True only when the currently-shown result came from sessionStorage
  // recovery, not a live POST in this render. Needed because by the time a
  // recovery is even possible (a fresh mount, i.e. real navigation
  // happened), citizenAccount.is_active has already caught up to true from
  // the server regardless of whether this was the original activation or a
  // later regenerate — so is_active alone can't tell "just activated,
  // recovered on the next visit" apart from "just regenerated". Without
  // this flag the recovered case would wrongly render the regenerate
  // copy ("Password regenerated...") for a password nothing regenerated.
  const [recovered, setRecovered] = useState(false)

  const accountId = citizenAccount?.id

  // Recover a still-valid stored reveal the moment this mounts against a
  // real account — covers navigate-away-and-back, a refresh, and (per Step
  // 0) landing back on Account A's page after activating Account B in
  // between, since this effect re-runs fresh for whichever account is
  // current. readPasswordReveal itself clears anything expired or already
  // superseded by a real login (citizenAccount.last_login), so finding
  // nothing here and finding something-but-invalid look identical.
  useEffect(() => {
    if (!accountId) return
    const stored = readPasswordReveal(accountId, citizenAccount.last_login)
    if (stored) {
      setResult({ generated_password: stored.password })
      setRecovered(true)
      setIsOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, citizenAccount?.last_login])

  if (!citizenAccount) return null

  const isActive = citizenAccount.is_active

  const openModal = () => {
    setResult(null)
    setError('')
    setJustActivated(false)
    setRecovered(false)
    setIsOpen(true)
  }

  const handleClose = () => {
    // onActivated (the parent's refetch) is deliberately deferred to here,
    // not called right after the POST succeeds — the parent pages refetch
    // by toggling a loading flag that unmounts this component's whole
    // subtree, which would wipe the just-generated password off the screen
    // before staff ever got to read it aloud. Waiting until the one-time
    // password screen is actually dismissed means nothing pulls the rug out
    // from under it while it's still showing. The stored reveal is
    // deliberately NOT cleared here — closing this dialog only hides it for
    // now; it comes back automatically on the next visit within the window,
    // exactly like a fresh mount finding it.
    const shouldRefetch = justActivated
    setIsOpen(false)
    setResult(null)
    setError('')
    setCopied(false)
    setJustActivated(false)
    setRecovered(false)
    if (shouldRefetch) onActivated?.()
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError('')
    try {
      const url = isActive
        ? `/accounts/users/${citizenAccount.id}/regenerate-citizen-password/`
        : `/accounts/users/${citizenAccount.id}/set-citizen-password/`
      const { data } = await api.post(url)
      setResult(data)
      setRecovered(false)
      storePasswordReveal(citizenAccount.id, data.generated_password)
      if (!isActive) setJustActivated(true)
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
      {isActive ? (
        <Button icon={RotateCcw} onClick={openModal} variant="outline" size="sm">
          Regenerate Password
        </Button>
      ) : (
        <Button icon={KeyRound} onClick={openModal} variant="primary">
          Set Up Account
        </Button>
      )}

      {isOpen && (
        <ModalShell
          title={recovered ? 'Account Password' : isActive ? 'Regenerate Password' : 'Set Up Account'}
          subtitle={personLabel}
          onClose={handleClose}
          maxWidth="max-w-lg"
          footer={!result ? (
            <>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="button" variant="primary" isLoading={isSubmitting} onClick={handleSubmit}>
                {isActive ? 'Regenerate' : 'Generate & Activate'}
              </Button>
            </>
          ) : (
            <Button type="button" variant="primary" onClick={handleClose}>Done</Button>
          )}
        >
          {!result ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-3">
                <p className="text-[13px] font-medium text-amber-900">
                  {isActive
                    ? `This generates a new password for ${personLabel || 'the person'}'s account, immediately invalidating the current one.`
                    : `This generates a password for ${personLabel || 'the person'}'s account and activates it immediately.`}
                </p>
                <p className="mt-1.5 text-[12px] text-amber-800">
                  Read the password aloud to them once it's shown — do not write it down or send it anywhere.
                </p>
              </div>
              {error && <p className="text-[12px] text-red-600">{error}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-50 border border-emerald-300 px-4 py-3">
                <p className="text-[13px] font-medium text-emerald-900">
                  {recovered
                    ? `This password is still waiting to be read aloud to ${personLabel || 'the person'} — recovered from where you left off.`
                    : isActive
                      ? `Password regenerated. Read it aloud to ${personLabel || 'the person'} now — it won't be shown again.`
                      : `Account is now active. Read this password aloud to ${personLabel || 'the person'} now — it won't be shown again.`}
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
                <p className="mt-1.5 text-[11px] text-[#7A8E7A]">
                  This stays recoverable on this screen for 15 minutes, or until {personLabel || 'they'} first log in — whichever comes first.
                </p>
              </div>
            </div>
          )}
        </ModalShell>
      )}
    </>
  )
}
