import { useEffect, useState } from 'react'
import { CheckCircle2, Download, Printer } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { DetailTable } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { CROP_EVENT, downloadLog, printLog } from './disasterReportDocument.js'
import { eventDetails, eventParagraphs, eventSummary, eventTable } from './disasterEventReport.js'

// The report of the disaster event Log Disaster has just saved, in the same floating window: its details and every parcel and crop that was
// reported, with Download (PDF), Print and Done in the footer. Read-only; it shows the saved reports, so what is printed is what was recorded.

const TH = 'whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em]'

export default function CropDisasterEventReport({ ids, onDone }) {
  const { showToast } = useToast()
  const idList = ids.join(',')
  const [doc, setDoc] = useState(null)             // null while loading, false when it failed
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState('')              // 'print' | 'download' while one is running

  useEffect(() => {
    let alive = true
    api.get(CROP_EVENT.docUrl(idList))
      .then((r) => alive && setDoc(r.data))
      .catch(() => alive && setDoc(false))
    return () => { alive = false }
  }, [idList, reload])

  const run = async (kind, action, failure) => {
    setBusy(kind)
    try {
      await action()
    } catch (err) {
      showToast(err?.message || failure, 'error')
    } finally {
      setBusy('')
    }
  }
  const download = () => run('download', () => downloadLog(CROP_EVENT, idList, doc.pdf_filename), 'The PDF could not be generated. Please try again.')
  const print = () => run('print', () => printLog(CROP_EVENT, idList, doc), 'The report could not be printed.')

  const table = doc ? eventTable(doc) : null
  const paragraphs = doc ? eventParagraphs(doc) : []

  return (
    <ModalShell
      title="Disaster Reported"
      subtitle={doc ? `${eventSummary(doc)} · Reference ${doc.reference}` : `${ids.length} report${ids.length === 1 ? '' : 's'} saved`}
      icon={CheckCircle2}
      iconBg="bg-emerald-100"
      iconColor="text-emerald-700"
      onClose={onDone}
      maxWidth="max-w-5xl"
      footer={<>
        <Button type="button" variant="outline" icon={Download} isLoading={busy === 'download'} disabled={!doc || Boolean(busy)} onClick={download}>Download report</Button>
        <Button type="button" variant="outline" icon={Printer} isLoading={busy === 'print'} disabled={!doc || Boolean(busy)} onClick={print}>Print report</Button>
        <Button type="button" onClick={onDone}>Done</Button>
      </>}
    >
    <div className="space-y-3" data-testid="disaster-event-report">
      {doc === null && <p className="rounded-xl border border-[#E2E8E2] bg-white px-4 py-10 text-center text-[13px] text-[#7A8E7A]">Preparing the report…</p>}
      {doc === false && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          <span className="flex-1">The disaster was saved, but its report could not be loaded. You can find each report in the Crop Disaster list.</span>
          <Button type="button" variant="outline" onClick={() => { setDoc(null); setReload((n) => n + 1) }}>Try again</Button>
        </div>
      )}

      {doc && (
        <>
          <DetailTable title="Disaster Details" fields={eventDetails(doc).map(([label, value]) => ({ label, value }))} />
          {paragraphs.length > 0 && (
            <div className="space-y-1 rounded-xl border border-[#E2E8E2] bg-white px-3 py-2.5 text-[13px] text-[#1A2B1A]">
              {paragraphs.map((p) => <p key={p} className="whitespace-pre-wrap">{p}</p>)}
            </div>
          )}

          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Reported parcels and crops</h3>
            <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white">
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="bg-[#F0F4F0] text-[#4A5E4A]">
                  <tr>{table.head.map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => (
                    <tr key={i} className={`border-t border-[#F0F4F0] ${table.boldRows.has(i) ? 'bg-[#F9FAF9] font-semibold' : ''}`}>
                      {row.map((cell, j) => (
                        <td key={j} className={`px-3 py-2.5 text-[13px] ${j === 0 ? 'font-medium text-[#1A2B1A]' : 'text-[#4A5E4A]'} ${j === 6 && cell === 'Yes' ? 'font-semibold text-rose-700' : ''}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
    </ModalShell>
  )
}
