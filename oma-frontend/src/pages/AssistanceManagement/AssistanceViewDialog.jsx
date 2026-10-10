import { Eye } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'

// Read-only details of one assistance record. `details` is [{ label, value }]; empty values show a dash.
export default function AssistanceViewDialog({ title, subtitle, details, onClose }) {
  return (
    <ModalShell
      title={title} subtitle={subtitle} icon={Eye} onClose={onClose} maxWidth="max-w-lg"
      footer={<Button type="button" variant="outline" onClick={onClose}>Close</Button>}
    >
      <dl className="space-y-3">
        {details.map((d) => (
          <div key={d.label} className="flex items-start justify-between gap-4">
            <dt className="text-[12px] text-[#7A8E7A]">{d.label}</dt>
            <dd className="min-w-0 break-words text-right text-[13px] font-medium text-[#1A2B1A]">
              {d.value === undefined || d.value === null || d.value === '' ? '\u2014' : d.value}
            </dd>
          </div>
        ))}
      </dl>
    </ModalShell>
  )
}
