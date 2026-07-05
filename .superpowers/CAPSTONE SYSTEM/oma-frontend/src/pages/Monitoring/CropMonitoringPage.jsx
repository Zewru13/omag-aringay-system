import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import AddCropMonitoringModal from './AddCropMonitoringModal.jsx'

const STATUS_OPTIONS = ['All Status', 'Active', 'Harvested', 'Damaged', 'Abandoned']

const COLUMNS = [
  { key: 'crop_type_name', label: 'Crop' },
  { key: 'farmer_name',    label: 'Farmer' },
  { key: 'date_planted',   label: 'Date Planted' },
  { key: 'log_count_cell', label: 'Logs' },
  { key: 'actions',        label: '' },
]

const CONDITION_COLORS = { Good: '#4CAF50', Fair: '#FFB300', Poor: '#D32F2F' }

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v))
}

// ── View Logs Modal ───────────────────────────────────────────────────────────

function ViewLogsModal({ record, onClose, onLogAdded }) {
  const { showToast } = useToast()

  // Activity logs
  const [logs, setLogs]                 = useState([])
  const [isLoading, setIsLoading]       = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [form, setForm] = useState({
    activity_type: '',
    activity_date: new Date().toISOString().slice(0, 10),
    plant_condition: '',
    status_at_log: '',
    notes: '',
  })

  // Labor logs
  const [laborLogs, setLaborLogs]               = useState([])
  const [isLoadingLabor, setIsLoadingLabor]     = useState(true)
  const [isSubmittingLabor, setIsSubmittingLabor] = useState(false)
  const [showLaborForm, setShowLaborForm]       = useState(false)
  const [laborForm, setLaborForm] = useState({
    activity: '',
    date: new Date().toISOString().slice(0, 10),
    cost_php: '',
    notes: '',
  })

  const set      = (f, v) => setForm((p) => ({ ...p, [f]: v }))
  const setLabor = (f, v) => setLaborForm((p) => ({ ...p, [f]: v }))

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/production/monitoring/${record.id}/logs/`)
      setLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      showToast('Failed to load activity logs.', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [record.id])

  const fetchLaborLogs = useCallback(async () => {
    setIsLoadingLabor(true)
    try {
      const r = await api.get(`/production/monitoring/${record.id}/labor/`)
      setLaborLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      showToast('Failed to load labor logs.', 'error')
    } finally {
      setIsLoadingLabor(false)
    }
  }, [record.id])

  useEffect(() => { fetchLogs(); fetchLaborLogs() }, [fetchLogs, fetchLaborLogs])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.activity_type) { showToast('Activity type is required.', 'error'); return }
    if (!form.activity_date) { showToast('Activity date is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.post(`/production/monitoring/${record.id}/logs/`, form)
      showToast('Activity log added.', 'success')
      setForm({ activity_type: '', activity_date: new Date().toISOString().slice(0, 10), plant_condition: '', status_at_log: '', notes: '' })
      setShowForm(false)
      await fetchLogs()
      onLogAdded()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to save log.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLaborSubmit = async (e) => {
    e.preventDefault()
    if (!laborForm.activity) { showToast('Activity is required.', 'error'); return }
    if (!laborForm.date)     { showToast('Date is required.', 'error'); return }
    setIsSubmittingLabor(true)
    try {
      await api.post(`/production/monitoring/${record.id}/labor/`, laborForm)
      showToast('Labor operation logged.', 'success')
      setLaborForm({ activity: '', date: new Date().toISOString().slice(0, 10), cost_php: '', notes: '' })
      setShowLaborForm(false)
      await fetchLaborLogs()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to save labor log.', 'error')
    } finally {
      setIsSubmittingLabor(false)
    }
  }

  const handleLaborDelete = async (id) => {
    try {
      await api.delete(`/production/monitoring/labor/${id}/`)
      setLaborLogs((prev) => prev.filter((l) => l.id !== id))
    } catch {
      showToast('Failed to delete labor log.', 'error')
    }
  }

  const totalCost = laborLogs.reduce((sum, l) => sum + (parseFloat(l.cost_php) || 0), 0)

  return (
    <ModalShell
      title={`Activity Logs — ${record.crop_type_name}`}
      subtitle={`Farmer: ${record.farmer_name}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {/* ── Activity Logs ── */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#4CAF50]" />
          <p className="text-sm font-semibold text-slate-800">Activity Logs</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="text-xs font-semibold text-[#1E4620] hover:underline"
        >
          {showForm ? '— Cancel' : '+ Add New Log'}
        </button>
      </div>

      {showForm && (
        <div className="mb-5 rounded-xl border border-[#c8e6c9] bg-[#f9fdf9] p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Activity Type" required>
                <select
                  className={baseInputClasses}
                  value={form.activity_type}
                  onChange={(e) => set('activity_type', e.target.value)}
                >
                  <option value="">— Select Activity —</option>
                  <option value="Land Preparation">Land Preparation</option>
                  <option value="Planting">Planting</option>
                  <option value="Vegetative Stage Check">Vegetative Stage Check</option>
                  <option value="Flowering Stage Check">Flowering Stage Check</option>
                  <option value="Fruiting Stage Check">Fruiting Stage Check</option>
                  <option value="Maturity Check">Maturity Check</option>
                  <option value="Fertilizer Application">Fertilizer Application</option>
                  <option value="Irrigation">Irrigation</option>
                  <option value="Weeding">Weeding</option>
                  <option value="Pest Control">Pest Control</option>
                  <option value="Harvesting">Harvesting</option>
                  <option value="Problem Observed">Problem Observed</option>
                  <option value="Other">Other</option>
                </select>
              </FormField>
              <FormField label="Activity Date" required>
                <input
                  type="date"
                  className={baseInputClasses}
                  value={form.activity_date}
                  onChange={(e) => set('activity_date', e.target.value)}
                />
              </FormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Plant Condition">
                <select className={baseInputClasses} value={form.plant_condition} onChange={(e) => set('plant_condition', e.target.value)}>
                  <option value="">— Select —</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Poor">Poor</option>
                </select>
              </FormField>
              <FormField label="Crop Stage at Log">
                <select className={baseInputClasses} value={form.status_at_log} onChange={(e) => set('status_at_log', e.target.value)}>
                  <option value="">— Select Stage —</option>
                  <option value="Vegetative">Vegetative</option>
                  <option value="Flowering">Flowering</option>
                  <option value="Fruiting">Fruiting</option>
                  <option value="Maturity">Maturity</option>
                  <option value="Problem Observed">Problem Observed</option>
                </select>
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea
                className={baseInputClasses}
                rows={2}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Optional notes..."
              />
            </FormField>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-[#1E4620] py-2.5 text-sm font-semibold text-white transition hover:bg-[#2D6A31] disabled:opacity-60"
            >
              {isSubmitting ? 'Saving…' : 'Add Log'}
            </button>
          </form>
        </div>
      )}

      {isLoading ? (
        <p className="py-6 text-center text-sm text-slate-400">Loading logs…</p>
      ) : logs.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No activity logs yet. Click "+ Add New Log" to start.</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li
              key={log.id}
              className="flex gap-3 rounded-r-lg border border-slate-100 bg-white px-4 py-3"
              style={{ borderLeft: '3px solid #4CAF50' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{log.activity_type}</span>
                  {log.plant_condition && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                      style={{ background: CONDITION_COLORS[log.plant_condition] || '#757575' }}
                    >
                      {log.plant_condition}
                    </span>
                  )}
                  {log.status_at_log && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {log.status_at_log}
                    </span>
                  )}
                </div>
                {log.notes && <p className="mt-0.5 text-xs text-slate-500">{log.notes}</p>}
              </div>
              <span className="shrink-0 text-xs text-slate-400">{formatDate(log.activity_date)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ── Labor and Farm Operations ── */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#1E4620]" />
            <p className="text-sm font-semibold text-slate-800">Labor and Farm Operations</p>
            {totalCost > 0 && (
              <span className="text-xs font-medium text-slate-500">
                — Total Cost: ₱{totalCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowLaborForm((v) => !v)}
            className="text-xs font-semibold text-[#1E4620] hover:underline"
          >
            {showLaborForm ? '— Cancel' : '+ Log Operation'}
          </button>
        </div>

        {showLaborForm && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <form onSubmit={handleLaborSubmit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Activity" required>
                  <select
                    className={baseInputClasses}
                    value={laborForm.activity}
                    onChange={(e) => setLabor('activity', e.target.value)}
                  >
                    <option value="">— Select Activity —</option>
                    <option value="Land Preparation">Land Preparation</option>
                    <option value="Planting">Planting</option>
                    <option value="Weeding">Weeding</option>
                    <option value="Fertilizer Application">Fertilizer Application</option>
                    <option value="Pest Control">Pest Control</option>
                    <option value="Harvesting">Harvesting</option>
                    <option value="Other">Other</option>
                  </select>
                </FormField>
                <FormField label="Date" required>
                  <input
                    type="date"
                    className={baseInputClasses}
                    value={laborForm.date}
                    onChange={(e) => setLabor('date', e.target.value)}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Cost (PHP)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={baseInputClasses}
                    placeholder="0.00"
                    value={laborForm.cost_php}
                    onChange={(e) => setLabor('cost_php', e.target.value)}
                  />
                </FormField>
                <FormField label="Notes">
                  <input
                    type="text"
                    className={baseInputClasses}
                    placeholder="Optional notes..."
                    value={laborForm.notes}
                    onChange={(e) => setLabor('notes', e.target.value)}
                  />
                </FormField>
              </div>
              <button
                type="submit"
                disabled={isSubmittingLabor}
                className="w-full rounded-xl bg-[#1E4620] py-2.5 text-sm font-semibold text-white transition hover:bg-[#2D6A31] disabled:opacity-60"
              >
                {isSubmittingLabor ? 'Saving…' : 'Save Operation'}
              </button>
            </form>
          </div>
        )}

        {isLoadingLabor ? (
          <p className="py-4 text-center text-sm text-slate-400">Loading labor logs…</p>
        ) : laborLogs.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No labor operations logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-2 text-left text-xs font-semibold text-slate-500">Activity</th>
                  <th className="pb-2 text-left text-xs font-semibold text-slate-500">Date</th>
                  <th className="pb-2 text-right text-xs font-semibold text-slate-500">Cost (PHP)</th>
                  <th className="pb-2 text-left text-xs font-semibold text-slate-500">Notes</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {laborLogs.map((l) => (
                  <tr key={l.id} className="border-b border-slate-50">
                    <td className="py-2 font-medium text-slate-800">{l.activity}</td>
                    <td className="py-2 text-slate-500">{formatDate(l.date)}</td>
                    <td className="py-2 text-right text-slate-700">
                      {l.cost_php ? `₱${parseFloat(l.cost_php).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="py-2 text-slate-500">{l.notes || '—'}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleLaborDelete(l.id)}
                        className="text-xs font-medium text-rose-500 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CropMonitoringPage() {
  const [records, setRecords]               = useState([])
  const [isLoading, setIsLoading]           = useState(true)
  const [error, setError]                   = useState('')
  const [search, setSearch]                 = useState('')
  const [statusFilter, setStatusFilter]     = useState('All Status')
  const [showAdd, setShowAdd]               = useState(false)
  const [viewLogsRecord, setViewLogsRecord] = useState(null)

  const fetchRecords = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get('/production/monitoring/')
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load crop monitoring records.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter((rec) => {
      const matchSearch = !q
        || rec.crop_type_name?.toLowerCase().includes(q)
        || rec.farmer_name?.toLowerCase().includes(q)
      const matchStatus = statusFilter === 'All Status' || rec.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [records, search, statusFilter])

  const rows = filtered.map((rec) => ({
    ...rec,
    date_planted: formatDate(rec.date_planted),
    log_count_cell: (
      <span className="block text-center text-sm font-semibold text-slate-700">
        {rec.log_count ?? 0}
      </span>
    ),
    actions: (
      <button
        type="button"
        className="rounded-lg bg-[#1E4620] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2D6A31]"
        onClick={() => setViewLogsRecord(rec)}
      >
        View Logs
      </button>
    ),
  }))

  return (
    <PageLayout title="Crop Monitoring" subtitle="Track crop activity logs and field observations">
      <div className="space-y-4">
        {/* Search + filter + action row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm placeholder-slate-400 focus:border-[#1E4620] focus:outline-none"
            placeholder="Search by crop or farmer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-[#1E4620] focus:outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button onClick={() => setShowAdd(true)} size="sm">
            <Plus size={15} className="mr-1" />
            Start Monitoring
          </Button>
        </div>

        {error && <ErrorMessage message={error} />}

        <DataTable columns={COLUMNS} data={rows} isLoading={isLoading} />
      </div>

      {showAdd && (
        <AddCropMonitoringModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); fetchRecords() }}
        />
      )}

      {viewLogsRecord && (
        <ViewLogsModal
          record={viewLogsRecord}
          onClose={() => setViewLogsRecord(null)}
          onLogAdded={fetchRecords}
        />
      )}
    </PageLayout>
  )
}
