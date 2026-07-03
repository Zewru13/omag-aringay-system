import { useEffect, useState } from 'react'
import { Plus, Sprout, Trash2, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const labelCls = 'block text-xs font-medium text-slate-600'
const STATUS_TONES = { Active: 'green', Harvested: 'blue', Damaged: 'rose', Abandoned: 'slate' }


const PRIORITY_PILL = {
  HIGH:   'bg-rose-100 text-rose-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW:    'bg-green-100 text-[#1B4D2E]',
}

const STATUS_LABEL = {
  due_now:  { label: 'Due Now',  cls: 'bg-amber-500 text-white' },
  overdue:  { label: 'Overdue',  cls: 'bg-rose-500 text-white' },
  upcoming: { label: 'Upcoming', cls: 'bg-[#EBF5EE] text-[#1B4D2E]' },
  done:     { label: 'Done',     cls: 'bg-slate-100 text-slate-500 line-through' },
}

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v))
}

function CropMonitoringDetailModal({ record, onClose, onRefresh }) {
  const { showToast } = useToast()
  const [logs,            setLogs]            = useState([])
  const [isLoading,       setIsLoading]       = useState(true)
  const [showForm,        setShowForm]        = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions,       setSuggestions]       = useState([])
  const [disasterResponse,  setDisasterResponse]  = useState([])
  const [suggestLoading,    setSuggestLoading]    = useState(false)
  const [daysElapsed,       setDaysElapsed]       = useState(null)
  const [form, setForm] = useState({ activity_type: '', activity_date: '', plant_condition: '', notes: '' })
  const [isSaving, setIsSaving] = useState(false)

  const fetchLogs = async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/production/monitoring/${record.id}/logs/`)
      setLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setLogs([]) } finally { setIsLoading(false) }
  }

  const fetchSuggestions = async () => {
    setSuggestLoading(true)
    try {
      const r = await api.get(`/production/monitoring/${record.id}/suggestions/`)
      setSuggestions(r.data.suggestions || [])
      setDisasterResponse(r.data.disaster_response || [])
      setDaysElapsed(r.data.days_elapsed ?? null)
    } catch { setSuggestions([]) }
    finally { setSuggestLoading(false) }
  }

  useEffect(() => { fetchLogs() }, [record.id])

  const handleAddLog = async (e) => {
    e.preventDefault()
    if (!form.activity_type || !form.activity_date) {
      showToast('Activity type and date are required.', 'error')
      return
    }
    setIsSaving(true)
    try {
      await api.post(`/production/monitoring/${record.id}/logs/`, form)
      showToast('Log added.', 'success')
      setShowForm(false)
      setForm({ activity_type: '', activity_date: '', plant_condition: '', notes: '' })
      fetchLogs()
    } catch { showToast('Failed to add log.', 'error') }
    finally { setIsSaving(false) }
  }

  const handleDeleteLog = async (id) => {
    try {
      await api.delete(`/production/monitoring/logs/${id}/`)
      showToast('Log deleted.', 'success')
      fetchLogs()
    } catch { showToast('Failed to delete.', 'error') }
  }

  const applySuggestion = (activityName) => {
    setForm(f => ({ ...f, activity_type: activityName }))
    setShowForm(true)
    setShowSuggestions(false)
  }

  const handleToggleSuggestions = () => {
    const next = !showSuggestions
    setShowSuggestions(next)
    setShowForm(false)
    if (next && suggestions.length === 0 && !suggestLoading) fetchSuggestions()
  }

  const modalSubtitle = record.farmer_name
    ? (record.date_planted
        ? `${record.farmer_name} — Planted: ${formatDate(record.date_planted)}`
        : `${record.farmer_name} — ${record.season} ${record.year}`)
    : (record.date_planted
        ? `Planted: ${formatDate(record.date_planted)}`
        : `${record.season} ${record.year}`)

  const conditionColor = { Good: 'text-[#1B4D2E]', Fair: 'text-amber-600', Poor: 'text-rose-600' }

  return (
    <ModalShell
      title={record.crop_type_name || 'Crop Monitoring'}
      subtitle={modalSubtitle}
      icon={Sprout}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {/* Status row */}
      <div className="mb-4 flex items-center gap-2">
        <StatusPill tone={STATUS_TONES[record.status] || 'slate'}>{record.status}</StatusPill>
        <span className="text-xs text-slate-400">{record.farmer_name} · {record.farmer_barangay}</span>
      </div>

      {/* Action bar */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => { setShowForm(v => !v); setShowSuggestions(false) }}
          className="flex items-center gap-1 text-sm font-medium text-[#1B4D2E] hover:text-[#1B4D2E]"
        >
          <Plus size={16} />
          Add New Log
        </button>
        <button
          type="button"
          onClick={handleToggleSuggestions}
          className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500"
        >
          {showSuggestions ? 'Hide Suggestions' : 'Get Suggestions'}
        </button>
      </div>

      {/* Suggestions panel */}
      {showSuggestions && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-800">
              Activity Schedule — {record.crop_type_name}
              {daysElapsed !== null && <span className="ml-1 font-normal text-amber-600">(Day {daysElapsed})</span>}
            </p>
            <button type="button" onClick={() => setShowSuggestions(false)} className="text-amber-500 hover:text-amber-700">
              <X size={14} />
            </button>
          </div>

          {suggestLoading ? (
            <p className="text-center text-xs text-amber-600 py-4">Loading suggestions…</p>
          ) : (
            <>
              {/* Disaster Response */}
              {disasterResponse.length > 0 && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 mb-2">
                    Disaster Response Recommendations
                  </p>
                  <div className="space-y-2">
                    {disasterResponse.map((r, i) => (
                      <div key={i} className="rounded-lg border border-rose-100 bg-white px-3 py-2">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_PILL[r.priority] || ''}`}>{r.priority}</span>
                          <span className="text-[12px] font-medium text-rose-900">{r.title}</span>
                          <span className="text-[10px] text-rose-400 italic">{r.disaster_type}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 pl-1">{r.action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {suggestions.length === 0 ? (
                <p className="text-center text-xs text-amber-600 py-2">No activity stages defined for this crop yet.</p>
              ) : (
              <>
              {/* Due Now */}
              {suggestions.filter(s => s.status === 'due_now').length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 mb-1.5">Due Now</p>
                  <div className="space-y-1.5">
                    {suggestions.filter(s => s.status === 'due_now').map(s => (
                      <button key={s.occurrence_key || `${s.id}_${s.day_after_planting}`} type="button"
                        onClick={() => applySuggestion(s.activity_name)}
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-left transition hover:border-amber-400 hover:bg-amber-50">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_PILL[s.priority] || ''}`}>{s.priority}</span>
                          <span className="text-[12px] font-medium text-slate-800">{s.activity_name}</span>
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Day {s.day_after_planting}</span>
                        </div>
                        {s.recommendation && <p className="mt-0.5 text-[11px] text-slate-500 pl-1">{s.recommendation}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Overdue */}
              {suggestions.filter(s => s.status === 'overdue').length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 mb-1.5">Overdue</p>
                  <div className="space-y-1.5">
                    {suggestions.filter(s => s.status === 'overdue').map(s => (
                      <button key={s.occurrence_key || `${s.id}_${s.day_after_planting}`} type="button"
                        onClick={() => applySuggestion(s.activity_name)}
                        className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-left transition hover:border-rose-400 hover:bg-rose-50">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_PILL[s.priority] || ''}`}>{s.priority}</span>
                          <span className="text-[12px] font-medium text-slate-800">{s.activity_name}</span>
                          <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full">Day {s.day_after_planting}</span>
                        </div>
                        {s.recommendation && <p className="mt-0.5 text-[11px] text-slate-500 pl-1">{s.recommendation}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Upcoming */}
              {suggestions.filter(s => s.status === 'upcoming').length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1B4D2E] mb-1.5">Upcoming</p>
                  <div className="space-y-1.5">
                    {suggestions.filter(s => s.status === 'upcoming').map(s => (
                      <div key={s.occurrence_key || `${s.id}_${s.day_after_planting}`}
                        className="w-full rounded-lg border border-[#E2E8E2] bg-white px-3 py-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_PILL[s.priority] || ''}`}>{s.priority}</span>
                          <span className="text-[12px] font-medium text-slate-700">{s.activity_name}</span>
                          <span className="text-[10px] bg-[#EBF5EE] text-[#1B4D2E] px-1.5 py-0.5 rounded-full">Day {s.day_after_planting}</span>
                          <span className="text-[10px] text-slate-400">in {s.days_diff} day{s.days_diff !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Done */}
              {suggestions.filter(s => s.status === 'done').length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Completed</p>
                  <div className="space-y-1">
                    {suggestions.filter(s => s.status === 'done').map(s => (
                      <div key={s.occurrence_key || `${s.id}_${s.day_after_planting}`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-[12px] line-through text-slate-400">{s.activity_name}</span>
                        <span className="text-[10px] text-slate-300">Day {s.day_after_planting}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </>
              )}
            </>
          )}
          <p className="mt-3 text-center text-xs text-amber-600">Click a Due Now / Overdue card to auto-fill the log form</p>
        </div>
      )}

      {/* Inline add form */}
      {showForm && (
        <form onSubmit={handleAddLog} className="mb-4 rounded-xl border border-[#C8E6D0] bg-[#EBF5EE] p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Activity *</label>
              <input
                className={baseInputClasses}
                placeholder="e.g. Fertilizer application"
                value={form.activity_type}
                onChange={e => setForm(f => ({ ...f, activity_type: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Date *</label>
              <input
                type="date"
                className={baseInputClasses}
                value={form.activity_date}
                onChange={e => setForm(f => ({ ...f, activity_date: e.target.value }))}
                required
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Recommendations / Notes</label>
            <textarea
              rows={2}
              className={baseInputClasses}
              placeholder="Observations or recommended follow-up actions…"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className={labelCls}>Plant Condition</label>
              <select className={baseInputClasses} value={form.plant_condition} onChange={e => setForm(f => ({ ...f, plant_condition: e.target.value }))}>
                <option value="">— Select —</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Poor">Poor</option>
              </select>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" size="sm" isLoading={isSaving}>Add Log</Button>
            </div>
          </div>
        </form>
      )}

      {/* Activity logs list */}
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">
          Activity Logs · {logs.length} {logs.length !== 1 ? 'entries' : 'entry'}
        </p>

        {isLoading ? (
          <LoadingSpinner />
        ) : logs.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-slate-400">
            No activity logs yet. Click "+ Add New Log" to get started.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {logs.map((log) => (
              <li key={log.id} className="flex items-start justify-between gap-2 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{log.activity_type}</p>
                    {log.plant_condition && (
                      <span className={`text-[10px] font-semibold ${conditionColor[log.plant_condition] || 'text-slate-500'}`}>
                        {log.plant_condition}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDate(log.activity_date)}
                    {log.notes ? ` — ${log.notes}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-slate-400 transition-colors hover:text-rose-500"
                  onClick={() => handleDeleteLog(log.id)}
                  aria-label="Delete log"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  )
}

export default CropMonitoringDetailModal
