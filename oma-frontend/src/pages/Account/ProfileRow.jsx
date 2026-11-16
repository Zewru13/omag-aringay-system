import { Lock } from 'lucide-react'
import { waitingText } from '../../utils/approvalStatus.js'
import { approvalText } from './profileFields.js'
import StatusBadge from './StatusBadge.jsx'

// One detail of the profile (see profileFields.js): the label, the value and, in words, what can be done with it — Edit (saved at
// once), Request change (the office approves it first) or Fixed. A change already waiting shows what was asked for and who still has
// to approve it, and no second request can be sent.
const BUTTON = 'press-scale inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-sm)] border border-border-strong bg-surface px-4 text-center transition-colors hover:bg-surface-2 md:min-h-9'

export default function ProfileRow({ row, onEdit, onRequest }) {
  const waiting = row.pending
  return (
    <li className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] text-text-secondary">{row.label}</p>
        <p className="mt-0.5 break-words text-[15px] font-medium text-text-primary">{row.value || '—'}</p>
        {waiting && (
          <div className="mt-1.5 space-y-0.5 text-[13px] text-text-secondary">
            <p className="break-words">Asked to change to: <span className="text-text-primary">{waiting.requested_value || '—'}</span></p>
            <p>{waitingText(waiting)}</p>
            {approvalText(waiting).map((line) => <p key={line}>{line}</p>)}
          </div>
        )}
      </div>
      <div className="shrink-0">
        {row.mode === 'edit' && (
          <button type="button" className={`${BUTTON} w-full sm:w-auto`} onClick={() => onEdit(row)}>
            <span className="text-[14px] font-semibold text-text-primary">Edit</span>
          </button>
        )}
        {row.mode === 'request' && (waiting ? (
          <StatusBadge tone="amber">Waiting for approval</StatusBadge>
        ) : (
          <button type="button" className={`${BUTTON} w-full sm:w-auto`} onClick={() => onRequest(row)}>
            <span className="text-[14px] font-semibold text-text-primary">Request change</span>
          </button>
        ))}
        {row.mode === 'fixed' && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-text-muted" title="Contact the office to have it corrected">
            <Lock size={14} aria-hidden="true" /> Fixed
          </span>
        )}
      </div>
    </li>
  )
}
