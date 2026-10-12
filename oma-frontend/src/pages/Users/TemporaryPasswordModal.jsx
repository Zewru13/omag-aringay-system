import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'

// Shown ONLY when a temporary password could not be e-mailed: the administrator is given it once, to pass on in person.
// (When the e-mail is sent, the password is never shown anywhere.)
//   outcome: { title, reason, password, link, email } from staffPasswordOutcome.js

function CopyLine({ label, value, mono = 'text-[13px]' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* the text can still be selected and copied by hand */ }
  }
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-[#4A5E4A]">{label}</p>
      <div className="flex items-center gap-2">
        <code className={`flex-1 break-all rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2 font-mono text-[#1A2B1A] ${mono}`}>{value}</code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg border border-[#C8D5C8] p-2 text-[#4A5E4A] transition-colors hover:bg-[#F5F7F5]"
          title={`Copy ${label.toLowerCase()}`}
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  )
}

export default function TemporaryPasswordModal({ outcome, onClose }) {
  return (
    <ModalShell
      title={outcome.title}
      subtitle="The e-mail could not be sent"
      icon={KeyRound}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={<Button type="button" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-[#FDE68A] bg-[#FEF3C7] px-4 py-3 text-[12px] text-[#92400E]">
          The e-mail to {outcome.email} could not be sent{outcome.reason ? ` (${outcome.reason.replace(/[.\s]+$/, '')})` : ''}. Give them these details
          yourself.
        </div>
        <CopyLine label="Temporary password (shown once)" value={outcome.password} />
        {outcome.link && <CopyLine label="Verification link (shown once)" value={outcome.link} mono="text-[11px]" />}
        <p className="text-[11px] text-[#7A8E7A]">
          They sign in with this password and are asked to choose their own. Their earlier password no longer works. It is
          not shown again after you close this.
        </p>
      </div>
    </ModalShell>
  )
}
