import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, MessageCircle, Plus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import AddCropMonitoringModal from '../Monitoring/AddCropMonitoringModal.jsx'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtShort(v) {
  if (!v) return '—'
  const d = new Date(v + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

function fmtLong(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

function getDisplayStatus(rec) {
  if (rec.status !== 'Active') return rec.status
  if (rec.expected_harvest_date) {
    const today   = new Date()
    const harvest = new Date(rec.expected_harvest_date + 'T00:00:00')
    const daysLeft = Math.ceil((harvest - today) / (1000 * 60 * 60 * 24))
    if (daysLeft <= 14) return 'For Harvest'
  }
  return 'Planted'
}

const STATUS_TONES = {
  Planted:       'green',
  'For Harvest': 'amber',
  Harvested:     'blue',
  Damaged:       'rose',
  Abandoned:     'slate',
}

const COLUMNS = [
  { key: 'crop_type_name',        label: 'CROP' },
  { key: 'area_ha_fmt',           label: 'AREA PLANTED (HA)' },
  { key: 'date_planted_fmt',      label: 'DATE PLANTED' },
  { key: 'expected_harvest_fmt',  label: 'ESTIMATED HARVEST DATE' },
  { key: 'est_yield_fmt',         label: 'ESTIMATED YIELD (KG)' },
  { key: 'assoc_name',            label: 'ASSOCIATION' },
  { key: 'status_cell',           label: 'STATUS' },
  { key: 'remarks_cell',          label: 'REMARKS' },
]

const STATUS_FILTER_OPTIONS = ['All Status', 'Planted', 'For Harvest', 'Harvested', 'Damaged', 'Abandoned']

// ─── Add Remark Modal ─────────────────────────────────────────────────────────

function AddRemarkModal({ record, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [customStatus, setCustomStatus] = useState('')
  const [content,      setContent]      = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [error,        setError]        = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!content.trim()) { setError('Remark content is required.'); return }
    setError('')
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      await api.post(`/production/monitoring/${record.id}/remarks/`, {
        custom_status: customStatus.trim(),
        content:       content.trim(),
      })
      showToast('Remark added.', 'success')
      onSuccess()
    } catch {
      showToast('Failed to save remark.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <ModalShell title="Add Remark" onClose={onClose} maxWidth="max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Custom Status">
            <input className={baseInputClasses}
              placeholder="e.g. FOR MONITORING, GOOD CONDITION"
              value={customStatus}
              onChange={e => setCustomStatus(e.target.value.toUpperCase())} />
          </FormField>
          <FormField label="Remark Content" required>
            <textarea className={baseInputClasses} rows={4}
              placeholder="ENTER REMARK CONTENT..."
              value={content}
              onChange={e => setContent(e.target.value.toUpperCase())} />
          </FormField>
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || !content.trim()}
              className="flex items-center gap-2 rounded-xl bg-[#1E4620] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2D6A31] disabled:opacity-60 transition-colors">
              {isSubmitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Save Remark
            </button>
          </div>
        </form>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Add Remark"
          message="Are you sure you want to save this remark?"
          confirmLabel="Yes, Save Remark"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

// ─── Remarks Modal (two-panel) ────────────────────────────────────────────────

function RemarksModal({ record, onClose }) {
  const { showToast } = useToast()
  const [remarks,      setRemarks]      = useState([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  const fetchRemarks = useCallback(async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/production/monitoring/${record.id}/remarks/`)
      setRemarks(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      showToast('Failed to load remarks.', 'error')
    } finally { setIsLoading(false) }
  }, [record.id])

  useEffect(() => { fetchRemarks() }, [fetchRemarks])

  const handleDelete = async (id) => {
    try {
      await api.delete(`/production/remarks/${id}/`)
      showToast('Remark deleted.', 'success')
      fetchRemarks()
    } catch {
      showToast('Failed to delete remark.', 'error')
    }
  }

  const displayStatus = getDisplayStatus(record)

  return (
    <>
      <ModalShell
        title={`Crop Remarks — ${record.crop_type_name}`}
        onClose={onClose}
        maxWidth="max-w-4xl"
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* LEFT: Crop Details */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <p className="mb-4 text-sm font-semibold text-[#1E4620]">✦ Crop Details</p>
            <div className="space-y-3">
              {[
                { label: 'Crop Type',          value: record.crop_type_name },
                { label: 'Farmer Association', value: record.association_name || '—' },
                { label: 'Area Planted (ha)',  value: record.area_planted_ha ? Number(record.area_planted_ha).toFixed(2) : '—' },
                { label: 'Date Planted',       value: fmtLong(record.date_planted) },
                { label: 'Est. Harvest Date',  value: fmtLong(record.expected_harvest_date) },
                { label: 'Status',             value: displayStatus },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4">
                  <span className="whitespace-nowrap text-xs font-medium text-slate-500">{label}</span>
                  <span className="text-right text-xs font-semibold text-slate-800">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Remarks History */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Remarks History</p>
              <button type="button"
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1 rounded-xl bg-[#1E4620] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2D6A31] transition-colors">
                <Plus size={12} /> Add Remark
              </button>
            </div>

            {isLoading ? (
              <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
            ) : remarks.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                <MessageCircle size={32} className="opacity-40" />
                <p className="text-sm">No remarks yet for this crop record.</p>
              </div>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {remarks.map(r => (
                  <li key={r.id}
                    className="rounded-r-xl border border-slate-100 bg-white px-4 py-3"
                    style={{ borderLeft: '3px solid #4CAF50' }}>
                    {r.custom_status && (
                      <span className="mb-1.5 inline-block rounded-full bg-[#e8f5e9] px-2.5 py-0.5 text-[11px] font-semibold text-[#1E4620]">
                        {r.custom_status}
                      </span>
                    )}
                    <p className="text-sm font-medium text-slate-800">{r.content}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <p className="text-xs text-slate-400">
                        {r.created_by_name || 'System'} · {r.date_created ? fmtLong(r.date_created.slice(0, 10)) : '—'}
                      </p>
                      <button type="button" onClick={() => handleDelete(r.id)}
                        className="text-xs font-medium text-rose-500 hover:underline">
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ModalShell>

      {showAddModal && (
        <AddRemarkModal
          record={record}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); fetchRemarks() }}
        />
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CropInformationPage() {
  const [records,      setRecords]      = useState([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState('')
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [remarksRec,   setRemarksRec]   = useState(null)
  const [showAdd,      setShowAdd]      = useState(false)

  const fetchRecords = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get('/production/monitoring/')
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load crop records.')
    } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(rec => {
      const matchSearch = !q
        || rec.crop_type_name?.toLowerCase().includes(q)
        || rec.association_name?.toLowerCase().includes(q)
      const displayStatus = getDisplayStatus(rec)
      const matchStatus = statusFilter === 'All Status' || displayStatus === statusFilter
      return matchSearch && matchStatus
    })
  }, [records, search, statusFilter])

  const rows = filtered.map(rec => {
    const displayStatus = getDisplayStatus(rec)
    return {
      ...rec,
      area_ha_fmt:          rec.area_planted_ha ? Number(rec.area_planted_ha).toFixed(2) : '—',
      date_planted_fmt:     fmtShort(rec.date_planted),
      expected_harvest_fmt: fmtShort(rec.expected_harvest_date),
      est_yield_fmt: rec.status === 'Harvested' && rec.actual_yield_kg
        ? (
          <span className="flex items-center gap-1.5">
            <span>{Number(rec.actual_yield_kg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">Harvested</span>
          </span>
        )
        : rec.estimated_yield_kg
        ? Number(rec.estimated_yield_kg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—',
      assoc_name:  rec.association_name || '—',
      status_cell: <StatusPill tone={STATUS_TONES[displayStatus] || 'slate'}>{displayStatus}</StatusPill>,
      remarks_cell: (
        <button type="button"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[#1E4620] hover:bg-[#f0f7f0] transition-colors"
          onClick={e => { e.stopPropagation(); setRemarksRec(rec) }}
          title="View/Add Remarks">
          <FileText size={14} />
        </button>
      ),
    }
  })

  return (
    <PageLayout title="Crop Information Management" subtitle="Monitor and manage crop records and activities.">
      <div className="space-y-4">
        {/* Top row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm placeholder-slate-400 focus:border-[#1E4620] focus:outline-none"
            placeholder="Search by crop, association..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-[#1E4620] focus:outline-none"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTER_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button"
            className="whitespace-nowrap rounded-xl bg-[#1E4620] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2D6A31]"
            onClick={() => setShowAdd(true)}>
            + Add Crop
          </button>
        </div>

        {error && <ErrorMessage message={error} />}

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1E4620] text-white">
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={COLUMNS.length} className="py-10 text-center text-sm text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className="py-10 text-center text-sm text-slate-400">No crop records found.</td></tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                    {COLUMNS.map(col => (
                      <td key={col.key} className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">
                        {row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <AddCropMonitoringModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); fetchRecords() }}
        />
      )}

      {remarksRec && (
        <RemarksModal
          record={remarksRec}
          onClose={() => setRemarksRec(null)}
        />
      )}
    </PageLayout>
  )
}
