import { User, Users } from 'lucide-react'
import ModalShell from '../../components/UI/ModalShell.jsx'

// Distribute assistance asks first who receives it: one member (or a few, picked by name) or every member of the organization. Each
// opens the existing distribute window, as the two separate buttons used to. `onChoose('one' | 'all')`.
const CHOICES = [
  { key: 'one', label: 'Give to one member', hint: 'Pick the members who received it by name.', Icon: User },
  { key: 'all', label: 'Give to all members', hint: 'The same assistance for every current member.', Icon: Users },
]

export default function ChooseDistributeWindow({ onChoose, onClose }) {
  return (
    <ModalShell title="Distribute assistance" onClose={onClose} maxWidth="max-w-sm">
      <div className="space-y-2">
        <p className="text-[14px] text-text-secondary">Who receives it?</p>
        {CHOICES.map(({ key, label, hint, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChoose(key)}
            className="press-scale flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong bg-surface px-4 py-2 text-left transition-colors hover:bg-surface-2"
          >
            <Icon size={20} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-text-primary">{label}</span>
              <span className="block text-[13px] text-text-secondary">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </ModalShell>
  )
}
