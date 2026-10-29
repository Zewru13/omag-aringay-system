import { useState } from 'react'
import { Printer } from 'lucide-react'
import { useToast } from '../context/ToastContext.jsx'
import { printSpec } from '../pages/Monitoring/disasterReportDocument.js'

// "Print Report" on the crop and fisheries tables: `build` reads every row the table's filters match and returns the document to print
// (see utils/listReport.js). Read-only: nothing is saved.
export default function ListPrintButton({ build, disabled = false }) {
  const { showToast } = useToast()
  const [isPrinting, setIsPrinting] = useState(false)

  const print = async () => {
    setIsPrinting(true)
    try {
      await printSpec(await build())
    } catch {
      showToast('Failed to print the report.', 'error')
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={print}
      disabled={isPrinting || disabled}
      className="flex items-center gap-1.5 border border-[#D8E2D8] bg-white hover:bg-[#F5F7F5] text-[#1B4D2E] text-[13px] font-medium px-4 py-2 rounded-lg transition-colors disabled:cursor-wait disabled:opacity-60"
    >
      <Printer size={16} aria-hidden="true" />
      {isPrinting ? 'Preparing…' : 'Print Report'}
    </button>
  )
}
