import { useCallback, useEffect, useState } from 'react'
import { PackageCheck, HandHelping, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { allocateUnits, apiMessage, groupEquipment, loanStatusLabel } from '../../utils/equipmentLoans.js'
import { filterOptions } from '../../utils/orgListFilter.js'
import { todayISO } from '../../utils/localDate.js'
import { ActionForm } from '../Organizations/EquipmentActionDialogs.jsx'
import OrgCompactList from '../Organizations/OrgCompactList.jsx'

// A farmer or fisherfolk account: the Good equipment of the organizations the person belongs to (ask to borrow it)
// and the person's own loans (cancel a request, say "I returned it"). The organization decides and confirms.

const TONE = { REQUESTED: 'amber', BORROWED: 'teal', RETURN_PENDING: 'amber', RETURNED: 'green', REJECTED: 'slate', CANCELLED: 'slate' }
const LABEL = 'mb-1 block text-[12px] font-medium text-[#4A5A4C]'

const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(String(value).length > 10 ? value : `${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

function RequestDialog({ item, onClose, onDone }) {
  const { showToast } = useToast()
  const [units, setUnits] = useState('1')
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  return (
    <ActionForm
      title="Request to borrow" subtitle={`${item.name} — ${item.available} available`} onClose={onClose} submitLabel="Send request"
      onSubmit={async () => {
        // The same equipment can be recorded in several batches; the request is split over them, one request per batch.
        const parts = allocateUnits(item.lines, Number(units))
        if (!parts) throw { response: { data: { detail: 'Enter a whole number of units, up to the number available.' } } }
        for (const part of parts) {
          await api.post('/organizations/my-equipment/request/', {
            equipment: part.id, quantity: part.quantity, due_date: due || null, note: note.trim(),
          })
        }
        showToast('Request sent. The organization will decide.', 'success')
        onDone()
      }}
    >
      <div>
        <label className={LABEL} htmlFor="me-units">Units</label>
        <input id="me-units" type="number" min={1} max={item.available} step={1} className={baseInputClasses} value={units}
          onChange={(e) => setUnits(e.target.value)} required />
        <p className="mt-1 text-[12px] text-[#7A8E7A]">Up to {item.available}.</p>
      </div>
      <div>
        <label className={LABEL} htmlFor="me-due">Return by (optional)</label>
        <input id="me-due" type="date" className={baseInputClasses} value={due} min={todayISO()} onChange={(e) => setDue(e.target.value)} />
      </div>
      <div>
        <label className={LABEL} htmlFor="me-note">Note (optional)</label>
        <input id="me-note" className={baseInputClasses} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </div>
    </ActionForm>
  )
}

function OrganizationEquipment({ group, onChanged }) {
  const { showToast } = useToast()
  const [requesting, setRequesting] = useState(null)

  const act = async (path, success) => {
    try {
      await api.post(path)
      showToast(success, 'success')
    } catch (err) {
      showToast(apiMessage(err, 'That could not be done.'), 'error')
    }
    onChanged()
  }

  // One entry per kind of equipment, whatever the number of batches behind it.
  const available = groupEquipment(group.equipment).map((g) => ({
    id: g.id,
    name: g.label,
    subtitle: `${g.available} available`,
    attrs: {},
    details: [
      { label: 'Available', value: g.available },
      ...(g.lines.some((l) => l.remarks) ? [{ label: 'Remarks', value: [...new Set(g.lines.map((l) => l.remarks).filter(Boolean))].join('; ') }] : []),
    ],
    actions: [{ key: 'request', label: 'Request', icon: HandHelping, onClick: () => setRequesting(g) }],
  }))

  const loans = group.loans.map((loan) => {
    const status = loan.overdue ? 'Overdue' : loanStatusLabel(loan.status)
    return {
      id: loan.id,
      name: loan.equipment_name,
      subtitle: `${loan.quantity} unit(s) · ${status}`,
      dim: ['RETURNED', 'REJECTED', 'CANCELLED'].includes(loan.status),
      attrs: { status: loanStatusLabel(loan.status) },
      details: [
        { label: 'Units', value: loan.quantity },
        { label: 'Status', value: <StatusPill tone={loan.overdue ? 'rose' : TONE[loan.status]}>{status}</StatusPill> },
        { label: 'Borrowed', value: formatDate(loan.borrowed_at) },
        { label: 'Return by', value: formatDate(loan.due_date) },
        ...(loan.reject_reason ? [{ label: 'Reason', value: loan.reject_reason }] : []),
        ...(loan.status === 'RETURN_PENDING' ? [{ label: 'Return', value: 'Waiting for the organization to confirm' }] : []),
        ...(loan.status === 'RETURNED' ? [{ label: 'Returned', value: formatDate(loan.returned_at) }] : []),
      ],
      actions: [
        ...(loan.status === 'REQUESTED'
          ? [{ key: 'cancel', label: 'Cancel request', icon: X, tone: 'danger', onClick: () => act(`/organizations/my-equipment/loans/${loan.id}/cancel/`, 'Request cancelled.') }]
          : []),
        ...(loan.status === 'BORROWED'
          ? [{ key: 'return', label: 'I returned it', icon: PackageCheck, onClick: () => act(`/organizations/my-equipment/loans/${loan.id}/return/`, 'Thank you. The organization will confirm the return.') }]
          : []),
      ],
    }
  })
  const loanFilters = [{ key: 'status', label: 'Status', allLabel: 'All statuses', options: filterOptions(loans, 'status').map((value) => ({ value, label: value })) }]

  return (
    <section className="space-y-5 rounded-xl border border-[#E2E8E2] bg-white p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-[#1A2B1A]">{group.organization.name}</h2>
      <div className="space-y-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#7A8E7A]">Available to borrow</h3>
        <OrgCompactList items={available} searchPlaceholder="Search..." emptyText="No equipment is available right now." />
      </div>
      <div className="space-y-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#7A8E7A]">My loans</h3>
        <OrgCompactList items={loans} filters={loanFilters} searchPlaceholder="Search..." emptyText="You have not borrowed anything yet." />
      </div>
      {requesting && (
        <RequestDialog
          item={{ name: requesting.label, available: requesting.available, lines: requesting.lines }}
          onClose={() => setRequesting(null)} onDone={() => { setRequesting(null); onChanged() }}
        />
      )}
    </section>
  )
}

export default function MyEquipmentPage() {
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const onChanged = useCallback(() => setReload((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    api.get('/organizations/my-equipment/')
      .then((r) => { if (!cancelled) { setGroups(r.data); setError('') } })
      .catch((err) => { if (!cancelled) setError(apiMessage(err, 'Your equipment could not be loaded.')) })
    return () => { cancelled = true }
  }, [reload])

  return (
    <PageLayout title="Borrow Equipment" subtitle="Equipment of your organization that you can borrow, and what you have borrowed.">
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">{error}</p>}
        {!groups && !error && <p className="text-[13px] text-[#7A8E7A]">Loading...</p>}
        {groups && groups.length === 0 && (
          <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">You are not a member of an organization yet.</p>
        )}
        {groups && groups.map((group) => <OrganizationEquipment key={group.organization.id} group={group} onChanged={onChanged} />)}
      </div>
    </PageLayout>
  )
}
