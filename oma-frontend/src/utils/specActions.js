import api from '../api/axiosInstance.js'
import { printSpec } from '../pages/Monitoring/disasterReportDocument.js'
import { saveResponse } from './fileDownload.js'
import { specPdfBody, specPdfFilename } from './specPdf.js'

// Print Report and Download Report of a printable document (the `spec` of utils/listReport.js and the assistance reports): Print shows the
// document; Download sends the very same document to the server, which lays it out as a PDF (POST /reports/spec-pdf/), so the two agree.
export const printSpecReport = (spec) => printSpec(spec)

export async function downloadSpecReport(spec) {
  const response = await api.post('/reports/spec-pdf/', specPdfBody(spec), { responseType: 'blob' })
  saveResponse(response, specPdfFilename(spec))
}
