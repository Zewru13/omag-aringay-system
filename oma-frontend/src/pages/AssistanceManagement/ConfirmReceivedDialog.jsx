import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import ConfirmedReportModal from './ConfirmedReportModal.jsx'
import { buildAssistanceReportSpec } from './assistanceReport.js'

// A fisherfolk confirming that they received the assistance. It was a bare button before; now it asks once and, when it goes
// through, offers the Assistance Distribution Report. `url` is the record's confirm-received endpoint.
export default function ConfirmReceivedDialog({ record, url, domain = 'fisheries', onClose, onDone }) {
  const { showToast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (done) {
    const spec = buildAssistanceReportSpec({
      domain, records: [record], confirmedOn: new Date().toISOString(), organizationName: record.attributed_fisherfolk_organization_name || '',
    })
    return <ConfirmedReportModal message="Marked as received." spec={spec} onClose={onDone} />
  }

  const confirm = async () => {
    setIsSubmitting(true)
    try {
      await api.post(url)
      setDone(true)
    } catch (err) {
      const data = err?.response?.data
      showToast((data && typeof data === 'object' && (data.detail || Object.values(data).flat().find((m) => typeof m === 'string'))) || 'Failed to confirm.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Confirm Received"
      subtitle={`${record.assistance_type || 'Assistance'} · ${record.date_given || ''}`}
      icon={CheckCircle2}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" isLoading={isSubmitting} onClick={confirm}>Confirm</Button>
        </>
      )}
    >
      <p className="text-[13px] leading-relaxed text-[#4A5E4A]">Confirm that this assistance was received. After that you can print the report.</p>
    </ModalShell>
  )
}
