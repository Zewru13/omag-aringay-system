import { useCallback, useState } from 'react'
import api from '../api/axiosInstance.js'
import { useToast } from '../context/ToastContext.jsx'
import { disasterReportStem, disasterReportUrl } from '../utils/disasterReport.js'
import { downloadFile } from '../utils/fileDownload.js'
import { printPdf } from '../utils/printPdf.js'

// Print and Download of the Disaster tables' report: the same PDF as Reports > Crop / Fisheries Disaster > Preview PDF, for the table's
// filters (`filters`, see utils/disasterReport.js) or for one farmer / fisherfolk (`person`: { kind, id, name }). `busy` is 'print' |
// 'download' while one runs, so the buttons can wait. Read-only: nothing is saved.
export default function useDisasterReportActions(kind, filters, person = null) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState('')

  const run = useCallback(async (which, action, failure) => {
    setBusy(which)
    try {
      await action()
    } catch {
      showToast(failure, 'error')
    } finally {
      setBusy('')
    }
  }, [showToast])

  const print = useCallback(() => run('print', () => printPdf(api, disasterReportUrl(kind, filters, person, 'pdf')), 'Failed to print the report.'), [run, kind, filters, person])
  const download = useCallback(() => run('download', () => downloadFile(api, disasterReportUrl(kind, filters, person, 'pdf'), `${disasterReportStem(kind, person)}.pdf`), 'Failed to download the report.'), [run, kind, filters, person])
  return { busy, print, download }
}
