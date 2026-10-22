import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import { reportFileName, reportQuery, withSignature } from '../../utils/documentReport.js'
import { ActionButtons, PreviewTable, SignatureModal } from './ReportParts.jsx'

// A report built from a backend "document": { title, subtitle, stats: [[label, value]], sections: [{ title, pairs } | { title, headers, rows, empty }] }.
// The same document is the on-screen preview, the PDF and the Excel, so they always agree.

function DocumentView({ doc, isLoading, emptyText }) {
  if (isLoading || !doc) {
    return <PreviewTable headers={['']} rows={[]} isLoading={isLoading} emptyText={emptyText} />
  }
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[15px] font-semibold text-[#1A2B1A]">{doc.title}</p>
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

// Shows one document report: the caller's `filters` on top, then the Print / PDF / Excel row and the document.
//   path    the backend report URL, e.g. '/reports/registered/'
//   params  the filters as an object; blank values are left out. A change reloads the preview.
//   stem    the download file name without extension
//   ready   false while the filters are not complete (e.g. no record chosen yet): nothing is fetched and `notReady` shows
export default function DocumentReport({ path, params, stem, filters, ready = true, notReady = '', emptyText = 'No records found.' }) {
  const { showToast } = useToast()
  const [loaded, setLoaded] = useState({ key: null, doc: null })
  const [isDownloading, setIsDownloading] = useState(false)
  const [sigPurpose, setSigPurpose] = useState(null)

  const key = ready ? reportQuery(params, 'json') : null
  const isLoading = ready && loaded.key !== key

  useEffect(() => {
    if (!key) return undefined
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

  const generate = async (sig) => {
    const format = sigPurpose === 'pdf' ? 'pdf' : 'excel'
    setSigPurpose(null)
    setIsDownloading(true)
    try {
      await downloadFile(api, `${path}?${withSignature(reportQuery(params, format), sig)}`, reportFileName(stem, format))
    } catch {
      showToast(`Failed to generate ${format === 'pdf' ? 'PDF' : 'Excel'}.`, 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  const failed = ready && !isLoading && !loaded.doc

  return (
    <div className="space-y-5">
      {filters}

      <ActionButtons
        onPdf={() => setSigPurpose('pdf')}
        onExcel={() => setSigPurpose('excel')}
        isDownloading={isDownloading || !ready || isLoading || failed}
      />

      {!ready && <p className="rounded-xl border border-dashed border-[#C8D5C8] bg-white py-8 text-center text-[13px] text-[#7A8E7A]">{notReady}</p>}
      {ready && !failed && <DocumentView doc={loaded.doc} isLoading={isLoading} emptyText={emptyText} />}
      {failed && <p className="rounded-xl border border-[#E2E8E2] bg-white py-8 text-center text-[13px] text-[#7A8E7A]">The report could not be loaded. Change a filter to try again.</p>}

      {sigPurpose && <SignatureModal purpose={sigPurpose} onClose={() => setSigPurpose(null)} onGenerate={generate} />}
    </div>
  )
}
