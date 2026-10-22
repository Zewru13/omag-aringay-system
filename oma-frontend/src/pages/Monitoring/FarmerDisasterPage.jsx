import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Download, History, Printer } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { canRecoverDisaster, disasterStatusLabel } from './disasterRecovery.js'
import { fmtLong } from '../FisheriesRecords/stockingHelpers.js'
import { ChooseCropsModal, MultiCropDisasterModal } from './MultiCropDisaster.jsx'
import DisasterLogDetailsModal from './DisasterLogDetailsModal.jsx'
import DisasterHistoryModal from './DisasterHistoryModal.jsx'
import { FARMER_LOG, downloadLog, printLog } from './disasterReportDocument.js'

// DISASTER (farmer accounts): My Logged Disasters + Log Disaster, the farmer counterpart of
// FisherfolkDisasterPage. Own logs come from GET /production/disaster-logs/ (the backend limits it to this
// farmer's crops). Log Disaster -> tick the affected crops (their own active crops) -> one disaster form for all of
// them (one report is saved for each crop). A farmer with no active crop has nothing to log against, so the button
// is disabled with the reason instead of opening a form.

const ACTIVE_CROPS = 'Planted,Near Harvest'
const STATUS_TONES = { Active: 'amber', Recovered: 'green' }

const fmtDateTime = (v) => (v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v)) : '—')
const listOf = (data) => (Array.isArray(data) ? data : (data?.results || []))
const cropLabel = (c) => `${c.crop_type_name || 'Crop'}${c.season ? ` · ${c.season} ${c.year}` : ''} — planted ${fmtLong(c.date_planted)}${c.farm_location_barangay ? ` · ${c.farm_location_barangay}` : ''}`

function MarkRecoveredModal({ row, onClose, onDone }) {
  const { showToast } = useToast()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post(`/production/disasters/${row.id}/resolve/`, note.trim() ? { recovery_note: note.trim() } : {})
      showToast('Disaster marked as recovered.', 'success')
      onDone()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to mark as recovered.', 'error')
    } finally { setSaving(false) }
  }
  return (
    <ModalShell title="Mark Recovered" subtitle={`${row.disaster_type_label} · ${row.crop || 'Crop'}`} icon={CheckCircle2} onClose={onClose} maxWidth="max-w-md"
      footer={<>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="farmer-mark-recovered" isLoading={saving} disabled={saving}>Mark Recovered</Button>
      </>}>
      <form id="farmer-mark-recovered" onSubmit={submit}>
        <FormField label="Recovery Note">
          <textarea rows={3} className={`${baseInputClasses} resize-none`} value={note} onChange={e => setNote(e.target.value)}
            placeholder="How did the crop recover? What was done?" />
        </FormField>
      </form>
    </ModalShell>
  )
}

export default function FarmerDisasterPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState([])
  const [crops, setCrops] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const reload = () => setVersion(v => v + 1)
  const [loggingOn, setLoggingOn] = useState(null)   // the crops chosen for the disaster (null = still choosing)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [viewingId, setViewingId] = useState(null)
  const [recovering, setRecovering] = useState(null)
  const [busyId, setBusyId] = useState(null)
  // ?crop=<id> (from the phone home): log a disaster on that crop straight away.
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedCropId = searchParams.get('crop')
  const [linkUsed, setLinkUsed] = useState(false)
  const endLink = () => { setLinkUsed(true); if (linkedCropId) setSearchParams({}, { replace: true }) }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get('/production/disaster-logs/'),
      api.get('/production/monitoring/', { params: { status: ACTIVE_CROPS } }),
    ]).then(([logs, active]) => {
      if (cancelled) return
      setRows(listOf(logs.data))
      setCrops(listOf(active.data))
      setError('')
    }).catch(() => { if (!cancelled) setError('Failed to load your logged disasters.') })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [version])

  const act = async (id, fn, failMsg) => {
    setBusyId(id)
    try { await fn() } catch (err) { showToast(err?.message || failMsg, 'error') } finally { setBusyId(null) }
  }

  const data = useMemo(() => rows.map(r => ({
    ...r,
    date_fmt: fmtLong(r.date_of_occurrence),
    area_fmt: r.area_affected_ha != null ? `${Number(r.area_affected_ha).toLocaleString()} ha` : '—',
    status_cell: <StatusPill tone={r.status === 'Active' && !canRecoverDisaster(r) ? 'slate' : (STATUS_TONES[r.status] || 'slate')}>{disasterStatusLabel(r)}</StatusPill>,
    logged_fmt: fmtDateTime(r.date_reported),
    actions_cell: (
      // View Details is the row itself (onRowClick below), so the menu keeps only the other actions.
      <RowActions actions={[
        { key: 'print', label: 'Print Disaster Log', icon: Printer, disabled: busyId === r.id,
          onClick: () => act(r.id, () => printLog(FARMER_LOG, r.id), 'The disaster log could not be printed.') },
        { key: 'download', label: 'Download Disaster Log', icon: Download, disabled: busyId === r.id,
          onClick: () => act(r.id, () => downloadLog(FARMER_LOG, r.id, r.pdf_filename), 'The PDF could not be generated.') },
        canRecoverDisaster(r) && { key: 'recover', label: 'Mark Recovered', icon: CheckCircle2, group: 'lifecycle', onClick: () => setRecovering(r) },
      ]} />
    ),
  })), [rows, busyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const noCrops = !isLoading && !error && crops.length === 0
  const cropChoices = useMemo(() => crops.map(c => ({ ...c, label: cropLabel(c) })), [crops])
  const linkedCrop = linkedCropId && !linkUsed ? cropChoices.find(c => String(c.id) === linkedCropId) : null

  const historyColumns = [
    { key: 'report_number', label: 'Reference No.' },
    { key: 'crop', label: 'Crop' },
    { key: 'disaster_type_label', label: 'Disaster Type' },
    { key: 'date_fmt', label: 'Date of Occurrence' },
    { key: 'area_fmt', label: 'Area Affected', align: 'right' },
    { key: 'status_cell', label: 'Status' },
    { key: 'logged_fmt', label: 'Date Logged' },
  ]

  return (
    <PageLayout
      title="Crop Disaster"
      action={(
        <Button variant="outline" onClick={() => setHistoryOpen(true)}>
          <History size={15} className="mr-1.5" /> Disaster history
        </Button>
      )}
    >
      <div className="space-y-4">
        {noCrops && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800" data-testid="disaster-blocked">
            You can only log a disaster on a crop you have on record. Your crops appear here once the office registers them.
          </p>
        )}
        {error && <ErrorMessage message={error} />}
        {/* The page IS the Log Disaster form (the existing two steps, shown on the page): tick the affected crops, then fill the
            one disaster form for all of them (one report is saved for each crop). After saving it starts again from the crops. */}
        {!error && !noCrops && (loggingOn || linkedCrop ? (
          <MultiCropDisasterModal inline crops={loggingOn || [linkedCrop]}
            onBack={() => { endLink(); setLoggingOn(null) }}
            onClose={() => { endLink(); setLoggingOn(null) }} onSuccess={reload} />
        ) : (
          <ChooseCropsModal inline subtitle="Step 1 of 2: choose the affected crops" crops={isLoading ? null : cropChoices}
            onContinue={(chosen) => setLoggingOn(chosen)} />
        ))}
      </div>

      {historyOpen && (
        <DisasterHistoryModal
          subtitle="Every disaster you have logged on your crops"
          columns={historyColumns} rows={data} isLoading={isLoading} error={error}
          actionsFor={(r) => r.actions_cell}
          onView={(id) => setViewingId(id)}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {viewingId && <DisasterLogDetailsModal key={viewingId} kind="farmer" logId={viewingId} onClose={() => setViewingId(null)} />}
      {recovering && <MarkRecoveredModal row={recovering} onClose={() => setRecovering(null)} onDone={() => { setRecovering(null); reload() }} />}
    </PageLayout>
  )
}
