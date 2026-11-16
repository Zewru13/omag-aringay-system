import { HeartPulse, Utensils } from 'lucide-react'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { LOG_ACTIVITY_OPTIONS } from '../Monitoring/cycleLogForms.js'

// Log activity of a fisherfolk's cycle asks first which log: the same two the office's Log Activity button offers (Feeding Log,
// Health Log), as two big buttons. `onChoose(key)` gets 'feeding' or 'health'; the page then opens the Log Activity window.
const ICONS = { feeding: Utensils, health: HeartPulse }
const HINTS = { feeding: 'Feed given, and how much', health: 'Sick or dead fish, water problems, treatment' }

export default function ChooseLogWindow({ subtitle, onChoose, onClose }) {
  return (
    <ModalShell title="Log activity" subtitle={subtitle} onClose={onClose} maxWidth="max-w-sm">
      <div className="space-y-2">
        <p className="text-[14px] text-text-secondary">Which log is this?</p>
        {LOG_ACTIVITY_OPTIONS.map((option) => {
          const Icon = ICONS[option.key]
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onChoose(option.key)}
              className="press-scale flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong bg-surface px-4 py-2 text-left transition-colors hover:bg-surface-2"
            >
              {Icon && <Icon size={20} className="shrink-0 text-primary" aria-hidden="true" />}
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-text-primary">{option.label}</span>
                <span className="block text-[13px] text-text-secondary">{HINTS[option.key]}</span>
              </span>
            </button>
          )
        })}
      </div>
    </ModalShell>
  )
}
