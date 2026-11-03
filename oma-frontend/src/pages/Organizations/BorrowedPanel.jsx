import { useMemo, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { splitLoans } from '../../utils/borrowerGroups.js'
import { apiMessage } from '../../utils/equipmentLoans.js'
import BorrowerList from './BorrowerList.jsx'
import { RejectDialog, ReturnDialog } from './EquipmentActionDialogs.jsx'

// What is still out (and the requests), one row per borrower that opens onto their items, where each request is approved or rejected and
// each item marked returned. What came back is not here: it is the organization's History tab (BorrowedHistory). `loans` come from the
// equipment-loans endpoint (newest first); `onChanged()` reloads the loans and the equipment (so returned units show as available again)
// after any action.

export default function BorrowedPanel({ type, loans, onChanged }) {
  const { showToast } = useToast()
  const [dialog, setDialog] = useState(null) // { kind: 'return' | 'reject', loan }
  const [busyId, setBusyId] = useState(null)
  const { out } = useMemo(() => splitLoans(loans), [loans])

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
        loans={out} busyId={busyId} onApprove={approve}
        onReject={(loan) => setDialog({ kind: 'reject', loan })}
        onReturn={(loan) => setDialog({ kind: 'return', loan })}
      />
      {dialog?.kind === 'return' && <ReturnDialog loan={dialog.loan} type={type} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'reject' && <RejectDialog loan={dialog.loan} type={type} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  )
}
