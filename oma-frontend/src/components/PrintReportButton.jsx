import { useState } from 'react'
import { Printer } from 'lucide-react'
import api from '../api/axiosInstance.js'
import { useToast } from '../context/ToastContext.jsx'
import { printPdf } from '../utils/printPdf.js'
import { registeredReportUrl } from '../utils/registeredReport.js'

// "Print Report" on a registration table (Farmers, Fisherfolk, Farmers / Fisherfolk Organizations): prints the Registered report with the
// table's current filters, the same PDF as Reports > Registered > Preview PDF. `kind` is the report's kind (farmers, fisherfolk,
// farmers_orgs, fisherfolk_orgs); `filters` is the page's own filter state (see utils/registeredReport.js).
export default function PrintReportButton({ kind, filters }) {
  const { showToast } = useToast()
  const [isPrinting, setIsPrinting] = useState(false)

  const print = async () => {
    setIsPrinting(true)
    try {
      await printPdf(api, registeredReportUrl(kind, filters))
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
      disabled={isPrinting}
      className="flex items-center gap-1.5 border border-[#D8E2D8] bg-white hover:bg-[#F5F7F5] text-[#1B4D2E] text-[13px] font-medium px-4 py-2 rounded-lg transition-colors disabled:cursor-wait disabled:opacity-60"
    >
      <Printer size={16} aria-hidden="true" />
      {isPrinting ? 'Preparing…' : 'Print Report'}
    </button>
  )
}
