import { Eye } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import { DetailTable } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'

// A long free-text field takes the whole row of the table; the short ones go two to a row.
const WIDE = /remarks|description|source|reason|notes/i

// Read-only details of one assistance record. `details` is [{ label, value }]; empty values show a dash.
export default function AssistanceViewDialog({ title, subtitle, details, onClose }) {
  return (
    <ModalShell
      title={title} subtitle={subtitle} icon={Eye} onClose={onClose} maxWidth="max-w-2xl"
      footer={<Button type="button" variant="outline" onClick={onClose}>Close</Button>}
    >
      <DetailTable title="Assistance" fields={details.map((d) => ({ ...d, wide: d.wide ?? WIDE.test(d.label) }))} />
    </ModalShell>
  )
}
