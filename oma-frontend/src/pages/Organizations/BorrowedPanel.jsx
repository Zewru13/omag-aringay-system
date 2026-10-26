import { useMemo, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { splitLoans } from '../../utils/borrowerGroups.js'
import { apiMessage } from '../../utils/equipmentLoans.js'
import BorrowerList from './BorrowerList.jsx'
import { RejectDialog, ReturnDialog } from './EquipmentActionDialogs.jsx'
import ReturnedTable from './ReturnedTable.jsx'

// The organization's loans in two tables. Borrowed: what is still out (and requests), one row per borrower that opens onto their items,
// where each request is approved or rejected and each item marked returned. Returned: everything that came back, with when and in what
// condition. `loans` come from the equipment-loans endpoint (newest first); `onChanged()` reloads the loans and the equipment (so
// returned units show as available again) after any action.
const TAB = 'min-h-10 rounded-lg px-4 text-[13px] font-semibold transition-colors'

export default function BorrowedPanel({ type, loans, onChanged }) {
  const { showToast } = useToast()
  const [view, setView] = useState('borrowed') // 'borrowed' | 'returned'
  const [dialog, setDialog] = useState(null) // { kind: 'return' | 'reject', loan }
  const [busyId, setBusyId] = useState(null)
  const { out, returned } = useMemo(() => splitLoans(loans), [loans])

  const approve = async (loan) => {
    setBusyId(loan.id)
    try {
      await api.post(`/organizations/${type}/equipment-loans/${loan.id}/approve/`)
      showToast(`Approved. ${loan.quantity} × ${loan.equipment_name} lent to ${loan.member_name}.`, 'success')
    } catch (err) {
      showToast(apiMessage(err, 'The request could not be approved.'), 'error')
    } finally {
      setBusyId(null)
    }
    onChanged()
  }

  const done = () => { setDialog(null); onChanged() }
  const tab = (key, label, count) => (
    <button
      type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)}
      className={`${TAB} ${view === key ? 'bg-[#1B4D2E] text-white' : 'text-[#4A5E4A] hover:bg-[#F0F4F0]'}`}
    >
      {label} <span className={view === key ? 'text-white/80' : 'text-[#7A8E7A]'}>({count})</span>
    </button>
  )

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Borrowed or returned equipment" className="inline-flex gap-1 rounded-xl border border-[#E2E8E2] bg-white p-1">
        {tab('borrowed', 'Borrowed', out.length)}
        {tab('returned', 'Returned', returned.length)}
      </div>

      {view === 'borrowed' ? (
        <BorrowerList
          loans={out} busyId={busyId} onApprove={approve}
          onReject={(loan) => setDialog({ kind: 'reject', loan })}
          onReturn={(loan) => setDialog({ kind: 'return', loan })}
        />
      ) : (
        <ReturnedTable loans={returned} />
      )}
      {dialog?.kind === 'return' && <ReturnDialog loan={dialog.loan} type={type} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'reject' && <RejectDialog loan={dialog.loan} type={type} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  )
}
