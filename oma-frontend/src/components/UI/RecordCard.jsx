import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

// Phone card for one record in a profile list (a crop, a stocking record): only the name shows. Tapping it drops
// down the details and, when there is one, a single action button underneath.
//   details: [[label, value], ...]   (a value may be text or JSX)
//   action:  JSX for the button, or null for none
export default function RecordCard({ title, details, action = null }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 break-words text-[15px] font-semibold leading-snug text-text-primary">{title}</span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <dl className="space-y-2">
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0 break-words">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</dt>
                <dd className="mt-0.5 text-[13px] text-text-primary">{value === null || value === undefined || value === '' ? '—' : value}</dd>
              </div>
            ))}
          </dl>
          {action && <div className="mt-3 border-t border-border pt-3">{action}</div>}
        </div>
      )}
    </div>
  )
}
