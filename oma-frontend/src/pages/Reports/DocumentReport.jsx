import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import { printPdf } from '../../utils/printPdf.js'
import { reportFileName, reportQuery, withSignature } from '../../utils/documentReport.js'
import { ActionButtons, PreviewTable, SignatoriesPanel } from './ReportParts.jsx'
import { IndividualBar, ReportPaper, SelectedReportBox } from './ReportPaper.jsx'
import { paperDocument, reportType } from './reportPaper.js'
import { useSignatories } from './useSignatories.js'

// A report built from a backend "document": { title, subtitle, stats: [[label, value]], sections: [{ title, pairs } | { title, headers, rows, empty }] }.
// The same document is the paper preview, the PDF and the Excel, so they always agree.

// The plain on-screen view of a document (stats, then each section), used where there is no paper page, e.g. the Disaster page's report window.
export function DocumentView({ doc, isLoading, emptyText }) {
  if (isLoading || !doc) {
    return <PreviewTable headers={['']} rows={[]} isLoading={isLoading} emptyText={emptyText} />
  }
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[15px] font-semibold text-[#1A2B1A]">{doc.title}</p>
        {doc.period && <p className="text-[12px] font-medium text-[#4A5E4A]">{doc.period}</p>}
        {doc.subtitle && <p className="text-[12px] text-[#7A8E7A]">{doc.subtitle}</p>}
      </div>

      {doc.stats?.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {doc.stats.map(([label, value]) => (
            <div key={label} className="bg-[#EBF5EE] rounded-xl p-4">
              <p className="text-[11px] font-medium text-[#4A5E4A]">{label}</p>
              <p className="text-[20px] font-bold text-[#1B4D2E] mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      {doc.sections.map((section, i) => (
        <div key={i}>
          {section.title && <p className="text-[13px] font-semibold text-[#1A2B1A] mb-2">{section.title}</p>}
          {section.pairs ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-[#E2E8E2] bg-white p-4">
              {section.pairs.map(([label, value]) => (
                <div key={label} className="flex flex-col sm:flex-row sm:gap-3 min-w-0">
                  <dt className="text-[12px] font-medium text-[#7A8E7A] sm:w-40 sm:shrink-0">{label}</dt>
                  <dd className="text-[13px] text-[#1A2B1A] break-words min-w-0">{value === '' || value === null ? '—' : String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <PreviewTable headers={section.headers} rows={section.rows} isLoading={false} emptyText={section.empty} />
          )}
        </div>
      ))}
    </div>
  )
}

// Shows one document report: the caller's `filters` on top, then the Selected report box, the Signatories block, the Print Report /
// Download Report buttons and the paper preview.
//   reportId  which report this is (an id of REPORT_TYPES), for the Selected report box
//   path    the backend report URL, e.g. '/reports/registered/'
//   params  the filters as an object; blank values are left out. A change reloads the preview.
//   stem    the download file name without extension
//   picked, onPickRow, onShowAll  (reports that can show one record) the clicked row {id, label}, what a click on a row does, and how to go back
export default function DocumentReport({ reportId, path, params, stem, filters, emptyText = 'No records found.', picked = null, onPickRow, onShowAll }) {
  const { showToast } = useToast()
  const [loaded, setLoaded] = useState({ key: null, doc: null })
  const [isDownloading, setIsDownloading] = useState(false)
  const signatories = useSignatories()

  const key = reportQuery(params, 'json')
  const isLoading = loaded.key !== key

  useEffect(() => {
    let current = true
    api.get(`${path}?${key}`)
      .then(res => { if (current) setLoaded({ key, doc: res.data }) })
      .catch(() => {
        if (!current) return
        setLoaded({ key, doc: null })
        showToast('Failed to load the report.', 'error')
      })
    return () => { current = false }
  }, [path, key, showToast])

  // Print Report and Download Report are the same PDF (same filters, period, table and signers): one is printed from a hidden frame, the
  // other is saved.
  const pdfQuery = () => withSignature(reportQuery(params, 'pdf'), signatories.params)

  const print = async () => {
    setIsDownloading(true)
    try {
      await printPdf(api, `${path}?${pdfQuery()}`)
    } catch {
      showToast('Failed to print the report.', 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  const download = async () => {
    setIsDownloading(true)
    try {
      await downloadFile(api, `${path}?${pdfQuery()}`, reportFileName(stem, 'pdf'))
    } catch {
      showToast('Failed to download the report.', 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  const failed = !isLoading && !loaded.doc
  const paper = loaded.doc && !isLoading ? paperDocument(loaded.doc) : null

  return (
    <div className="space-y-5">
      {filters}

      <IndividualBar doc={loaded.doc && !isLoading ? loaded.doc : null} picked={picked} onShowAll={onShowAll} />

      <SelectedReportBox type={reportType(reportId)} period={paper?.period} detail={paper?.detail} />

      <SignatoriesPanel signatories={signatories} />

      <ActionButtons onPrint={print} onDownload={download} isDownloading={isDownloading || isLoading || failed} />

      {!failed && (
        <ReportPaper
          doc={paper}
          signers={signatories.params}
          isLoading={isLoading}
          emptyText={emptyText}
          onPickRow={onPickRow}
        />
      )}
      {failed && <p className="rounded-xl border border-[#E2E8E2] bg-white py-8 text-center text-[13px] text-[#7A8E7A]">The report could not be loaded. Change a filter to try again.</p>}
    </div>
  )
}
