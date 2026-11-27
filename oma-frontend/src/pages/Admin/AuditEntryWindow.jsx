import { History } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { formatDateTime } from '../../utils/dateFormat.js'
import { actionLabel, actionTone, changeHeading, moreText, noDetailsText, shownValue } from './auditLog.js'

// One Audit Log entry in full: when, who, what was done, and the old and new values of the records it changed.
const CELL = 'break-words border border-border px-3 py-2 text-left align-top text-[13px]'
const HEAD = `${CELL} bg-surface-2 font-semibold`

function Changes({ change }) {
  const added = change.change === 'created'
  const removed = change.change === 'deleted'
  return (
    <section>
      <h3 className="mb-1.5 break-words text-[13px] font-semibold text-text-primary">{changeHeading(change)}</h3>
      {change.fields.length > 0 && (
        <table className="w-full table-fixed border-collapse text-text-primary">
          <thead>
            <tr>
              <th className={HEAD}>Field</th>
              {!added && <th className={HEAD}>Before</th>}
              {!removed && <th className={HEAD}>After</th>}
            </tr>
          </thead>
          <tbody>
            {change.fields.map((f) => (
              <tr key={f.field}>
                <td className={CELL}>{f.field}</td>
                {!added && <td className={CELL}>{shownValue(f.old)}</td>}
                {!removed && <td className={CELL}>{shownValue(f.new)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function AuditEntryWindow({ entry, onClose }) {
  const changes = entry.details?.changes || []
  const more = moreText(entry.details?.more)
  const who = entry.user?.is_system ? 'System / Automation' : entry.user?.full_name || entry.user?.email || 'System'
  return (
    <ModalShell
      title="Audit Log Entry" icon={History} onClose={onClose} maxWidth="max-w-2xl"
      footer={<Button type="button" variant="outline" onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-[13px]">
          <dt className="font-semibold text-text-muted">When</dt>
          <dd className="text-text-primary">{formatDateTime(entry.timestamp)}</dd>
          <dt className="font-semibold text-text-muted">Who</dt>
          <dd className="break-words text-text-primary">
            {who}
            {!entry.user?.is_system && entry.user?.email && <span className="block text-[12px] text-text-muted">{entry.user.email}</span>}
          </dd>
          <dt className="font-semibold text-text-muted">Action</dt>
          <dd><StatusPill tone={actionTone(entry.action)}>{actionLabel(entry.action)}</StatusPill></dd>
          <dt className="font-semibold text-text-muted">Description</dt>
          <dd className="break-words text-text-primary">{entry.object_repr}</dd>
        </dl>
        {changes.map((change, i) => <Changes key={`${change.model}-${change.name}-${i}`} change={change} />)}
        {more && <p className="text-[12.5px] text-text-muted">{more}</p>}
        {changes.length === 0 && !more && <p className="text-[12.5px] text-text-muted">{noDetailsText(entry)}</p>}
      </div>
    </ModalShell>
  )
}

export default AuditEntryWindow
