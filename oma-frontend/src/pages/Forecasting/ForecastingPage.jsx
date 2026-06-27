import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, BarChart2, Download, FileText, TrendingUp, Upload, User } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'

const COLUMNS = [
  { key: 'crop_type_name',    label: 'CROP' },
  { key: 'area_planted_ha',   label: 'AREA PLANTED (HA)' },
  { key: 'yield_cell',        label: 'ESTIMATED HARVEST YIELD (KG)' },
  { key: 'harvest_date_cell', label: 'ESTIMATED HARVEST DATE' },
  { key: 'actions',           label: 'DETAILS' },
]

const labelCls = 'text-[10px] font-medium uppercase tracking-wide text-slate-400'

function fmtMDY(v) {
  if (!v) return '—'
  const d = new Date(v + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function ForecastDetailModal({ record, onClose, onUpdated }) {
  const { showToast } = useToast()
  const originalNotes = record.notes || ''
  const [notes,    setNotes]    = useState(originalNotes)
  const [isSaving, setIsSaving] = useState(false)
  const hasChanges = notes !== originalNotes

  const handleSaveRemarks = async () => {
    setIsSaving(true)
    try {
      await api.patch(`/production/monitoring/${record.id}/`, { notes })
      showToast('Remarks saved.', 'success')
      onUpdated?.()
    } catch {
      showToast('Failed to save remarks.', 'error')
    } finally { setIsSaving(false) }
  }

  return (
    <ModalShell
      title={`${record.crop_type_name ?? '—'} Forecast Details`}
      subtitle={`${record.association_name || '—'} — Planted: ${record.date_planted || '—'}`}
      icon={TrendingUp}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {/* Two panels side by side */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="mb-3 text-xs font-semibold text-slate-500 flex items-center gap-1"><BarChart2 size={12} />Basic Information</p>
            <dl className="space-y-2.5">
              <div>
                <dt className={labelCls}>Area Planted</dt>
                <dd className="text-sm font-semibold text-slate-800">
                  {record.area_planted_ha ? `${record.area_planted_ha} ha` : '—'}
                </dd>
              </div>
              <div>
                <dt className={labelCls}>Estimated Harvest</dt>
                <dd className="text-sm font-semibold text-slate-800">
                  {fmtMDY(record.expected_harvest_date)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="mb-3 text-xs font-semibold text-slate-500 flex items-center gap-1"><User size={12} />Farmer & Location</p>
            <dl className="space-y-2.5">
              <div>
                <dt className={labelCls}>Association</dt>
                <dd className="text-sm font-semibold text-slate-800">{record.association_name || '—'}</dd>
              </div>
              <div>
                <dt className={labelCls}>Barangay</dt>
                <dd className="text-sm font-semibold text-slate-800">{record.farmer_barangay || '—'}</dd>
              </div>
            </dl>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Remarks & Notes */}
        <div>
          <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-600"><FileText size={12} />Remarks & Notes</label>
          <textarea
            rows={4}
            className={baseInputClasses}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add remarks or observations..."
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleSaveRemarks}
              disabled={isSaving || !hasChanges}
              className="rounded-xl bg-[#1E4620] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2D6A31] disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save Remarks'}
            </button>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Import Errors Modal ────────────────────────────────────────────────────────

function ImportErrorsModal({ errors, created, onClose }) {
  return (
    <ModalShell
      title="Import Results"
      subtitle={`${created} record${created !== 1 ? 's' : ''} created`}
      icon={AlertTriangle}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      {errors.length === 0 ? (
        <p className="text-sm text-[#1E4620] font-medium py-2">All rows imported successfully.</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          <p className="text-xs text-slate-500 mb-2">{errors.length} row{errors.length !== 1 ? 's' : ''} had errors:</p>
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
              <span className="text-xs font-semibold text-rose-600 shrink-0">Row {e.row}</span>
              <span className="text-xs text-rose-700">{e.error}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end pt-4 border-t border-slate-100 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-[#1E4620] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2D6A31]"
        >
          Close
        </button>
      </div>
    </ModalShell>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ForecastingPage() {
  const [records,       setRecords]       = useState([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState('')
  const [search,        setSearch]        = useState('')
  const [detailRecord,  setDetailRecord]  = useState(null)
  const [isImporting,   setIsImporting]   = useState(false)
  const [importResults, setImportResults] = useState(null)
  const fileInputRef = useRef(null)
  const { showToast } = useToast()

  const fetchRecords = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get('/production/monitoring/')
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load forecast records.')
    } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const handleDownloadTemplate = async () => {
    try {
      await downloadFile(api, '/production/forecasting/template/', 'forecasting_template.xlsx')
    } catch {
      showToast('Failed to download template.', 'error')
    }
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setIsImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const r = await api.post('/production/forecasting/import/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImportResults(r.data)
      if (r.data.created > 0) fetchRecords()
    } catch (err) {
      showToast(err?.response?.data?.error || 'Import failed.', 'error')
    } finally {
      setIsImporting(false)
    }
  }

  const q = search.toLowerCase()
  const filtered = records.filter(rec =>
    !q
    || rec.crop_type_name?.toLowerCase().includes(q)
    || rec.association_name?.toLowerCase().includes(q)
  )

  const rows = filtered.map(rec => ({
    ...rec,
    harvest_date_cell: fmtMDY(rec.expected_harvest_date),
    yield_cell: rec.estimated_yield_kg
      ? <span className="font-bold text-[#4CAF50]">{Number(rec.estimated_yield_kg).toLocaleString()} kg</span>
      : '—',
    actions: (
      <button
        type="button"
        className="text-sm text-[#1E4620] hover:underline"
        onClick={() => setDetailRecord(rec)}
      >
        View
      </button>
    ),
  }))

  return (
    <PageLayout
      title="Crop Forecasting"
      subtitle="Forecasts are now based on real monitoring activities. Import crop data, then add monitoring activities to improve yield predictions."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="min-w-[220px] flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm placeholder-slate-400 focus:border-[#1E4620] focus:outline-none"
            placeholder="Search by crop or association..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="ml-auto flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              type="button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {isImporting
                ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                : <Upload className="h-3.5 w-3.5" />
              }
              {isImporting ? 'Importing…' : 'Import Excel'}
            </button>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Download Template
            </button>
          </div>
        </div>

        {error && <ErrorMessage message={error} />}

        <DataTable columns={COLUMNS} data={rows} isLoading={isLoading} />
      </div>

      {detailRecord && (
        <ForecastDetailModal
          record={detailRecord}
          onClose={() => setDetailRecord(null)}
          onUpdated={fetchRecords}
        />
      )}

      {importResults && (
        <ImportErrorsModal
          created={importResults.created}
          errors={importResults.errors}
          onClose={() => setImportResults(null)}
        />
      )}
    </PageLayout>
  )
}
