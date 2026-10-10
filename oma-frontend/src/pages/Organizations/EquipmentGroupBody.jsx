import { useState } from 'react'
import { ChevronDown, ChevronRight, Hammer, HandHelping, History, Trash2, Wrench } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { REPAIRABLE, conditionTone, unitsSummary } from '../../utils/equipmentLoans.js'

// The inside of an equipment entry: one dropdown row per condition (or batch) of that equipment, each opening onto its
// own details and actions. `onAction(kind, line)` starts change condition / repair / lend / history; `onRemove(line)`.

const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[12px] text-[#7A8E7A]">{label}</dt>
      <dd className="min-w-0 break-words text-right text-[13px] font-medium text-[#1A2B1A]">{children}</dd>
    </div>
  )
}

export default function EquipmentGroupBody({ group, onAction, onRemove }) {
  const [openId, setOpenId] = useState(group.lines.length === 1 ? group.lines[0].id : null)

  return (
    <ul className="divide-y divide-[#EEF2EE] overflow-hidden rounded-xl border border-[#E2E8E2]" aria-label="Conditions of this equipment">
      {group.lines.map((line) => {
        const { total, onLoan, available } = unitsSummary(line)
        const movable = total - onLoan
        const isOpen = openId === line.id
        return (
          <li key={line.id}>
            <button
              type="button" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : line.id)}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-[#F5F7F5]"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <StatusPill tone={conditionTone(line.condition)}>{line.condition}</StatusPill>
                <span className="text-[13px] font-semibold text-[#1A2B1A]">{total} unit{total === 1 ? '' : 's'}</span>
                {onLoan > 0 && <span className="text-[12px] text-[#7A8E7A]">{onLoan} on loan</span>}
                {line.acquisition_date && <span className="text-[12px] text-[#7A8E7A]">acquired {formatDate(line.acquisition_date)}</span>}
              </span>
              {isOpen ? <ChevronDown size={16} className="shrink-0 text-[#A8BCA8]" aria-hidden="true" /> : <ChevronRight size={16} className="shrink-0 text-[#A8BCA8]" aria-hidden="true" />}
            </button>
            {isOpen && (
              <div className="space-y-3 bg-[#F9FAF9] px-3 py-3">
                <dl className="space-y-2.5">
                  <Row label="On loan">{onLoan}</Row>
                  <Row label="Available to lend">{available}</Row>
                  {(line.holders || []).length > 0 && (
                    <Row label="Who has it">{line.holders.map((h) => `${h.member_name} (${h.quantity})`).join(', ')}</Row>
                  )}
                  <Row label="Date acquired">{formatDate(line.acquisition_date)}</Row>
                  <Row label="Remarks">{line.remarks || '—'}</Row>
                </dl>
                <div className="grid grid-cols-2 gap-2">
                  {movable > 0 && (
                    <Button type="button" size="sm" variant="outline" icon={Wrench} className="whitespace-nowrap !text-[#1B4D2E]" onClick={() => onAction('condition', line)}>Change condition</Button>
                  )}
                  {movable > 0 && REPAIRABLE.includes(line.condition) && (
                    <Button type="button" size="sm" variant="outline" icon={Hammer} className="whitespace-nowrap !text-[#1B4D2E]" onClick={() => onAction('repair', line)}>Repair</Button>
                  )}
                  {available > 0 && (
                    <Button type="button" size="sm" variant="outline" icon={HandHelping} className="whitespace-nowrap !text-[#1B4D2E]" onClick={() => onAction('lend', line)}>Lend</Button>
                  )}
                  <Button type="button" size="sm" variant="outline" icon={History} className="whitespace-nowrap !text-[#1B4D2E]" onClick={() => onAction('history', line)}>History</Button>
                  {onLoan === 0 && (
                    <Button type="button" size="sm" variant="outline" icon={Trash2} className="whitespace-nowrap !border-rose-200 !text-rose-600 hover:!bg-rose-50" onClick={() => onRemove(line)}>Remove</Button>
                  )}
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
