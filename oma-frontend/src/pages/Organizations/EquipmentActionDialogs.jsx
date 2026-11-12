import { useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { todayISO as localToday } from '../../utils/localDate.js'
import { availableAgainText } from '../../utils/borrowerGroups.js'
import { CONDITIONS, DAMAGED_CONDITIONS, apiMessage, loanStatusLabel, outcomeBreakdown, outcomeSummary, unitsSummary, validateOutcome } from '../../utils/equipmentLoans.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

// The forms behind an organization's equipment actions: change condition, repair, lend, confirm a return, and the history.
// Each takes the equipment `line` (or `loan`) and the organization `type` ('farmers' | 'fisherfolk'), posts to the equipment
// endpoints, shows the server's message when it refuses, and calls onDone() after it worked.

const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(String(value).length > 10 ? value : `${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

export function ActionForm({ title, subtitle, onClose, onSubmit, submitLabel, children, disabled = false, draft = null }) {
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
      title={title} subtitle={subtitle} icon={Wrench} onClose={onClose} maxWidth="max-w-2xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="equipment-action-form" isLoading={busy} disabled={disabled}>{submitLabel}</Button>
        </>
      )}
    >
      <form id="equipment-action-form" onSubmit={submit} className="space-y-3">
        {draft && <DraftBanner draft={draft} />}
        {children}
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{error}</p>}
      </form>
    </ModalShell>
  )
}

// A "how many units" cell of a table form, held to what can be moved.
const unitsCell = (value, onChange, max, label = 'Units') => (
  <FormCell label={label} required hint={<p className="mt-1 text-[12px] text-[#7A8E7A]">Up to {max}.</p>}>
    <input id="eq-units" type="number" min={1} max={max} step={1} className={baseInputClasses} aria-label={label} value={value}
      onChange={(e) => onChange(e.target.value)} required />
  </FormCell>
)

const note = (text) => <p className="rounded-lg bg-[#F5F7F5] px-3 py-2.5 text-[13px] text-[#7A8E7A]">{text}</p>

export function ChangeConditionDialog({ line, type, onClose, onDone }) {
  const { showToast } = useToast()
  const movable = Math.max(0, unitsSummary(line).total - unitsSummary(line).onLoan)
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`equipment-condition:${line.id}`)
  const [units, setUnits] = useDraftField(draft, 'units', '1')
  const [condition, setCondition] = useDraftField(draft, 'condition', CONDITIONS.find((c) => c !== line.condition))
  return (
    <ActionForm
      draft={draft}
      title="Change condition" subtitle={`${line.equipment_name} — now ${line.condition}`} onClose={onClose}
      submitLabel="Change condition" disabled={movable < 1}
      onSubmit={async () => {
        await api.post(`/organizations/${type}/equipment/${line.id}/condition/`, { quantity: Number(units), condition })
        showToast('Condition updated.', 'success')
        draft.clear()
        onDone()
      }}
    >
      {movable < 1 ? note('Every unit is out on loan, so none can change condition yet.') : (
        <FormSection title="Condition">
          <FormRows label="Condition">
            <FormRow>
              {unitsCell(units, setUnits, movable, 'How Many Units')}
              <FormCell label="New Condition" required>
                <select id="eq-condition" className={baseInputClasses} aria-label="New Condition" value={condition} onChange={(e) => setCondition(e.target.value)}>
                  {CONDITIONS.filter((c) => c !== line.condition).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>
      )}
    </ActionForm>
  )
}

export function RepairDialog({ line, type, onClose, onDone }) {
  const { showToast } = useToast()
  const movable = Math.max(0, unitsSummary(line).total - unitsSummary(line).onLoan)
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`equipment-repair:${line.id}`)
  const [units, setUnits] = useDraftField(draft, 'units', '1')
  const [when, setWhen] = useDraftField(draft, 'when', localToday())
  const [what, setWhat] = useDraftField(draft, 'what', '')
  const [cost, setCost] = useDraftField(draft, 'cost', '')
  return (
    <ActionForm
      draft={draft}
      title="Repair" subtitle={`${line.equipment_name} — ${line.condition}`} onClose={onClose} submitLabel="Save repair"
      disabled={movable < 1}
      onSubmit={async () => {
        await api.post(`/organizations/${type}/equipment/${line.id}/repair/`, {
          quantity: Number(units), repaired_on: when, description: what, cost: cost === '' ? null : cost,
        })
        showToast('Repair saved. The units are Good again.', 'success')
        draft.clear()
        onDone()
      }}
    >
      {movable < 1 ? note('Every unit is out on loan, so none can be repaired yet.') : (
        <FormSection title="Repair">
          <FormRows label="Repair">
            <FormRow>
              {unitsCell(units, setUnits, movable, 'Units Repaired')}
              <FormCell label="Date Repaired" required>
                <input id="eq-when" type="date" className={baseInputClasses} aria-label="Date Repaired" value={when} max={localToday()} onChange={(e) => setWhen(e.target.value)} required />
              </FormCell>
            </FormRow>
            <FormRow>
              <FormCell label="What Was Done" required wide>
                <input id="eq-what" className={baseInputClasses} aria-label="What Was Done" value={what} maxLength={255} onChange={(e) => setWhat(e.target.value)} required />
              </FormCell>
            </FormRow>
            <FormRow>
              <FormCell label="Cost">
                <input id="eq-cost" type="number" min={0} step="0.01" className={baseInputClasses} aria-label="Cost" placeholder="Optional" value={cost} onChange={(e) => setCost(e.target.value)} />
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>
      )}
    </ActionForm>
  )
}

// `members`: [{ id: person id, name }] — the organization's active members.
export function LendDialog({ line, type, members, onClose, onDone }) {
  const { showToast } = useToast()
  const { available } = unitsSummary(line)
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`equipment-lend:${line.id}`)
  const [member, setMember] = useDraftField(draft, 'member', members[0]?.id ?? '')
  const [units, setUnits] = useDraftField(draft, 'units', '1')
  const [due, setDue] = useDraftField(draft, 'due', '')
  return (
    <ActionForm
      draft={draft}
      title="Lend equipment" subtitle={`${line.equipment_name} — ${available} available`} onClose={onClose} submitLabel="Lend"
      disabled={available < 1 || members.length === 0}
      onSubmit={async () => {
        await api.post(`/organizations/${type}/equipment/${line.id}/lend/`, {
          member: Number(member), quantity: Number(units), due_date: due || null,
        })
        showToast('Equipment lent.', 'success')
        draft.clear()
        onDone()
      }}
    >
      {members.length === 0 ? note('The organization has no active members to lend to.') : (
        <FormSection title="Loan">
          <FormRows label="Loan">
            <FormRow>
              <FormCell label="Member" required>
                <select id="eq-member" className={baseInputClasses} aria-label="Member" value={member} onChange={(e) => setMember(e.target.value)} required>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </FormCell>
              {unitsCell(units, setUnits, available)}
            </FormRow>
            <FormRow>
              <FormCell label="Return By">
                <input id="eq-due" type="date" className={baseInputClasses} aria-label="Return By" value={due} min={localToday()} onChange={(e) => setDue(e.target.value)} />
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>
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
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`equipment-return:${loan.id}`)
  const [counts, setCounts] = useDraftField(draft, 'counts', { returned: String(loan.quantity), damaged: '', notReturned: '' })
  const [damagedCondition, setDamagedCondition] = useDraftField(draft, 'damagedCondition', 'Broken')
  const check = validateOutcome(counts, loan.quantity)
  const single = loan.quantity === 1
  const pickOne = (key) => setCounts({ returned: key === 'returned' ? '1' : '', damaged: key === 'damaged' ? '1' : '', notReturned: key === 'notReturned' ? '1' : '' })
  const setCount = (key) => (e) => setCounts((all) => ({ ...all, [key]: e.target.value }))
  const hasDamaged = Number(counts.damaged) > 0
  return (
    <ActionForm
      draft={draft}
      title="Mark returned, damaged or not returned" subtitle={`${loan.member_name} — ${loan.equipment_name}, ${loan.quantity} unit(s)`}
      onClose={onClose} submitLabel="Save" disabled={!check.ok}
      onSubmit={async () => {
        const sent = outcomeBreakdown({ ...counts, damagedCondition })
        await api.post(`/organizations/${type}/equipment-loans/${loan.id}/return/`, { breakdown: sent })
        const summary = Object.fromEntries(sent.map((part) => [part.condition, part.quantity]))
        showToast(['Recorded: ' + outcomeSummary(summary) + '.', availableAgainText(loan.equipment_name, sent)].filter(Boolean).join(' '), 'success')
        draft.clear()
        onDone()
      }}
    >
      <FormSection title="What Happened">
        <FormRows label="What happened">
          {single ? (
            <FormRow>
              <FormCell label="The Unit" required wide>
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
              </FormCell>
            </FormRow>
          ) : (
            <>
              <FormRow>
                {OUTCOMES.slice(0, 2).map((o) => (
                  <FormCell key={o.key} label={o.label} hint={<p className="mt-1 text-[11.5px] text-[#7A8E7A]">{o.hint}</p>}>
                    <input id={`eq-out-${o.key}`} type="number" min={0} step={1} className={baseInputClasses} aria-label={o.label} value={counts[o.key]} onChange={setCount(o.key)} />
                  </FormCell>
                ))}
              </FormRow>
              <FormRow>
                {OUTCOMES.slice(2).map((o) => (
                  <FormCell key={o.key} label={o.label} hint={<p className="mt-1 text-[11.5px] text-[#7A8E7A]">{o.hint}</p>}>
                    <input id={`eq-out-${o.key}`} type="number" min={0} step={1} className={baseInputClasses} aria-label={o.label} value={counts[o.key]} onChange={setCount(o.key)} />
                  </FormCell>
                ))}
              </FormRow>
            </>
          )}
          {hasDamaged && (
            <FormRow>
              <FormCell label="How Damaged" required wide hint={<p className="mt-1 text-[12px] text-[#7A8E7A]">Damaged units leave the lendable stock; Repair puts them back to Good.</p>}>
                <select id="eq-damage" className={baseInputClasses} aria-label="How Damaged" value={damagedCondition} onChange={(e) => setDamagedCondition(e.target.value)}>
                  {DAMAGED_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </FormCell>
            </FormRow>
          )}
        </FormRows>
      </FormSection>
      <p className="text-[12px] text-[#7A8E7A]">
        {single ? 'Pick what happened to the unit.' : `Count each outcome so they add up to the ${loan.quantity} units.`}
      </p>
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
    <ModalShell title="History" subtitle={`${line.equipment_name} — ${line.condition}`} icon={Wrench} onClose={onClose} maxWidth="max-w-3xl"
      footer={<Button type="button" variant="outline" onClick={onClose}>Close</Button>}>
      {error && <p className="text-[13px] text-rose-700">{error}</p>}
      {!data && !error && <p className="text-[13px] text-[#7A8E7A]">Loading...</p>}
      {data && (
        <div className="space-y-3">
          <FormSection title="Repairs">
            {data.repairs.length === 0 ? <p className="px-3 py-3 text-[13px] text-[#7A8E7A]">No repairs recorded.</p> : (
              <EntryTable bare label="Repairs" testId="equipment-repairs-table">
                <EntryHead>
                  <EntryTh>Date</EntryTh><EntryTh>Units</EntryTh><EntryTh>From</EntryTh><EntryTh>What Was Done</EntryTh><EntryTh>Cost</EntryTh>
                </EntryHead>
                <tbody>
                  {data.repairs.map((r) => (
                    <EntryRow key={r.id}>
                      <EntryCell label="Date">{formatDate(r.repaired_on)}</EntryCell>
                      <EntryCell label="Units">{r.quantity}</EntryCell>
                      <EntryCell label="From">{r.from_condition}</EntryCell>
                      <EntryCell label="What Was Done">{r.description}</EntryCell>
                      <EntryCell label="Cost">{r.cost !== null ? `₱${r.cost}` : '—'}</EntryCell>
                    </EntryRow>
                  ))}
                </tbody>
              </EntryTable>
            )}
          </FormSection>
          <FormSection title="Loans">
            {data.loans.length === 0 ? <p className="px-3 py-3 text-[13px] text-[#7A8E7A]">Never borrowed.</p> : (
              <EntryTable bare label="Loans" testId="equipment-loans-table">
                <EntryHead>
                  <EntryTh>Member</EntryTh><EntryTh>Units</EntryTh><EntryTh>Date</EntryTh><EntryTh>Outcome</EntryTh><EntryTh>Status</EntryTh>
                </EntryHead>
                <tbody>
                  {data.loans.map((l) => (
                    <EntryRow key={l.id}>
                      <EntryCell label="Member">{l.member_name}</EntryCell>
                      <EntryCell label="Units">{l.quantity}</EntryCell>
                      <EntryCell label="Date">{formatDate(l.borrowed_at || l.requested_at)}</EntryCell>
                      <EntryCell label="Outcome">{Object.keys(l.return_breakdown || {}).length > 0 ? outcomeSummary(l.return_breakdown) : '—'}</EntryCell>
                      <EntryCell label="Status"><StatusPill tone={l.overdue ? 'rose' : 'slate'}>{l.overdue ? 'Overdue' : loanStatusLabel(l.status)}</StatusPill></EntryCell>
                    </EntryRow>
                  ))}
                </tbody>
              </EntryTable>
            )}
          </FormSection>
        </div>
      )}
    </ModalShell>
  )
}

// Refuse a member's request, with an optional reason the member sees.
export function RejectDialog({ loan, type, onClose, onDone }) {
  const { showToast } = useToast()
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`equipment-reject:${loan.id}`)
  const [reason, setReason] = useDraftField(draft, 'reason', '')
  return (
    <ActionForm
      draft={draft}
      title="Reject request" subtitle={`${loan.member_name} — ${loan.equipment_name}, ${loan.quantity} unit(s)`}
      onClose={onClose} submitLabel="Reject request"
      onSubmit={async () => {
        await api.post(`/organizations/${type}/equipment-loans/${loan.id}/reject/`, { reason: reason.trim() })
        showToast('Request rejected.', 'success')
        draft.clear()
        onDone()
      }}
    >
      <FormSection title="Request">
        <FormRows label="Request">
          <FormRow>
            <FormCell label="Reason" wide hint={<p className="mt-1 text-[12px] text-[#7A8E7A]">Optional. The member sees it.</p>}>
              <input id="eq-reason" className={baseInputClasses} aria-label="Reason" value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} />
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>
    </ActionForm>
  )
}
