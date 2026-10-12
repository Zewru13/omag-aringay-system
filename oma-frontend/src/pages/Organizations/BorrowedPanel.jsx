import { useState } from 'react'
import { Check, PackageCheck, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { apiMessage, loanStatusLabel } from '../../utils/equipmentLoans.js'
import { filterOptions } from '../../utils/orgListFilter.js'
import { RejectDialog, ReturnDialog } from './EquipmentActionDialogs.jsx'
import OrgCompactList from './OrgCompactList.jsx'

// The organization's loans: who has what, requests waiting for a decision, and returns to confirm.
// `loans` come from the equipment-loans endpoint (newest first); `onChanged()` reloads them after any action.

const TONE = { REQUESTED: 'amber', BORROWED: 'teal', RETURN_PENDING: 'amber', RETURNED: 'green', REJECTED: 'slate', CANCELLED: 'slate' }

const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(String(value).length > 10 ? value : `${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

export default function BorrowedPanel({ type, loans, onChanged }) {
  const { showToast } = useToast()
  const [dialog, setDialog] = useState(null) // { kind: 'return' | 'reject', loan }

  const approve = async (loan) => {
    try {
      await api.post(`/organizations/${type}/equipment-loans/${loan.id}/approve/`)
      showToast('Request approved. The units are lent.', 'success')
    } catch (err) {
      showToast(apiMessage(err, 'The request could not be approved.'), 'error')
    }
    onChanged()
  }

  const items = loans.map((loan) => {
    const status = loan.overdue ? 'Overdue' : loanStatusLabel(loan.status)
    const open = loan.status === 'BORROWED' || loan.status === 'RETURN_PENDING'
    return {
      id: loan.id,
      name: loan.member_name,
      subtitle: `${status} · ${loan.quantity} × ${loan.equipment_name}`,
      dim: !open && loan.status !== 'REQUESTED',
      attrs: { status: loanStatusLabel(loan.status), overdue: loan.overdue ? 'Overdue only' : 'On time', equipment: loan.equipment_name },
      details: [
        { label: 'Equipment', value: loan.equipment_name },
        { label: 'Units', value: loan.quantity },
        { label: 'Status', value: <StatusPill tone={loan.overdue ? 'rose' : TONE[loan.status]}>{status}</StatusPill> },
        { label: 'Asked by', value: loan.origin === 'MEMBER' ? 'The member' : 'The organization' },
        { label: 'Borrowed', value: formatDate(loan.borrowed_at) },
        { label: 'Return by', value: formatDate(loan.due_date) },
        ...(loan.member_note ? [{ label: 'Member note', value: loan.member_note }] : []),
        ...(loan.reject_reason ? [{ label: 'Reason', value: loan.reject_reason }] : []),
        ...(loan.status === 'RETURN_PENDING' ? [{ label: 'Member says returned', value: formatDate(loan.return_requested_at) }] : []),
        ...(loan.status === 'RETURNED'
          ? [
            { label: 'Returned', value: formatDate(loan.returned_at) },
            { label: 'Came back as', value: Object.entries(loan.return_breakdown || {}).map(([c, q]) => `${q} ${c}`).join(', ') || '—' },
          ]
          : []),
      ],
      actions: [
        ...(loan.status === 'REQUESTED' ? [
          { key: 'approve', label: 'Approve', icon: Check, onClick: () => approve(loan) },
          { key: 'reject', label: 'Reject', icon: X, tone: 'danger', onClick: () => setDialog({ kind: 'reject', loan }) },
        ] : []),
        ...(open ? [{ key: 'return', label: 'Mark returned', icon: PackageCheck, onClick: () => setDialog({ kind: 'return', loan }) }] : []),
      ],
    }
  })
  const choices = (key) => filterOptions(items, key).map((value) => ({ value, label: value }))
  const filters = [
    { key: 'status', label: 'Status', allLabel: 'All statuses', options: choices('status') },
    { key: 'overdue', label: 'Overdue', allLabel: 'Overdue or not', options: items.some((i) => i.attrs.overdue === 'Overdue only') ? [{ value: 'Overdue only', label: 'Overdue only' }] : [] },
    { key: 'equipment', label: 'Equipment', allLabel: 'All equipment', options: choices('equipment') },
  ]
  const done = () => { setDialog(null); onChanged() }

  return (
    <div className="space-y-3">
      <OrgCompactList items={items} filters={filters} searchPlaceholder="Search member..." emptyText="Nothing has been borrowed yet." />
      {dialog?.kind === 'return' && <ReturnDialog loan={dialog.loan} type={type} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'reject' && <RejectDialog loan={dialog.loan} type={type} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  )
}
