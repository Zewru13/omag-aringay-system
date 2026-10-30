import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import api from '../api/axiosInstance.js'
import { useToast } from '../context/ToastContext.jsx'
import { printSpec } from '../pages/Monitoring/disasterReportDocument.js'
import { saveResponse } from '../utils/fileDownload.js'
import { specPdfBody, specPdfFilename } from '../utils/specPdf.js'

// "Print Report" and "Download Report" on the crop and fisheries tables: `build` reads every row the table's filters match and returns the
// document (see utils/listReport.js). Print shows that document; Download sends the same document to the server, which lays it out as a PDF
// (POST /reports/spec-pdf/), so the two always agree. Read-only: nothing is saved.
const BUTTON = 'flex items-center gap-1.5 border border-[#D8E2D8] bg-white hover:bg-[#F5F7F5] text-[#1B4D2E] text-[13px] font-medium px-4 py-2 rounded-lg transition-colors disabled:cursor-wait disabled:opacity-60'

export default function ListPrintButton({ build, disabled = false }) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState('')   // 'print' | 'download' while one is running

  const run = async (which, action, failure) => {
    setBusy(which)
    try {
      await action(await build())
    } catch {
      showToast(failure, 'error')
    } finally {
      setBusy('')
    }
  }

  const print = () => run('print', (spec) => printSpec(spec), 'Failed to print the report.')
  const download = () => run('download', async (spec) => {
    const response = await api.post('/reports/spec-pdf/', specPdfBody(spec), { responseType: 'blob' })
    saveResponse(response, specPdfFilename(spec))
  }, 'Failed to download the report.')

  return (
    <>
      <button type="button" onClick={print} disabled={Boolean(busy) || disabled} className={BUTTON}>
        <Printer size={16} aria-hidden="true" />
        {busy === 'print' ? 'Preparing…' : 'Print Report'}
      </button>
      <button type="button" onClick={download} disabled={Boolean(busy) || disabled} className={BUTTON}>
        <Download size={16} aria-hidden="true" />
        {busy === 'download' ? 'Preparing…' : 'Download Report'}
      </button>
    </>
  )
}
