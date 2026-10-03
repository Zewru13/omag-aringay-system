import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Plus, Printer } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { fmtLong } from '../FisheriesRecords/stockingHelpers.js'
import DisasterLogDetailsModal from './DisasterLogDetailsModal.jsx'
import { FISHERIES_LOG, downloadLog, fetchAllStocks, printLog } from './disasterReportDocument.js'
import FisherfolkStockDisasterModal from './FisherfolkStockDisasterModal.jsx'
import LogFisheriesDisasterModal from './LogFisheriesDisasterModal.jsx'

// DISASTER (fisherfolk accounts): My Logged Disasters + Log Disaster. The account is already the
// Fisheries/Aquaculture context, so there is no category choice. Log Disaster -> choose the affected stock
// -> the disaster form -> saved AND submitted to Admin in that one action (Admin is notified). Afterwards
// the fisherfolk can view, print and download what they logged - never edit it (the backend refuses).
// The list is GET /fisheries/disaster-reports/, which the backend limits to this fisherfolk's own logs.

const REPORTABLE = 'Stocked,Near Harvest'
const GENERAL = 'general'
const SUBMISSION_TONES = { SUBMITTED: 'green', DRAFT: 'amber' }

const COLUMNS = [
  { key: 'date_fmt',            label: 'Date' },
  { key: 'disaster_type_label', label: 'Disaster Type' },
  { key: 'stock_cell',          label: 'Affected Stock' },
  { key: 'volume_fmt',          label: 'Volume Lost' },
  { key: 'status_cell',         label: 'Status' },
  { key: 'logged_fmt',          label: 'Date Logged' },
  { key: 'actions_cell',        label: 'Actions' },
]

const fmtDateTime = (v) => (v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v)) : '—')
const stockLabel = (s) => `${s.species_name || 'Stock'}${s.production_cycle_name ? ` · ${s.production_cycle_name}` : ''}`

function ChooseStockModal({ stocks, onClose, onChoose }) {
  const [choice, setChoice] = useState(stocks.length === 1 ? String(stocks[0].id) : (stocks.length ? '' : GENERAL))
  const chosen = choice === GENERAL ? GENERAL : stocks.find(s => String(s.id) === choice)
  return (
    <ModalShell title="Log Disaster" subtitle="Which stock was affected?" icon={AlertTriangle} onClose={onClose} maxWidth="max-w-md"
      footer={<>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={!chosen} onClick={() => chosen && onChoose(chosen)}>Continue</Button>
      </>}>
      <FormField label="Affected Stock" required>
        <select className={baseInputClasses} value={choice} onChange={e => setChoice(e.target.value)}>
          {stocks.length > 0 && <option value="">Select a stock</option>}
          {stocks.map(s => (
            <option key={s.id} value={s.id}>{stockLabel(s)}{s.culture_phase ? ` — ${s.culture_phase}` : ''} — stocked {fmtLong(s.date_stocked)}</option>
          ))}
          <option value={GENERAL}>Not linked to a stock (pond, cage or equipment damage only)</option>
        </select>
      </FormField>
      {stocks.length === 0 && <p className="mt-2 text-xs text-slate-500">You have no stocked aquaculture records right now.</p>}
    </ModalShell>
  )
}

function MarkRecoveredModal({ row, onClose, onDone }) {
  const { showToast } = useToast()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!note.trim()) { showToast('A recovery note is required.', 'error'); return }
    setSaving(true)
    try {
      // Recovery is the disaster's lifecycle, not the log's content (which stays exactly as submitted).
      if (row.kind === 'stock') await api.post(`/fisheries/disasters/${row.id}/resolve/`, { recovery_note: note.trim() })
      else await api.patch(`/monitoring/fisherfolk-disasters/${row.id}/`, { status: 'Recovered', recovery_note: note.trim() })
      showToast('Disaster marked as recovered.', 'success')
      onDone()
    } catch (err) {
      showToast(err?.response?.data?.detail || err?.response?.data?.recovery_note?.[0] || 'Failed to mark as recovered.', 'error')
    } finally { setSaving(false) }
  }
  return (
    <ModalShell title="Mark Recovered" subtitle={`${row.disaster_type_label}${row.affected_stock ? ` · ${row.affected_stock}` : ''}`} icon={CheckCircle2} onClose={onClose} maxWidth="max-w-lg"
      footer={<>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="ff-mark-recovered" isLoading={saving} disabled={saving}>Mark Recovered</Button>
      </>}>
      <form id="ff-mark-recovered" onSubmit={submit}>
        <FormField label="Recovery Note" required>
          <textarea rows={3} className={`${baseInputClasses} resize-none`} value={note} onChange={e => setNote(e.target.value)}
            placeholder="How did you recover? What was done?" />
        </FormField>
      </form>
    </ModalShell>
  )
}

export default function FisherfolkDisasterPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState([])
  const [stocks, setStocks] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const reload = () => setVersion(v => v + 1)
  const [choosing, setChoosing] = useState(false)
  const [loggingOn, setLoggingOn] = useState(null)   // a stock, or GENERAL
  const [viewingId, setViewingId] = useState(null)
  const [recovering, setRecovering] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get('/fisheries/disaster-reports/'),
      fetchAllStocks({ status: REPORTABLE }),
    ]).then(([logs, stock]) => {
      if (cancelled) return
      setRows(Array.isArray(logs.data) ? logs.data : [])
      setStocks(stock)
      setError('')
    }).catch(() => { if (!cancelled) setError('Failed to load your logged disasters.') })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [version])

  const onLogged = (log) => {
    setLoggingOn(null)
    reload()
    if (log?.id) setViewingId(log.id)
  }

  const act = async (id, fn, failMsg) => {
    setBusyId(id)
    try { await fn() } catch (err) { showToast(err?.message || failMsg, 'error') } finally { setBusyId(null) }
  }

  const data = useMemo(() => rows.map(r => ({
    ...r,
    date_fmt: fmtLong(r.date_of_occurrence),
    stock_cell: r.affected_stock || <span className="text-slate-400">Not linked to a stock</span>,
    volume_fmt: r.volume_lost_kg != null ? `${Number(r.volume_lost_kg).toLocaleString()} kg` : '—',
    status_cell: (
      <span className="flex flex-col items-start gap-1">
        <StatusPill tone={SUBMISSION_TONES[r.submission_status] || 'slate'}>{r.submission_label}</StatusPill>
        <span className={`text-[11px] font-semibold ${r.status === 'Active' ? 'text-amber-700' : 'text-green-700'}`}>
          {r.is_total_loss ? 'Total loss' : r.status}
        </span>
      </span>
    ),
    logged_fmt: fmtDateTime(r.date_reported),
    actions_cell: (
      // View Details is the row/card itself (onRowClick below), so the menu keeps only the other actions.
      <RowActions actions={[
        { key: 'print', label: 'Print Disaster Log', icon: Printer, disabled: busyId === r.id,
          onClick: () => act(r.id, () => printLog(FISHERIES_LOG, r.id), 'The disaster log could not be printed.') },
        { key: 'download', label: 'Download Disaster Log', icon: Download, disabled: busyId === r.id,
          onClick: () => act(r.id, () => downloadLog(FISHERIES_LOG, r.id, r.pdf_filename), 'The PDF could not be generated.') },
        r.status === 'Active' && !r.is_total_loss && { key: 'recover', label: 'Mark Recovered', icon: CheckCircle2, group: 'lifecycle', onClick: () => setRecovering(r) },
      ]} />
    ),
  })), [rows, busyId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageLayout title="Disaster" subtitle="Disasters you have logged. Each one is sent to the Office of the Municipal Agriculturist when you log it.">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">My Logged Disasters</h2>
          <Button onClick={() => setChoosing(true)} disabled={isLoading}>
            <Plus size={15} className="mr-1" /> Log Disaster
          </Button>
        </div>
        {error ? <ErrorMessage message={error} /> : <DataTable columns={COLUMNS} data={data} isLoading={isLoading} onRowClick={(row) => setViewingId(row.id)} />}
      </div>

      {choosing && (
        <ChooseStockModal stocks={stocks} onClose={() => setChoosing(false)}
          onChoose={(choice) => { setChoosing(false); setLoggingOn(choice) }} />
      )}
      {loggingOn && loggingOn !== GENERAL && (
        <FisherfolkStockDisasterModal record={loggingOn} onClose={() => setLoggingOn(null)} onSaved={onLogged} />
      )}
      {loggingOn === GENERAL && (
        <LogFisheriesDisasterModal onClose={() => setLoggingOn(null)} onSuccess={onLogged} />
      )}
      {viewingId && <DisasterLogDetailsModal key={viewingId} kind="fisheries" logId={viewingId} onClose={() => setViewingId(null)} />}
      {recovering && <MarkRecoveredModal row={recovering} onClose={() => setRecovering(null)} onDone={() => { setRecovering(null); reload() }} />}
    </PageLayout>
  )
}
