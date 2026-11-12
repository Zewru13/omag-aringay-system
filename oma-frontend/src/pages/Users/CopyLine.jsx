import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'

// A value shown once with a button to copy it (a temporary password, a verification link).
export default function CopyLine({ label, value, mono = 'text-[13px]' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* the text can still be selected and copied by hand */ }
  }
  return (
    <div className="flex items-center gap-2">
      <code className={`flex-1 break-all rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2 font-mono text-[#1A2B1A] ${mono}`}>{value}</code>
      <Button type="button" variant="outline" size="sm" onClick={copy} title={`Copy ${label.toLowerCase()}`} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
      </Button>
    </div>
  )
}
