import { useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { todayISO as localToday } from '../../utils/localDate.js'
import { availableAgainText } from '../../utils/borrowerGroups.js'
import { CONDITIONS, DAMAGED_CONDITIONS, apiMessage, loanStatusLabel, outcomeBreakdown, outcomeSummary, unitsSummary, validateOutcome } from '../../utils/equipmentLoans.js'

// The forms behind an organization's equipment actions: change condition, repair, lend, confirm a return, and the history.
// Each takes the equipment `line` (or `loan`) and the organization `type` ('farmers' | 'fisherfolk'), posts to the equipment
// endpoints, shows the server's message when it refuses, and calls onDone() after it worked.

const LABEL = 'mb-1 block text-[12px] font-medium text-[#4A5A4C]'

const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(String(value).length > 10 ? value : `${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

export function ActionForm({ title, subtitle, onClose, onSubmit, submitLabel, children, disabled = false }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try { await onSubmit() } catch (err) { setError(apiMessage(err, 'That could not be saved.')) } finally { setBusy(false) }
  }
  return (
    <ModalShell
      title={title} subtitle={subtitle} icon={Wrench} onClose={onClose}
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="equipment-action-form" isLoading={busy} disabled={disabled}>{submitLabel}</Button>
        </>
      )}
    >
      <form id="equipment-action-form" onSubmit={submit} className="space-y-4">
        {children}
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{error}</p>}
      </form>
    </ModalShell>
  )
}

const unitsField = (value, onChange, max, label = 'Units') => (
  <div>
    <label className={LABEL} htmlFor="eq-units">{label}</label>
    <input id="eq-units" type="number" min={1} max={max} step={1} className={baseInputClasses} value={value}
      onChange={(e) => onChange(e.target.value)} required />
    <p className="mt-1 text-[12px] text-[#7A8E7A]">Up to {max}.</p>
  </div>
)

export function ChangeConditionDialog({ line, type, onClose, onDone }) {
  const { showToast } = useToast()
  const movable = Math.max(0, unitsSummary(line).total - unitsSummary(line).onLoan)
  const [units, setUnits] = useState('1')
  const [condition, setCondition] = useState(CONDITIONS.find((c) => c !== line.condition))
  return (
    <ActionForm
      title="Change condition" subtitle={`${line.equipment_name} — now ${line.condition}`} onClose={onClose}
      submitLabel="Change condition" disabled={movable < 1}
      onSubmit={async () => {
        await api.post(`/organizations/${type}/equipment/${line.id}/condition/`, { quantity: Number(units), condition })
        showToast('Condition updated.', 'success')
        onDone()
      }}
    >
      {movable < 1 ? (
        <p className="text-[13px] text-[#7A8E7A]">Every unit is out on loan, so none can change condition yet.</p>
      ) : (
        <>
          {unitsField(units, setUnits, movable, 'How many units')}
          <div>
            <label className={LABEL} htmlFor="eq-condition">New condition</label>
            <select id="eq-condition" className={baseInputClasses} value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.filter((c) => c !== line.condition).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </>
      )}
    </ActionForm>
  )
}

export function RepairDialog({ line, type, onClose, onDone }) {
  const { showToast } = useToast()
  const movable = Math.max(0, unitsSummary(line).total - unitsSummary(line).onLoan)
  const [units, setUnits] = useState('1')
  const [when, setWhen] = useState(localToday())
  const [what, setWhat] = useState('')
  const [cost, setCost] = useState('')
  return (
    <ActionForm
      title="Repair" subtitle={`${line.equipment_name} — ${line.condition}`} onClose={onClose} submitLabel="Save repair"
      disabled={movable < 1}
      onSubmit={async () => {
        await api.post(`/organizations/${type}/equipment/${line.id}/repair/`, {
          quantity: Number(units), repaired_on: when, description: what, cost: cost === '' ? null : cost,
        })
        showToast('Repair saved. The units are Good again.', 'success')
        onDone()
      }}
    >
      {movable < 1 ? (
        <p className="text-[13px] text-[#7A8E7A]">Every unit is out on loan, so none can be repaired yet.</p>
      ) : (
        <>
          {unitsField(units, setUnits, movable, 'Units repaired')}
          <div>
            <label className={LABEL} htmlFor="eq-when">Date repaired</label>
            <input id="eq-when" type="date" className={baseInputClasses} value={when} max={localToday()} onChange={(e) => setWhen(e.target.value)} required />
          </div>
          <div>
            <label className={LABEL} htmlFor="eq-what">What was done</label>
            <input id="eq-what" className={baseInputClasses} value={what} maxLength={255} onChange={(e) => setWhat(e.target.value)} required />
          </div>
          <div>
            <label className={LABEL} htmlFor="eq-cost">Cost (optional)</label>
            <input id="eq-cost" type="number" min={0} step="0.01" className={baseInputClasses} value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
        </>
      )}
    </ActionForm>
  )
}

// `members`: [{ id: person id, name }] — the organization's active members.
export function LendDialog({ line, type, members, onClose, onDone }) {
  const { showToast } = useToast()
  const { available } = unitsSummary(line)
  const [member, setMember] = useState(members[0]?.id ?? '')
  const [units, setUnits] = useState('1')
  const [due, setDue] = useState('')
  return (
    <ActionForm
      title="Lend equipment" subtitle={`${line.equipment_name} — ${available} available`} onClose={onClose} submitLabel="Lend"
      disabled={available < 1 || members.length === 0}
      onSubmit={async () => {
        await api.post(`/organizations/${type}/equipment/${line.id}/lend/`, {
          member: Number(member), quantity: Number(units), due_date: due || null,
        })
        showToast('Equipment lent.', 'success')
        onDone()
      }}
    >
      {members.length === 0 ? (
        <p className="text-[13px] text-[#7A8E7A]">The organization has no active members to lend to.</p>
      ) : (
        <>
          <div>
            <label className={LABEL} htmlFor="eq-member">Member</label>
            <select id="eq-member" className={baseInputClasses} value={member} onChange={(e) => setMember(e.target.value)} required>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {unitsField(units, setUnits, available)}
          <div>
            <label className={LABEL} htmlFor="eq-due">Return by (optional)</label>
            <input id="eq-due" type="date" className={baseInputClasses} value={due} min={localToday()} onChange={(e) => setDue(e.target.value)} />
          </div>
        </>
      )}
    </ActionForm>
  )
}

// Close a borrowed item: each unit came back (Good), came back damaged (the condition is chosen) or was not returned (Lost). Everything is
// "returned" to start with. One unit is picked with three buttons; several units are counted per outcome.
const OUTCOMES = [
  { key: 'returned', label: 'Returned', hint: 'Back in good condition' },
  { key: 'damaged', label: 'Damaged', hint: 'Back, but damaged' },
  { key: 'notReturned', label: 'Not returned', hint: 'Never came back' },
]

export function ReturnDialog({ loan, type, onClose, onDone }) {
  const { showToast } = useToast()
  const [counts, setCounts] = useState({ returned: String(loan.quantity), damaged: '', notReturned: '' })
  const [damagedCondition, setDamagedCondition] = useState('Broken')
  const check = validateOutcome(counts, loan.quantity)
  const single = loan.quantity === 1
  const pickOne = (key) => setCounts({ returned: key === 'returned' ? '1' : '', damaged: key === 'damaged' ? '1' : '', notReturned: key === 'notReturned' ? '1' : '' })
  const setCount = (key) => (e) => setCounts((all) => ({ ...all, [key]: e.target.value }))
  const hasDamaged = Number(counts.damaged) > 0
  return (
    <ActionForm
      title="Mark returned, damaged or not returned" subtitle={`${loan.member_name} — ${loan.equipment_name}, ${loan.quantity} unit(s)`}
      onClose={onClose} submitLabel="Save" disabled={!check.ok}
      onSubmit={async () => {
        const sent = outcomeBreakdown({ ...counts, damagedCondition })
        await api.post(`/organizations/${type}/equipment-loans/${loan.id}/return/`, { breakdown: sent })
        const summary = Object.fromEntries(sent.map((part) => [part.condition, part.quantity]))
        showToast(['Recorded: ' + outcomeSummary(summary) + '.', availableAgainText(loan.equipment_name, sent)].filter(Boolean).join(' '), 'success')
        onDone()
      }}
    >
      <p className="text-[13px] text-[#4A5A4C]">
        {single ? 'What happened to the unit?' : `What happened to the ${loan.quantity} units? Count each outcome.`}
      </p>
      {single ? (
        <div role="radiogroup" aria-label="What happened to the unit" className="grid gap-2 sm:grid-cols-3">
          {OUTCOMES.map((o) => {
            const on = Number(counts[o.key]) === 1
            return (
              <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => pickOne(o.key)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${on ? 'border-[#1B4D2E] bg-[#EBF5EE]' : 'border-[#E2E8E2] bg-white hover:bg-[#F5F7F5]'}`}>
                <span className="block text-[13px] font-semibold text-[#1A2B1A]">{o.label}</span>
                <span className="block text-[11.5px] text-[#7A8E7A]">{o.hint}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {OUTCOMES.map((o) => (
            <div key={o.key} className="flex items-center justify-between gap-3">
              <label className="min-w-0 text-[13px] text-[#1A2B1A]" htmlFor={`eq-out-${o.key}`}>
                {o.label} <span className="text-[11.5px] text-[#7A8E7A]">· {o.hint.toLowerCase()}</span>
              </label>
              <input id={`eq-out-${o.key}`} type="number" min={0} step={1} className={`${baseInputClasses} !w-24 text-right`}
                value={counts[o.key]} onChange={setCount(o.key)} />
            </div>
          ))}
        </div>
      )}
      {hasDamaged && (
        <div>
          <label className={LABEL} htmlFor="eq-damage">How damaged</label>
          <select id="eq-damage" className={baseInputClasses} value={damagedCondition} onChange={(e) => setDamagedCondition(e.target.value)}>
            {DAMAGED_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="mt-1 text-[12px] text-[#7A8E7A]">Damaged units leave the lendable stock; Repair puts them back to Good.</p>
        </div>
      )}
      {!single && !check.ok && <p className="text-[12px] font-medium text-rose-700" data-testid="breakdown-message">{check.message}</p>}
    </ActionForm>
  )
}

export function EquipmentHistoryDialog({ line, type, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    api.get(`/organizations/${type}/equipment/${line.id}/history/`)
      .then((r) => { if (!cancelled) setData(r.data) })
      .catch((err) => { if (!cancelled) setError(apiMessage(err, 'The history could not be loaded.')) })
    return () => { cancelled = true }
  }, [type, line.id])
  return (
    <ModalShell title="History" subtitle={`${line.equipment_name} — ${line.condition}`} icon={Wrench} onClose={onClose} maxWidth="max-w-lg"
      footer={<Button type="button" variant="outline" onClick={onClose}>Close</Button>}>
      {error && <p className="text-[13px] text-rose-700">{error}</p>}
      {!data && !error && <p className="text-[13px] text-[#7A8E7A]">Loading...</p>}
      {data && (
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#7A8E7A]">Repairs</h3>
            {data.repairs.length === 0 ? <p className="text-[13px] text-[#7A8E7A]">No repairs recorded.</p> : (
              <ul className="divide-y divide-[#EEF2EE] rounded-lg border border-[#E2E8E2]">
                {data.repairs.map((r) => (
                  <li key={r.id} className="px-3 py-2 text-[13px]">
                    <p className="font-medium text-[#1A2B1A]">{r.description}</p>
                    <p className="text-[12px] text-[#7A8E7A]">
                      {formatDate(r.repaired_on)} · {r.quantity} unit(s) from {r.from_condition}{r.cost !== null ? ` · ₱${r.cost}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#7A8E7A]">Loans</h3>
            {data.loans.length === 0 ? <p className="text-[13px] text-[#7A8E7A]">Never borrowed.</p> : (
              <ul className="divide-y divide-[#EEF2EE] rounded-lg border border-[#E2E8E2]">
                {data.loans.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[13px]">
                    <span>
                      <span className="block font-medium text-[#1A2B1A]">{l.member_name}</span>
                      <span className="block text-[12px] text-[#7A8E7A]">
                        {l.quantity} unit(s) · {formatDate(l.borrowed_at || l.requested_at)}
                        {Object.keys(l.return_breakdown || {}).length > 0 ? ` · ${outcomeSummary(l.return_breakdown)}` : ''}
                      </span>
                    </span>
                    <StatusPill tone={l.overdue ? 'rose' : 'slate'}>{l.overdue ? 'Overdue' : loanStatusLabel(l.status)}</StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </ModalShell>
  )
}

// Refuse a member's request, with an optional reason the member sees.
export function RejectDialog({ loan, type, onClose, onDone }) {
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  return (
    <ActionForm
      title="Reject request" subtitle={`${loan.member_name} — ${loan.equipment_name}, ${loan.quantity} unit(s)`}
      onClose={onClose} submitLabel="Reject request"
      onSubmit={async () => {
        await api.post(`/organizations/${type}/equipment-loans/${loan.id}/reject/`, { reason: reason.trim() })
        showToast('Request rejected.', 'success')
        onDone()
      }}
    >
      <div>
        <label className={LABEL} htmlFor="eq-reason">Reason (optional)</label>
        <input id="eq-reason" className={baseInputClasses} value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} />
      </div>
    </ActionForm>
  )
}
