import { useState } from 'react'
import { CheckCircle2, Printer } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { printSpec } from '../Monitoring/disasterReportDocument.js'

// Shown in place of a confirmation window once the confirmation went through: it says so and offers the Assistance
// Distribution Report straight away (`spec` from assistanceReport.js), so the office does not have to look the records up again.
export default function ConfirmedReportModal({ title = 'Assistance Confirmed', message, spec, onClose }) {
  const { showToast } = useToast()
  const [isPrinting, setIsPrinting] = useState(false)

  const print = async () => {
    setIsPrinting(true)
    try {
      await printSpec(spec)
    } catch {
      showToast('Could not open the report for printing.', 'error')
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <ModalShell
      title={title}
      subtitle="The confirmation was recorded."
      icon={CheckCircle2}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
          <Button type="button" icon={Printer} isLoading={isPrinting} onClick={print}>Print report</Button>
        </>
      )}
    >
      <div className="flex flex-col items-center px-2 py-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1B4D2E]">
          <CheckCircle2 size={28} className="text-white" aria-hidden="true" />
        </div>
        <p className="mt-3 text-[15px] font-bold text-[#1A2B1A]">{message}</p>
        <p className="mt-1 text-[13px] text-[#7A8E7A]">Print the Assistance Distribution Report now, or close this and print it later from the records.</p>
      </div>
    </ModalShell>
  )
}
