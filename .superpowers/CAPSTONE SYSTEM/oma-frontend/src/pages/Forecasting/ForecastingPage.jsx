import { useCallback, useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const STATUS_TONES = { Active: 'green', Harvested: 'blue', Damaged: 'rose', Abandoned: 'slate' }
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

const COLUMNS = [
  { key: 'farmer_name',        label: 'Farmer' },
  { key: 'farmer_barangay',    label: 'Barangay' },
  { key: 'crop_type_name',     label: 'Crop' },
  { key: 'date_planted_fmt',   label: 'Date Planted' },
  { key: 'harvest_date_cell',  label: 'Expected Harvest' },
  { key: 'area_planted_ha',    label: 'Area (ha)' },
  { key: 'yield_cell',         label: 'Est. Yield (kg)' },
  { key: 'status_pill',        label: 'Status' },
  { key: 'actions',            label: '' },
]

const labelCls = 'text-[10px] font-medium uppercase tracking-wide text-slate-400'

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v))
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function ForecastDetailModal({ record, onClose, onUpdated }) {
  const { showToast } = useToast()
  const [remarks, setRemarks]               = useState(record.notes || '')
  const [isSavingRemarks, setIsSavingRemarks] = useState(false)

  const remarksChanged = remarks !== (record.notes || '')

  const handleSaveRemarks = async () => {
    setIsSavingRemarks(true)
    try {
      await api.patch(`/production/monitoring/${record.id}/`, { notes: remarks })
      showToast('Remarks saved.', 'success')
      onUpdated?.()
    } catch {
      showToast('Failed to save remarks.', 'error')
    } finally {
      setIsSavingRemarks(false)
    }
  }

  const estimatedYield = record.estimated_yield_kg
    ? `${Number(record.estimated_yield_kg).toLocaleString()} kg`
    : '—'
  const actualYield = record.actual_yield_kg
    ? `${Number(record.actual_yield_kg).toLocaleString()} kg`
    : null

  return (
    <ModalShell title="Forecast Details" onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-4">
        {/* Two panels side by side */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Basic Info */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Basic Info</p>
            <dl className="space-y-2.5">
              {[
                ['Crop',             record.crop_type_name],
                ['Season / Year',    record.season ? `${record.season} ${record.year}` : `${record.year || '—'}`],
                ['Date Planted',     formatDate(record.date_planted)],
                ['Expected Harvest', formatDate(record.expected_harvest_date)],
                ['Actual Harvest',   formatDate(record.actual_harvest_date)],
                ['Area Planted',     record.area_planted_ha ? `${record.area_planted_ha} ha` : '—'],
              ].map(([lbl, val]) => (
                <div key={lbl}>
                  <dt className={labelCls}>{lbl}</dt>
                  <dd className="text-sm font-semibold text-slate-800">{val || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Farmer & Location */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Farmer & Location</p>
            <dl className="space-y-2.5">
              {[
                ['Farmer',   record.farmer_name],
                ['Barangay', record.farmer_barangay],
                ['Status',   record.status],
              ].map(([lbl, val]) => (
                <div key={lbl}>
                  <dt className={labelCls}>{lbl}</dt>
                  <dd className="text-sm font-semibold text-slate-800">{val || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Yield highlight */}
        <div className="rounded-xl border border-[#c8e6c9] bg-[#f1f8f2] px-4 py-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#2D6A31]">Estimated Yield</p>
          <p className="text-2xl font-bold text-[#1E4620]">{estimatedYield}</p>
          {actualYield && (
            <p className="mt-1 text-sm text-slate-600">
              Actual: <span className="font-semibold">{actualYield}</span>
            </p>
          )}
          {record.yield_variance_pct != null && (
            <p className="mt-0.5 text-sm">
              Variance:{' '}
              <span
                className="font-semibold"
                style={{ color: parseFloat(record.yield_variance_pct) >= 0 ? '#4CAF50' : '#D32F2F' }}
              >
                {parseFloat(record.yield_variance_pct).toFixed(1)}%
              </span>
            </p>
          )}
        </div>

        {/* Editable Remarks */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Remarks
          </label>
          <textarea
            className={baseInputClasses}
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Add remarks or observations..."
          />
          {remarksChanged && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={handleSaveRemarks} isLoading={isSavingRemarks}>
                Save Remarks
              </Button>
            </div>
          )}
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ForecastingPage() {
  const [records, setRecords]           = useState([])
  const [isLoading, setIsLoading]       = useState(true)
  const [error, setError]               = useState('')
  const [yearFilter, setYearFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [detailRecord, setDetailRecord] = useState(null)

  const fetchRecords = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (yearFilter) params.set('year', yearFilter)
      if (statusFilter !== 'All') params.set('status', statusFilter)
      const r = await api.get(`/production/monitoring/?${params}`)
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load forecast records.')
    } finally {
      setIsLoading(false)
    }
  }, [yearFilter, statusFilter])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const rows = records.map((rec) => ({
    ...rec,
    date_planted_fmt: formatDate(rec.date_planted),
    harvest_date_cell: rec.expected_harvest_date ? (
      <span className={rec.is_near_harvest ? 'font-semibold text-amber-600' : ''}>
        {formatDate(rec.expected_harvest_date)}
        {rec.is_near_harvest && ' ⚠'}
      </span>
    ) : '—',
    yield_cell: rec.estimated_yield_kg ? (
      <span className="font-bold text-[#4CAF50]">
        {Number(rec.estimated_yield_kg).toLocaleString()} kg
      </span>
    ) : '—',
    status_pill: <StatusPill tone={STATUS_TONES[rec.status] || 'slate'}>{rec.status}</StatusPill>,
    actions: (
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#1E4620] hover:bg-[#f0f7f0]"
        onClick={() => setDetailRecord(rec)}
      >
        View
      </button>
    ),
  }))

  return (
    <PageLayout title="Forecasting" subtitle="Crop yield forecasts and harvest projections">
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Year</label>
            <select
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            >
              <option value="">All Years</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Status</label>
            <select
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {['All', 'Active', 'Harvested', 'Damaged', 'Abandoned'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <p className="ml-auto self-end text-sm text-slate-500">
            {records.length} record{records.length !== 1 ? 's' : ''}
          </p>
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
    </PageLayout>
  )
}
