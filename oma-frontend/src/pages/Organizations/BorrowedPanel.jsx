import { useState } from 'react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { apiMessage } from '../../utils/equipmentLoans.js'
import BorrowerList from './BorrowerList.jsx'
import { RejectDialog, ReturnDialog } from './EquipmentActionDialogs.jsx'

// The organization's loans: one row per borrower that opens onto their items, where each request is approved or rejected
// and each return confirmed one by one. `loans` come from the equipment-loans endpoint (newest first); `onChanged()`
// reloads the loans and the equipment (so returned units show as available again) after any action.
export default function BorrowedPanel({ type, loans, onChanged }) {
  const { showToast } = useToast()
  const [dialog, setDialog] = useState(null) // { kind: 'return' | 'reject', loan }
  const [busyId, setBusyId] = useState(null)

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

  return (
    <div className="space-y-3">
      <BorrowerList
        loans={loans} busyId={busyId} onApprove={approve}
        onReject={(loan) => setDialog({ kind: 'reject', loan })}
        onReturn={(loan) => setDialog({ kind: 'return', loan })}
      />
      {dialog?.kind === 'return' && <ReturnDialog loan={dialog.loan} type={type} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'reject' && <RejectDialog loan={dialog.loan} type={type} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  )
}
