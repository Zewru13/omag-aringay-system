import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import api from '../api/axiosInstance.js'
import { useToast } from '../context/ToastContext.jsx'
import { downloadFile } from '../utils/fileDownload.js'
import { printPdf } from '../utils/printPdf.js'
import { registeredReportUrl } from '../utils/registeredReport.js'

// "Print Report" and "Download Report" on a registration table (Farmers, Fisherfolk, Farmers / Fisherfolk Organizations): the Registered report
// with the table's current filters, the same PDF as Reports > Registered > Preview PDF. `kind` is the report's kind (farmers, fisherfolk,
// farmers_orgs, fisherfolk_orgs); `filters` is the page's own filter state (see utils/registeredReport.js).
const BUTTON = 'flex items-center gap-1.5 border border-[#D8E2D8] bg-white hover:bg-[#F5F7F5] text-[#1B4D2E] text-[13px] font-medium px-4 py-2 rounded-lg transition-colors disabled:cursor-wait disabled:opacity-60'

export default function PrintReportButton({ kind, filters }) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState('')   // 'print' | 'download' while one is running

  const run = async (which, action, failure) => {
    setBusy(which)
    try {
      await action(registeredReportUrl(kind, filters))
    } catch {
      showToast(failure, 'error')
    } finally {
      setBusy('')
    }
  }

  const print = () => run('print', (url) => printPdf(api, url), 'Failed to print the report.')
  const download = () => run('download', (url) => downloadFile(api, url, `${kind}_registered_report.pdf`), 'Failed to download the report.')

  return (
    <>
      <button type="button" onClick={print} disabled={Boolean(busy)} className={BUTTON}>
        <Printer size={16} aria-hidden="true" />
        {busy === 'print' ? 'Preparing…' : 'Print Report'}
      </button>
      <button type="button" onClick={download} disabled={Boolean(busy)} className={BUTTON}>
        <Download size={16} aria-hidden="true" />
        {busy === 'download' ? 'Preparing…' : 'Download Report'}
      </button>
    </>
  )
}
