import { useEffect, useState } from 'react'
import { Download, FileText, Printer } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import {
  FARMER_LOG, FISHERIES_LOG, allPhotoUrls, cropSections, downloadLog, fmtDateTime, lossTable, printLog, reportSections,
  stocksTable,
} from './disasterReportDocument.js'

// Disaster Details (read-only) for a Fisheries log (kind="fisheries"; fisherfolk: their own, staff: any)
// or a Farmer log (kind="farmer"; staff). Shows the saved values only, with Print Disaster Log and Download
// Disaster Log - both read-only. The backend refuses another fisherfolk's log whatever id is asked for.

const SUBMISSION_TONES = { SUBMITTED: 'green', DRAFT: 'amber' }
const STATUS_TONES = { Active: 'amber', Recovered: 'green' }

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="border-b border-[#E2E8E2] pb-1 text-[12px] font-semibold uppercase tracking-wide text-[#1E4620]">{title}</h3>
      {children}
    </section>
  )
}

function Rows({ rows }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 border-b border-[#F0F4F0] pb-1.5">
          <dt className="text-[12px] font-medium text-[#7A8E7A]">{label}</dt>
          <dd className="text-right text-[13px] font-semibold text-[#1A2B1A]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Photos({ urls }) {
  if (!urls.length) return null
  return (
    <Section title={`Photo Documentation (${urls.length})`}>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {urls.map((url, i) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noreferrer" title={`Open photo ${i + 1}`}>
              <img src={url} alt={`Damage photo ${i + 1}`} className="h-28 w-full rounded-lg border border-slate-200 bg-slate-50 object-contain" />
            </a>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Paragraphs({ items, empty = 'No description recorded.' }) {
  if (!items.length) return <p className="text-[13px] italic text-slate-500">{empty}</p>
  return items.map(t => <p key={t} className="whitespace-pre-wrap text-[13px] text-[#1A2B1A]">{t}</p>)
}

// A read-only data table (affected stocks / fingerlings lost); scrolls sideways on narrow screens.
function TableBlock({ table, testId }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#E2E8E2]" data-testid={testId}>
      <table className="w-full min-w-[520px] text-[13px]">
        <thead className="bg-[#F9FAF9] text-left text-[11px] uppercase tracking-wide text-[#7A8E7A]">
          <tr>{table.head.map(h => <th key={h} className="px-2.5 py-1.5 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className={`border-t border-[#F0F4F0] ${table.boldRows.has(i) ? 'bg-[#F9FAF9] font-semibold' : ''}`}>
              {r.map((v, j) => <td key={j} className="px-2.5 py-1.5 text-[#1A2B1A]">{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FisheriesBody({ doc }) {
  const s = reportSections(doc)
  const stocks = stocksTable(doc)
  const losses = lossTable(doc)
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-[#1A2B1A]">Reference No. {doc.report_number}</span>
        <StatusPill tone={SUBMISSION_TONES[doc.submission_status] || 'slate'}>{doc.submission_label}</StatusPill>
        <StatusPill tone={STATUS_TONES[doc.status] || 'slate'}>{doc.status}</StatusPill>
      </div>
      {doc.submission_status === 'SUBMITTED' && (
        <p className="rounded-lg border border-green-200 bg-[#f0f7f0] px-3 py-2 text-[13px] text-[#1E4620]">
          Submitted to Admin on {fmtDateTime(doc.submitted_at)}{doc.submitted_by_name ? ` by ${doc.submitted_by_name}` : ''}.
        </p>
      )}
      <Section title="Disaster Log"><Rows rows={s.header} /></Section>
      <Section title="Fisherfolk"><Rows rows={s.fisherfolk} /></Section>
      {stocks && <Section title="Affected Stocks"><TableBlock table={stocks} testId="affected-stocks" /></Section>}
      {s.stock && <Section title="Affected Stock"><Rows rows={s.stock} /></Section>}
      {losses && (
        <Section title="Fingerlings Lost per Stock and Production Unit"><TableBlock table={losses} testId="fingerlings-lost" /></Section>
      )}
      <Section title="Disaster Details"><Rows rows={s.details} /></Section>
      <Section title="Equipment Damaged">
        {doc.equipment_damaged.length ? (
          <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-[#1A2B1A]">{doc.equipment_damaged.map(e => <li key={e}>{e}</li>)}</ul>
        ) : <p className="text-[13px] italic text-slate-500">No equipment recorded as damaged.</p>}
      </Section>
      <Section title="Description of Damage">
        {/* Optional on the form: a blank description reads "Not provided." */}
        <Paragraphs empty="Not provided." items={[doc.description, doc.production_loss && `Estimated production loss: ${doc.production_loss}`,
          doc.status === 'Recovered' && doc.recovery_note && `Recovery note: ${doc.recovery_note}`].filter(Boolean)} />
      </Section>
      <Photos urls={allPhotoUrls(doc)} />
    </>
  )
}

function FarmerBody({ doc }) {
  const s = cropSections(doc)
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-[#1A2B1A]">Reference No. {doc.report_number}</span>
        <StatusPill tone={STATUS_TONES[doc.status] || 'slate'}>{doc.status}</StatusPill>
      </div>
      <Section title="Disaster Log"><Rows rows={s.header} /></Section>
      <Section title="Farmer"><Rows rows={s.farmer} /></Section>
      <Section title="Affected Crop"><Rows rows={s.crop} /></Section>
      <Section title="Disaster Details"><Rows rows={s.details} /></Section>
      <Section title="Description of Damage"><Paragraphs items={s.paragraphs} /></Section>
      <Photos urls={[...(doc.photo ? [doc.photo] : []), ...(doc.photos || []).map(p => p.url)]} />
    </>
  )
}

export default function DisasterLogDetailsModal({ kind = 'fisheries', logId, onClose }) {
  const { showToast } = useToast()
  const config = kind === 'farmer' ? FARMER_LOG : FISHERIES_LOG
  const [doc, setDoc] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    let cancelled = false
    api.get(config.docUrl(logId))
      .then((r) => { if (!cancelled) { setDoc(r.data); setError('') } })
      .catch((err) => { if (!cancelled) setError(err?.response?.status === 404 ? 'This disaster log was not found.' : 'Failed to load the disaster log.') })
    return () => { cancelled = true }
  }, [config, logId])

  const run = async (what, fn, failMsg) => {
    setBusy(what)
    try { await fn() } catch (err) { showToast(err?.message && what === 'download' ? err.message : failMsg, 'error') } finally { setBusy('') }
  }

  return (
    <ModalShell
      title="Disaster Details"
      subtitle={doc ? `${doc.report_number} · ${kind === 'farmer' ? doc.farmer?.name : doc.fisherfolk?.name || ''}` : 'Loading…'}
      icon={FileText}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={doc && (
        <>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button type="button" variant="outline" isLoading={busy === 'print'} disabled={!!busy}
            onClick={() => run('print', () => printLog(config, logId, doc), 'The disaster log could not be printed. Please try again.')}>
            <Printer size={15} className="mr-1" /> Print Disaster Log
          </Button>
          <Button type="button" isLoading={busy === 'download'} disabled={!!busy}
            onClick={() => run('download', () => downloadLog(config, logId, doc.pdf_filename), 'The PDF could not be generated. Please try again.')}>
            <Download size={15} className="mr-1" /> Download Disaster Log
          </Button>
        </>
      )}
    >
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      {!doc && !error && <p className="text-sm text-slate-500">Loading the disaster log…</p>}
      {doc && (
        <div className="space-y-5" data-testid="disaster-log">
          {kind === 'farmer' ? <FarmerBody doc={doc} /> : <FisheriesBody doc={doc} />}
        </div>
      )}
    </ModalShell>
  )
}
