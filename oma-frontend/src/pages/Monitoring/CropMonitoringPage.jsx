import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Bug, CheckCircle, CheckCircle2, Eye, FileText, Leaf, Lock, MapPin, Pencil, Plus, Trash2, TrendingUp, User, Wheat,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const todayISO = () => new Date().toISOString().slice(0, 10)

const ACTIVITY_OPTIONS = [
  'Land Preparation', 'Planting', 'Fertilizer Application',
  'Irrigation / Watering', 'Weeding', 'Pest Control',
  'Disease Control', 'Field Monitoring', 'Pre-Harvest Inspection',
  'Harvesting', 'Other',
]

const PRIORITY_BADGE = {
  High:   'bg-rose-500 text-white',
  Medium: 'bg-amber-500 text-white',
  Low:    'bg-[#2D7A4F] text-white',
  HIGH:   'bg-rose-500 text-white',
  MEDIUM: 'bg-amber-500 text-white',
  LOW:    'bg-[#2D7A4F] text-white',
}

const fmtDate = (v) => {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

function getGrowthStageLabel(datePlanted) {
  if (!datePlanted) return null
  const planted = new Date(datePlanted + 'T00:00:00')
  const today   = new Date()
  const days    = Math.floor((today - planted) / (1000 * 60 * 60 * 24))
  if (days < 0) return null
  let stage = 'Early Seedling'
  if (days > 7)  stage = 'Seedling'
  if (days > 21) stage = 'Vegetative'
  if (days > 45) stage = 'Reproductive'
  if (days > 75) stage = 'Ripening / Maturity'
  return { days, stage }
}

const DISASTER_ACTIVITY_MAP = {
  'Drought':       'Irrigation / Watering',
  'Flood':         'Field Monitoring',
  'Typhoon':       'Field Monitoring',
  'Strong Winds':  'Field Monitoring',
  'Pest Outbreak': 'Pest Control',
  'Other':         'Other',
}

// ── Suggestions Modal ─────────────────────────────────────────────────────────

function SuggestionsModal({ record, onClose, onApply }) {
  const { showToast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [earlyConfirm, setEarlyConfirm] = useState(null)
  const [dismissedDisasters, setDismissedDisasters] = useState(new Set())
  const [resolving, setResolving] = useState(null)

  const fetchSuggestions = useCallback(() => {
    if (!record) return
    setLoading(true)
    api.get(`/production/monitoring/${record.id}/suggestions/`)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [record])

  useEffect(() => { fetchSuggestions() }, [fetchSuggestions])

  if (!record) return null

  const handleLogClick = (s) => {
    if (s.status === 'upcoming') {
      setEarlyConfirm(s)
    } else {
      onApply(s)
      onClose()
    }
  }

  const handleMarkResolved = async (disasterId) => {
    setResolving(disasterId)
    try {
      await api.post(`/production/disasters/${disasterId}/resolve/`)
      showToast('Disaster marked as resolved.', 'success')
      fetchSuggestions()
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to resolve disaster.'
      showToast(msg, 'error')
    } finally {
      setResolving(null)
    }
  }

  const dismissPrompt = (disasterId) => {
    setDismissedDisasters(prev => { const next = new Set(prev); next.add(disasterId); return next })
  }

  const groups = {
    overdue: { label: 'Overdue', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700' },
    due_now: { label: 'Due Now', color: 'text-[#1B4D2E]', bg: 'bg-[#EBF5EE]', border: 'border-[#C8E6D0]', badge: 'bg-[#1B4D2E] text-white' },
    upcoming: { label: 'Upcoming', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
    done: { label: 'Done', color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-200 text-slate-600' },
  }

  const groupOrder = ['overdue', 'due_now', 'upcoming', 'done']

  const suggestions   = data?.suggestions || []
  const disasterRules = data?.disaster_response || []
  const daysElapsed   = data?.days_elapsed ?? 0
  const totalDays     = data?.total_days ?? 0
  const progressPct   = totalDays > 0 ? Math.min(100, Math.round((daysElapsed / totalDays) * 100)) : 0

  return (
    <ModalShell title={`Activity Suggestions — ${record.crop_type_name}`} onClose={onClose} maxWidth="max-w-lg">
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-8 h-8 border-4 border-[#1B4D2E] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Progress bar */}
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Growing Progress</span>
              <span className="text-sm font-semibold text-[#1B4D2E]">Day {daysElapsed} of {totalDays} days</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1B4D2E] rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Grouped schedule suggestions */}
          {groupOrder.map(key => {
            const group = groups[key]
            const items = suggestions.filter(s => s.status === key)
            if (items.length === 0) return null
            const isDoneGroup = key === 'done'
            return (
              <div key={key}>
                <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${group.color}`}>
                  {group.label} ({items.length})
                </h4>
                <div className="space-y-2">
                  {items.map(s => (
                    <div
                      key={s.occurrence_key || s.id}
                      className={`rounded-xl border p-4 ${group.bg} ${group.border} ${isDoneGroup ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-medium text-slate-900">{s.activity_name}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${group.badge}`}>
                              Day {s.day_after_planting}
                            </span>
                            <span className="text-xs text-slate-500 uppercase">{s.priority}</span>
                          </div>
                          {s.recommendation && (
                            <p className="text-xs text-slate-600 leading-relaxed">{s.recommendation}</p>
                          )}
                          {isDoneGroup && s.done_date && (
                            <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
                              <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                              Done on {fmtDate(s.done_date)}
                            </div>
                          )}
                        </div>
                        {!isDoneGroup && (
                          <button
                            onClick={() => handleLogClick(s)}
                            className="shrink-0 text-xs font-medium bg-[#1B4D2E] text-white px-3 py-1.5 rounded-lg hover:bg-[#235E38] transition"
                          >
                            {s.status === 'upcoming' ? 'Log Early' : 'Log'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Disaster response — grouped by active disaster */}
          {disasterRules.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide mb-2 text-rose-700">
                Disaster Response ({disasterRules.length})
              </h4>
              <div className="space-y-3">
                {disasterRules.map((disaster) => {
                  if (disaster.all_rules_done && !dismissedDisasters.has(disaster.disaster_id)) {
                    return (
                      <div key={disaster.disaster_id} className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-2">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-emerald-800">
                              All recommended responses for this {disaster.disaster_type} have been completed.
                            </p>
                            <p className="text-xs text-emerald-600 mt-0.5">
                              If the crop has recovered, mark this disaster as resolved. You can leave it active if you're still monitoring recovery.
                            </p>
                            <div className="flex gap-2 mt-2.5">
                              <button
                                onClick={() => handleMarkResolved(disaster.disaster_id)}
                                disabled={resolving === disaster.disaster_id}
                                className="bg-[#1B4D2E] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#235E38] disabled:opacity-50"
                              >
                                Mark as Resolved
                              </button>
                              <button
                                onClick={() => dismissPrompt(disaster.disaster_id)}
                                className="text-xs text-slate-500 px-3 py-1.5 hover:text-slate-700"
                              >
                                Not Yet — Keep Monitoring
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  }
                  if (disaster.all_rules_done && dismissedDisasters.has(disaster.disaster_id)) {
                    return (
                      <div key={disaster.disaster_id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                        All responses for {disaster.disaster_type} completed — still monitoring recovery.
                      </div>
                    )
                  }
                  return (
                    <div key={disaster.disaster_id} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        <span className="text-sm font-semibold text-rose-800">{disaster.disaster_type}</span>
                        <span className="text-xs text-rose-400">{fmtDate(disaster.date_of_occurrence)}</span>
                      </div>
                      <div className="space-y-2">
                        {disaster.rules.map((rule, ri) => (
                          <div
                            key={ri}
                            className={`rounded-lg border p-3 ${rule.is_done ? 'border-slate-100 bg-slate-50 cursor-not-allowed' : 'border-rose-100 bg-white'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className={`text-sm font-medium ${rule.is_done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{rule.title}</span>
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">{rule.priority}</span>
                                  {rule.is_done && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-[#1B4D2E]">Done</span>
                                  )}
                                </div>
                                {rule.action && (
                                  <p className={`text-xs leading-relaxed ${rule.is_done ? 'text-slate-400' : 'text-slate-600'}`}>{rule.action}</p>
                                )}
                              </div>
                              {!rule.is_done && (
                                <button
                                  onClick={() => { onApply({ activity_name: rule.title, recommendation: rule.action, status: 'disaster_rule' }); onClose() }}
                                  className="shrink-0 text-xs font-medium bg-rose-600 text-white px-3 py-1.5 rounded-lg hover:bg-rose-700 transition"
                                >
                                  Log
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {suggestions.length === 0 && disasterRules.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">No activity stages defined for this crop type.</p>
          )}
        </div>
      )}

      {earlyConfirm && (
        <ConfirmDialog
          title="Log Activity Early?"
          message={`"${earlyConfirm.activity_name}" is scheduled for Day ${earlyConfirm.day_after_planting}. It's ${Math.abs(earlyConfirm.days_diff)} day${Math.abs(earlyConfirm.days_diff) !== 1 ? 's' : ''} away. Log it now anyway?`}
          confirmLabel="Yes, Log Early"
          onConfirm={() => { setEarlyConfirm(null); onApply(earlyConfirm); onClose() }}
          onCancel={() => setEarlyConfirm(null)}
        />
      )}
    </ModalShell>
  )
}

// ── View Logs Modal ───────────────────────────────────────────────────────────

function ViewLogsModal({ record, onClose, onLogAdded }) {
  const { showToast } = useToast()
  const [logs,              setLogs]              = useState([])
  const [disasters,         setDisasters]         = useState([])
  const [isLoading,         setIsLoading]         = useState(true)
  const { isAdmin } = useAuth()
  const [showForm,          setShowForm]          = useState(false)
  const [showSuggest,       setShowSuggest]       = useState(false)
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [pendingSuggestion, setPendingSuggestion] = useState(null)
  const [expandedDisasters, setExpandedDisasters] = useState(new Set())
  const [showHarvestEdit,   setShowHarvestEdit]   = useState(false)
  const [harvestDeleteConfirm, setHarvestDeleteConfirm] = useState(false)
  const [isDeletingHarvest, setIsDeletingHarvest] = useState(false)

  const isHarvested = record.status === 'Harvested'
  const isTotalLoss = record.status === 'Total Loss'

  // Form state
  const [activityType,    setActivityType]    = useState('')
  const [activityDate,    setActivityDate]    = useState(todayISO())
  const [plantCondition,  setPlantCondition]  = useState('')
  const [fertilizerType,  setFertilizerType]  = useState('')
  const [quantityApplied, setQuantityApplied] = useState('')
  const [quantityUnit,    setQuantityUnit]    = useState('kg')
  const [pestDiseaseName, setPestDiseaseName] = useState('')
  const [areaAffected,    setAreaAffected]    = useState('')
  const [severity,        setSeverity]        = useState('')
  const [notes,           setNotes]           = useState('')

  const showFertilizerFields = activityType === 'Fertilizer Application'
  const showPestFields = activityType === 'Pest Control' || activityType === 'Disease Control'

  const PRE_PLANTING_ACTIVITIES = [
    'Soil Preparation & Leveling', 'Seed Bed Preparation',
    'Seed Planting', 'Land Preparation', 'Planting',
  ]
  const isPrePlanting = PRE_PLANTING_ACTIVITIES.includes(activityType)

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const [logsRes, disRes] = await Promise.all([
        api.get(`/production/monitoring/${record.id}/logs/`),
        api.get(`/production/monitoring/${record.id}/disasters/`),
      ])
      setLogs(Array.isArray(logsRes.data) ? logsRes.data : (logsRes.data.results || []))
      setDisasters(Array.isArray(disRes.data) ? disRes.data : (disRes.data.results || []))
    } catch {
      showToast('Failed to load activity logs.', 'error')
    } finally { setIsLoading(false) }
  }, [record.id])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const allEvents = useMemo(() => {
    const logEvents = logs.map(l => ({ ...l, _type: 'log' }))
    const disEvents = disasters.map(d => ({ ...d, _type: 'disaster', _sortDate: d.date_of_occurrence }))
    return [...logEvents.map(l => ({ ...l, _sortDate: l.activity_date })), ...disEvents]
      .sort((a, b) => new Date(b._sortDate || 0) - new Date(a._sortDate || 0))
  }, [logs, disasters])

  const resetForm = () => {
    setActivityType(''); setActivityDate(todayISO()); setPlantCondition('')
    setFertilizerType(''); setQuantityApplied(''); setQuantityUnit('kg')
    setPestDiseaseName(''); setAreaAffected(''); setSeverity(''); setNotes('')
    setPendingSuggestion(null)
  }

  const handleSubmitClick = () => {
    if (!activityType) { showToast('Please select an activity.', 'error'); return }
    if (!activityDate) { showToast('Activity date is required.', 'error'); return }
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false); setIsSubmitting(true)
    try {
      await api.post(`/production/monitoring/${record.id}/logs/`, {
        activity_type:     activityType,
        activity_date:     activityDate,
        plant_condition:   plantCondition,
        fertilizer_type:   showFertilizerFields ? fertilizerType : '',
        quantity_applied:  showFertilizerFields ? (quantityApplied || null) : null,
        quantity_unit:     showFertilizerFields ? quantityUnit : '',
        pest_disease_name: showPestFields ? pestDiseaseName : '',
        area_affected_ha:  showPestFields ? (areaAffected || null) : null,
        severity:          showPestFields ? severity : '',
        notes,
        target_day: pendingSuggestion?.occurrence_day ?? null,
        is_late:    pendingSuggestion?.status === 'overdue',
      })
      showToast('Activity log added.', 'success')
      resetForm(); setShowForm(false)
      await fetchLogs(); onLogAdded()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to save log.', 'error')
    } finally { setIsSubmitting(false) }
  }

  const handleApplySuggestion = (s) => {
    setActivityType(s.activity_name || '')
    setNotes(s.recommendation || '')
    setShowSuggest(false)
    setShowForm(true)
    if (s.status === 'overdue') {
      setPendingSuggestion({ occurrence_day: s.day_after_planting, status: 'overdue' })
    } else {
      setPendingSuggestion(null)
    }
  }

  const handleDeleteHarvest = async () => {
    setHarvestDeleteConfirm(false)
    setIsDeletingHarvest(true)
    try {
      await api.delete(`/production/${record.harvest_record_id}/`)
      showToast('Harvest record deleted. Crop status reverted to Active.', 'success')
      onLogAdded()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to delete harvest record.', 'error')
      setIsDeletingHarvest(false)
    }
  }

  const assocLabel = record.association_name || record.farmer_name || '—'
  const growthInfo = getGrowthStageLabel(record.date_planted)

  return (
    <>
      <ModalShell
        title={record.crop_type_name?.toUpperCase() ?? 'CROP'}
        subtitle={`${assocLabel} - Planted: ${record.date_planted || '—'}`}
        icon={FileText}
        onClose={onClose}
        maxWidth="max-w-sm"
      >
        {/* Post-harvest / total-loss read-only banners */}
        {isHarvested ? (
          <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <Wheat className="w-4 h-4 flex-shrink-0" />
                Harvest Recorded
              </div>
              {isAdmin && record.harvest_record_id && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setShowHarvestEdit(true)}
                    className="flex items-center gap-1 rounded-lg bg-white border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button type="button" onClick={() => setHarvestDeleteConfirm(true)} disabled={isDeletingHarvest}
                    className="flex items-center gap-1 rounded-lg bg-white border border-rose-300 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50">
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              )}
            </div>
            <div className="text-xs text-emerald-700 space-y-0.5">
              {record.actual_yield_kg && (
                <p>Yield: <span className="font-medium">{Number(record.actual_yield_kg).toLocaleString()} kg</span></p>
              )}
              {record.actual_harvest_date && (
                <p>Date: <span className="font-medium">{fmtDate(record.actual_harvest_date)}</span></p>
              )}
            </div>
            {!isAdmin && (
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-500">
                <Lock className="w-3 h-3" /> Log history is read-only.
              </p>
            )}
          </div>
        ) : isTotalLoss ? (
          <>
            <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                <Lock className="w-4 h-4 flex-shrink-0" />
                Total Loss Recorded
              </div>
              <p className="mt-1 text-xs text-rose-600">
                This crop was recorded as a total loss. Activity logs are read-only.
              </p>
            </div>
            <div className="mb-4 flex items-center justify-end">
              <button type="button" onClick={() => setShowSuggest(true)}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
                🌿 Get Suggestions
              </button>
            </div>
          </>
        ) : (
          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={() => { setShowForm(v => !v); if (showForm) resetForm() }}
              className="text-sm font-medium text-[#1B4D2E] hover:underline">
              {showForm ? '— Cancel' : '+ Add New Log'}
            </button>
            <button type="button" onClick={() => setShowSuggest(true)}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
              🌿 Get Suggestions
            </button>
          </div>
        )}

        {/* Inline form — hidden for harvested crops */}
        {showForm && !isHarvested && (
          <div className="mb-4 space-y-3">
            {/* Growth stage context label */}
            {growthInfo && (
              <div className="flex items-center gap-1.5 rounded-lg bg-[#EBF5EE] border border-[#C8E6D0] px-3 py-2 text-xs text-[#1B4D2E]">
                <Leaf className="w-3.5 h-3.5 flex-shrink-0" />
                Day {growthInfo.days} — <strong className="ml-0.5">{growthInfo.stage}</strong> stage
              </div>
            )}

            {/* Late log note */}
            {pendingSuggestion?.status === 'overdue' && (
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Late log — this activity was scheduled for Day {pendingSuggestion.occurrence_day} and will be marked as late.
              </div>
            )}

            {/* Activity + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Activity *</label>
                <select className={baseInputClasses} value={activityType}
                  onChange={e => {
                    const newType = e.target.value
                    setActivityType(newType)
                    if (PRE_PLANTING_ACTIVITIES.includes(newType)) setPlantCondition('')
                    setPendingSuggestion(null)
                  }}>
                  <option value="">Select Activity</option>
                  {ACTIVITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Date of Activity *</label>
                <input type="date" className={baseInputClasses} value={activityDate}
                  onChange={e => setActivityDate(e.target.value)} />
              </div>
            </div>

            {/* Fertilizer fields */}
            {showFertilizerFields && (
              <div className="bg-[#EBF5EE] border border-[#C8E6D0] rounded-xl p-3">
                <p className="text-xs font-semibold text-[#1B4D2E] mb-2 flex items-center gap-1">
                  <Leaf className="w-3.5 h-3.5" /> Fertilizer Details
                </p>
                <div className="mb-2">
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Type of Fertilizer</label>
                  <input type="text" value={fertilizerType} onChange={e => setFertilizerType(e.target.value)}
                    placeholder="e.g. 14-14-14 NPK, Urea 46-0-0, Organic" className={baseInputClasses} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Quantity Applied</label>
                    <input type="number" step="0.01" value={quantityApplied}
                      onChange={e => setQuantityApplied(e.target.value)} placeholder="e.g. 50" className={baseInputClasses} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Unit</label>
                    <select value={quantityUnit} onChange={e => setQuantityUnit(e.target.value)} className={baseInputClasses}>
                      <option value="kg">kg</option>
                      <option value="bags">bags</option>
                      <option value="sacks">sacks</option>
                      <option value="liters">liters</option>
                      <option value="pieces">pieces</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Pest/Disease fields */}
            {showPestFields && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-rose-800 mb-2 flex items-center gap-1">
                  <Bug className="w-3.5 h-3.5" /> Pest / Disease Details
                </p>
                <div className="mb-2">
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Pest / Disease Name</label>
                  <input type="text" value={pestDiseaseName} onChange={e => setPestDiseaseName(e.target.value)}
                    placeholder="e.g. Brown Planthopper, Bacterial Blight" className={baseInputClasses} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Area Affected (ha)</label>
                    <input type="number" step="0.0001" value={areaAffected}
                      onChange={e => setAreaAffected(e.target.value)} placeholder="e.g. 1.50" className={baseInputClasses} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Severity</label>
                    <select value={severity} onChange={e => setSeverity(e.target.value)} className={baseInputClasses}>
                      <option value="">Select</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Plant Condition */}
            {!isPrePlanting && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Plant Condition</label>
                <select className={baseInputClasses} value={plantCondition}
                  onChange={e => setPlantCondition(e.target.value)}>
                  <option value="">Select condition</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Poor">Poor</option>
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Recommendations</label>
              <textarea rows={3} className={`${baseInputClasses} resize-none`}
                placeholder="Recommendations (optional)"
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            <button type="button" disabled={isSubmitting} onClick={handleSubmitClick}
              className="w-full rounded-xl bg-[#1B4D2E] py-2.5 text-sm font-medium text-white hover:bg-[#235E38] disabled:opacity-60">
              {isSubmitting ? 'Saving…' : 'Add Log'}
            </button>
          </div>
        )}

        {/* Activity Logs header */}
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2D7A4F]" />
          <span className="text-sm font-semibold text-slate-700">Activity History</span>
          {disasters.length > 1 && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
              <AlertTriangle className="w-3 h-3" /> {disasters.length} disaster reports
            </span>
          )}
        </div>

        {/* Unified timeline */}
        {isLoading ? (
          <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
        ) : allEvents.length === 0 ? (
          <p className="py-4 text-center text-sm italic text-slate-400">No logs yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {allEvents.map(event => {
              if (event._type === 'disaster') {
                const isExpanded = expandedDisasters.has(event.id)
                const hasDetails = event.area_affected_ha || event.estimated_damage || event.production_loss
                return (
                  <div key={`d-${event.id}`} className="py-3">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setExpandedDisasters(prev => {
                        const next = new Set(prev)
                        if (next.has(event.id)) next.delete(event.id)
                        else next.add(event.id)
                        return next
                      })}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-rose-700">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {event.disaster_type} — Disaster Report
                          {event.status === 'Resolved' ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Resolved</span>
                          ) : (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Active</span>
                          )}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-rose-400">{fmtDate(event.date_of_occurrence)}</span>
                          {hasDetails && (
                            <span className="text-xs text-rose-300">
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          )}
                        </div>
                      </div>
                      {!isExpanded && event.area_affected_ha && (
                        <p className="text-xs text-rose-500 mt-0.5">Area: {event.area_affected_ha} ha</p>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="mt-1.5 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 space-y-1">
                        {event.status === 'Resolved' && event.resolved_date && (
                          <p className="text-xs text-emerald-700"><span className="font-medium">Resolved on:</span> {fmtDate(event.resolved_date)}{event.resolved_by_name ? ` by ${event.resolved_by_name}` : ''}</p>
                        )}
                        {event.area_affected_ha && (
                          <p className="text-xs text-rose-700"><span className="font-medium">Area affected:</span> {event.area_affected_ha} ha</p>
                        )}
                        {event.estimated_damage && (
                          <p className="text-xs text-rose-700"><span className="font-medium">Damage:</span> {event.estimated_damage}</p>
                        )}
                        {event.production_loss && (
                          <p className="text-xs text-rose-700"><span className="font-medium">Production loss:</span> {event.production_loss}</p>
                        )}
                        {!hasDetails && (
                          <p className="text-xs text-rose-400 italic">No additional details recorded.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              }
              const log = event
              return (
                <div key={`l-${log.id}`} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{log.activity_type}</span>
                    <span className="shrink-0 text-xs text-slate-400">{fmtDate(log.activity_date)}</span>
                  </div>
                  {log.plant_condition && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${
                      log.plant_condition === 'Good' ? 'bg-green-100 text-green-700'
                      : log.plant_condition === 'Fair' ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-600'
                    }`}>
                      {log.plant_condition}
                    </span>
                  )}
                  {log.is_late && (
                    <span className="mt-1 ml-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Logged late — target Day {log.target_day}
                    </span>
                  )}
                  {(log.fertilizer_type || log.quantity_applied) && (
                    <p className="text-xs text-slate-500 mt-1">
                      {[log.fertilizer_type, log.quantity_applied && `${log.quantity_applied} ${log.quantity_unit}`].filter(Boolean).join(' — ')}
                    </p>
                  )}
                  {log.pest_disease_name && (
                    <p className="text-xs text-slate-500 mt-1">
                      {log.pest_disease_name}
                      {log.area_affected_ha && ` | ${log.area_affected_ha} ha`}
                      {log.severity && ` | Severity: ${log.severity}`}
                    </p>
                  )}
                  {log.notes && <p className="mt-0.5 text-xs text-slate-500">{log.notes}</p>}
                  {log.logged_by_name && <p className="mt-0.5 text-xs text-slate-400">{log.logged_by_name}</p>}
                </div>
              )
            })}
          </div>
        )}
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Action"
          message="Are you sure you want to add this activity log?"
          confirmLabel="Confirm"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {showSuggest && (
        <SuggestionsModal
          record={record}
          onClose={() => setShowSuggest(false)}
          onApply={handleApplySuggestion}
        />
      )}

      {harvestDeleteConfirm && (
        <ConfirmDialog
          title="Delete Harvest Record?"
          message="This will permanently delete the harvest record and revert this crop's status back to Active. This cannot be undone."
          confirmLabel="Delete Harvest"
          onConfirm={handleDeleteHarvest}
          onCancel={() => setHarvestDeleteConfirm(false)}
        />
      )}

      {showHarvestEdit && record.harvest_record_id && (
        <EditHarvestRecordModal
          harvestId={record.harvest_record_id}
          onClose={() => setShowHarvestEdit(false)}
          onSuccess={() => { setShowHarvestEdit(false); fetchLogs(); onLogAdded() }}
        />
      )}
    </>
  )
}

// ── Edit Harvest Record Modal (Admin only) ────────────────────────────────────

function EditHarvestRecordModal({ harvestId, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [form,         setForm]         = useState(null)
  const [isLoading,    setIsLoading]    = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dateError,    setDateError]    = useState('')

  useEffect(() => {
    api.get(`/production/${harvestId}/`)
      .then(r => {
        const d = r.data
        setForm({
          harvest_start_date:      d.harvest_start_date || '',
          harvest_end_date:        d.harvest_end_date || '',
          area_harvested_hectares: d.area_harvested_hectares ? String(d.area_harvested_hectares) : '',
          volume_kg:               d.volume_kg ? String(d.volume_kg) : '',
          unit_of_measure:         d.unit_of_measure || 'kg',
          remarks:                 d.remarks || '',
        })
      })
      .catch(() => showToast('Failed to load harvest record.', 'error'))
      .finally(() => setIsLoading(false))
  }, [harvestId])

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async () => {
    if (!form.harvest_start_date) { showToast('Harvest start date is required.', 'error'); return }
    if (form.harvest_end_date && form.harvest_end_date < form.harvest_start_date) {
      setDateError('End date must be on or after start date.'); return
    }
    if (!form.volume_kg || parseFloat(form.volume_kg) <= 0) { showToast('Volume must be greater than 0.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.patch(`/production/${harvestId}/`, {
        harvest_start_date:      form.harvest_start_date,
        harvest_end_date:        form.harvest_end_date || null,
        area_harvested_hectares: parseFloat(form.area_harvested_hectares),
        volume_kg:               parseFloat(form.volume_kg),
        unit_of_measure:         form.unit_of_measure,
        remarks:                 form.remarks,
      })
      showToast('Harvest record updated.', 'success')
      onSuccess()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to update harvest record.', 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <ModalShell title="Edit Harvest Record" subtitle="Update harvest details" icon={Wheat}
      iconBg="bg-amber-100" iconColor="text-amber-600" onClose={onClose} maxWidth="max-w-md">
      {isLoading || !form ? (
        <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Harvest Start Date *</label>
              <input type="date" className={baseInputClasses} value={form.harvest_start_date}
                onChange={e => { handleChange('harvest_start_date', e.target.value); setDateError('') }} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Harvest End Date</label>
              <input type="date" className={baseInputClasses} value={form.harvest_end_date}
                min={form.harvest_start_date || undefined}
                onChange={e => { handleChange('harvest_end_date', e.target.value); setDateError('') }} />
            </div>
          </div>
          {dateError && <p className="text-xs font-medium text-rose-600">{dateError}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Area Harvested (ha) *</label>
              <input type="number" step="0.0001" className={baseInputClasses}
                value={form.area_harvested_hectares}
                onChange={e => handleChange('area_harvested_hectares', e.target.value)}
                placeholder="e.g. 2.50" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Unit</label>
              <select className={baseInputClasses} value={form.unit_of_measure}
                onChange={e => handleChange('unit_of_measure', e.target.value)}>
                <option value="kg">kg</option>
                <option value="bags">bags</option>
                <option value="cavan">cavan</option>
                <option value="sacks">sacks</option>
                <option value="pieces">pieces</option>
                <option value="bundles">bundles</option>
                <option value="boxes">boxes</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Volume / Quantity *</label>
            <input type="number" step="0.01" className={baseInputClasses}
              value={form.volume_kg}
              onChange={e => handleChange('volume_kg', e.target.value)}
              placeholder="e.g. 500" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Remarks (optional)</label>
            <textarea rows={2} className={`${baseInputClasses} resize-none`}
              value={form.remarks}
              onChange={e => handleChange('remarks', e.target.value)}
              placeholder="Any additional harvest notes" />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={isSubmitting}
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}

// ── Disaster Report Modal ─────────────────────────────────────────────────────

function DisasterReportModal({ record, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [disasterType,      setDisasterType]      = useState('')
  const [dateOfOccurrence,  setDateOfOccurrence]  = useState(todayISO())
  const [areaAffectedHa,    setAreaAffectedHa]    = useState('')
  const [estimatedDamage,   setEstimatedDamage]   = useState('')
  const [productionLoss,    setProductionLoss]    = useState('')
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [areaError,         setAreaError]         = useState('')
  const [dateError,         setDateError]         = useState('')

  const cropName   = record.crop_type_name || 'this crop'
  const maxArea    = record.area_planted_ha ? parseFloat(record.area_planted_ha) : null
  const datePlanted = record.date_planted || null

  const validateArea = (val) => {
    if (!val) return 'Area affected is required.'
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return 'Area must be greater than 0.'
    if (maxArea !== null && n > maxArea) return `Cannot exceed area planted (${maxArea} ha).`
    return ''
  }

  const validateDate = (val) => {
    if (!val) return 'Date of occurrence is required.'
    if (val > todayISO()) return 'Date cannot be in the future.'
    if (datePlanted && val < datePlanted) return `Date cannot be before planting date (${datePlanted}).`
    return ''
  }

  const handleSubmitClick = () => {
    if (!disasterType) { showToast('Please select a disaster type.', 'error'); return }
    const aErr = validateArea(areaAffectedHa)
    const dErr = validateDate(dateOfOccurrence)
    setAreaError(aErr)
    setDateError(dErr)
    if (aErr || dErr) return
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      await api.post(`/production/monitoring/${record.id}/disasters/`, {
        disaster_type:      disasterType,
        date_of_occurrence: dateOfOccurrence,
        area_affected_ha:   parseFloat(areaAffectedHa),
        estimated_damage:   estimatedDamage,
        production_loss:    productionLoss,
      })
      showToast('Disaster report recorded.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to save disaster report.', 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <>
      <ModalShell
        title="Report Disaster / Damage"
        subtitle={`Report weather or disaster event for ${cropName}`}
        icon={AlertTriangle}
        iconBg="bg-rose-100"
        iconColor="text-rose-600"
        onClose={onClose}
        maxWidth="max-w-md"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Disaster Type *</label>
            <select className={baseInputClasses} value={disasterType}
              onChange={e => setDisasterType(e.target.value)}>
              <option value="">Select type</option>
              <option value="Drought">Drought</option>
              <option value="Flood">Flood</option>
              <option value="Typhoon">Typhoon</option>
              <option value="Strong Winds">Strong Winds</option>
              <option value="Pest Outbreak">Pest Outbreak</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Date of Occurrence *</label>
            <input type="date" className={`${baseInputClasses} ${dateError ? 'border-rose-400' : ''}`}
              value={dateOfOccurrence}
              max={todayISO()}
              min={datePlanted || undefined}
              onChange={e => { setDateOfOccurrence(e.target.value); setDateError(validateDate(e.target.value)) }} />
            {dateError && <p className="mt-1 text-xs text-rose-600">{dateError}</p>}
            {datePlanted && !dateError && (
              <p className="mt-1 text-xs text-slate-400">Must be between {datePlanted} and today.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Area Affected (ha) *</label>
            <input type="number" step="0.0001"
              className={`${baseInputClasses} ${areaError ? 'border-rose-400' : ''}`}
              value={areaAffectedHa}
              onChange={e => { setAreaAffectedHa(e.target.value); setAreaError(validateArea(e.target.value)) }}
              placeholder={maxArea ? `0.01 – ${maxArea}` : 'e.g. 2.50'} />
            {areaError && <p className="mt-1 text-xs text-rose-600">{areaError}</p>}
            {!areaError && maxArea && (
              <p className="mt-1 text-xs text-slate-400">Max: {maxArea} ha (total area planted)</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Damage Description (optional)</label>
            <textarea rows={3} className={`${baseInputClasses} resize-none`} value={estimatedDamage}
              onChange={e => setEstimatedDamage(e.target.value)}
              placeholder="Describe the damage observed (crops, infrastructure, etc.)" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Estimated Production Loss (optional)</label>
            <textarea rows={2} className={`${baseInputClasses} resize-none`} value={productionLoss}
              onChange={e => setProductionLoss(e.target.value)}
              placeholder="Describe or estimate production loss" />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmitClick} disabled={isSubmitting}
              className="bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
              {isSubmitting ? 'Saving…' : 'Report Disaster'}
            </button>
          </div>
        </div>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Disaster Report"
          message={`Are you sure you want to log this disaster event for ${cropName}? This will be recorded in the monitoring history.`}
          confirmLabel="Yes, Report"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

// ── Record Harvest Modal (from Monitoring table) ──────────────────────────────

function RecordHarvestFromMonitoringModal({ record, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [harvestStartDate,  setHarvestStartDate]  = useState(todayISO())
  const [harvestEndDate,    setHarvestEndDate]    = useState('')
  const [areaHarvested,     setAreaHarvested]     = useState(record.area_planted_ha ? String(record.area_planted_ha) : '')
  const [unitOfMeasure,     setUnitOfMeasure]     = useState('kg')
  const [quantityHarvested, setQuantityHarvested] = useState('')
  const [harvestNotes,      setHarvestNotes]      = useState('')
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [showSoftConfirm,   setShowSoftConfirm]   = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [dateError,         setDateError]         = useState('')
  const [areaError,         setAreaError]         = useState('')
  const [quantityError,     setQuantityError]     = useState('')

  const cropName     = record.crop_type_name || 'this crop'
  const maxArea      = record.area_planted_ha ? parseFloat(record.area_planted_ha) : null
  const estYield     = record.estimated_yield_kg ? parseFloat(record.estimated_yield_kg) : null
  const softLow      = estYield ? +(estYield * 0.70).toFixed(2) : null
  const softHigh     = estYield ? +(estYield * 1.30).toFixed(2) : null
  const hardMax      = estYield ? +(estYield * 2).toFixed(2) : null

  const yieldPerHa = areaHarvested > 0 && quantityHarvested > 0
    ? (parseFloat(quantityHarvested) / parseFloat(areaHarvested)).toFixed(2)
    : null

  const handleEndDateChange = (v) => {
    setHarvestEndDate(v)
    if (harvestStartDate && v && v < harvestStartDate) {
      setDateError('End date must be on or after the start date.')
    } else {
      setDateError('')
    }
  }

  const validateArea = (val) => {
    if (!val) return 'Area harvested is required.'
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return 'Area must be greater than 0.'
    if (maxArea !== null && n > maxArea) return `Cannot exceed area planted (${maxArea} ha).`
    return ''
  }

  const validateQuantity = (val) => {
    if (!val) return 'Quantity harvested is required.'
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return 'Quantity must be greater than 0.'
    if (hardMax !== null && n > hardMax) return `Quantity (${n} kg) exceeds 2× the estimated yield (${hardMax} kg). Please verify.`
    return ''
  }

  const handleSubmitClick = () => {
    if (!harvestStartDate) { showToast('Harvest start date is required.', 'error'); return }
    const aErr = validateArea(areaHarvested)
    const qErr = validateQuantity(quantityHarvested)
    setAreaError(aErr)
    setQuantityError(qErr)
    if (aErr || qErr || dateError) return

    const qty = parseFloat(quantityHarvested)
    const isSoftOutOfRange = softLow !== null && softHigh !== null && (qty < softLow || qty > softHigh)
    if (isSoftOutOfRange) {
      setShowSoftConfirm(true)
      return
    }
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      const month  = new Date(harvestStartDate).getMonth() + 1
      const season = (month >= 6 && month <= 11) ? 'Wet' : 'Dry'
      const year   = new Date(harvestStartDate).getFullYear()

      await api.post('/production/create/', {
        monitoring_record:       record.id,
        farm_parcel:             record.farm_parcel || null,
        season,
        year,
        crop_name:               record.crop_type_name || '',
        harvest_start_date:      harvestStartDate,
        harvest_end_date:        harvestEndDate || null,
        area_harvested_hectares: parseFloat(areaHarvested),
        volume_kg:               parseFloat(quantityHarvested),
        unit_of_measure:         unitOfMeasure,
        yield_per_hectare_kg:    yieldPerHa ? parseFloat(yieldPerHa) : null,
        remarks:                 harvestNotes,
      })

      showToast('Harvest recorded successfully!', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to record harvest.', 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <>
      <ModalShell
        title="Record Harvest"
        subtitle={`Record harvest details for ${cropName}`}
        icon={Wheat}
        iconBg="bg-amber-100"
        iconColor="text-amber-600"
        onClose={onClose}
        maxWidth="max-w-md"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Harvest Start Date *</label>
              <input type="date" className={baseInputClasses} value={harvestStartDate}
                onChange={e => {
                  setHarvestStartDate(e.target.value)
                  if (harvestEndDate && harvestEndDate < e.target.value) {
                    setDateError('End date must be on or after the start date.')
                  } else { setDateError('') }
                }} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Harvest End Date <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input type="date" className={baseInputClasses} value={harvestEndDate}
                min={harvestStartDate || undefined}
                onChange={e => handleEndDateChange(e.target.value)} />
            </div>
          </div>
          {dateError && <p className="text-xs font-medium text-rose-600">{dateError}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Area Harvested (ha) *</label>
              <input type="number" step="0.0001"
                className={`${baseInputClasses} ${areaError ? 'border-rose-400' : ''}`}
                value={areaHarvested}
                onChange={e => { setAreaHarvested(e.target.value); setAreaError(validateArea(e.target.value)) }}
                placeholder="e.g. 2.50" />
              {areaError
                ? <p className="mt-1 text-xs text-rose-600">{areaError}</p>
                : maxArea && <p className="mt-1 text-xs text-slate-400">Max: {maxArea} ha</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Unit of Measure *</label>
              <select className={baseInputClasses} value={unitOfMeasure}
                onChange={e => setUnitOfMeasure(e.target.value)}>
                <option value="kg">kg</option>
                <option value="bags">bags</option>
                <option value="cavan">cavan</option>
                <option value="sacks">sacks</option>
                <option value="pieces">pieces</option>
                <option value="bundles">bundles</option>
                <option value="boxes">boxes</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Quantity Harvested *</label>
            <input type="number" step="0.01"
              className={`${baseInputClasses} ${quantityError ? 'border-rose-400' : ''}`}
              value={quantityHarvested}
              onChange={e => { setQuantityHarvested(e.target.value); setQuantityError(validateQuantity(e.target.value)) }}
              placeholder="e.g. 500" />
            {quantityError
              ? <p className="mt-1 text-xs text-rose-600">{quantityError}</p>
              : estYield && softLow !== null && softHigh !== null && (
                <p className="mt-1 text-xs text-slate-400">
                  Expected range: {softLow.toLocaleString()} – {softHigh.toLocaleString()} kg
                  &nbsp;(based on estimated yield of {estYield.toLocaleString()} kg ±30%)
                </p>
              )}
            {!quantityError && quantityHarvested && estYield && softLow !== null && softHigh !== null &&
              parseFloat(quantityHarvested) > 0 &&
              (parseFloat(quantityHarvested) < softLow || parseFloat(quantityHarvested) > softHigh) && (
              <p className="mt-1 text-xs font-medium text-amber-600">
                ⚠ Quantity is outside the expected range — you will be asked to confirm.
              </p>
            )}
          </div>

          {yieldPerHa && (
            <div className="bg-[#EBF5EE] border border-[#C8E6D0] rounded-xl px-4 py-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#1B4D2E] flex-shrink-0" />
              <div>
                <p className="text-[13px] font-medium text-[#1B4D2E]">
                  Yield per Hectare: {Number(yieldPerHa).toLocaleString()} {unitOfMeasure}/ha
                </p>
                <p className="text-[12px] text-[#4A5E4A]">Auto-computed from quantity ÷ area harvested</p>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Notes (optional)</label>
            <textarea rows={2} className={`${baseInputClasses} resize-none`} value={harvestNotes}
              onChange={e => setHarvestNotes(e.target.value)}
              placeholder="Any additional harvest notes or observations" />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmitClick} disabled={isSubmitting}
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
              {isSubmitting ? 'Saving…' : 'Save Harvest Record'}
            </button>
          </div>
        </div>
      </ModalShell>

      {showSoftConfirm && (
        <ConfirmDialog
          title="Quantity Outside Expected Range"
          message={`The quantity entered (${parseFloat(quantityHarvested).toLocaleString()} kg) is outside the expected range of ${softLow?.toLocaleString()} – ${softHigh?.toLocaleString()} kg. This may indicate a data entry error. Do you want to proceed anyway?`}
          confirmLabel="Yes, Proceed"
          onConfirm={() => { setShowSoftConfirm(false); setShowConfirm(true) }}
          onCancel={() => setShowSoftConfirm(false)}
        />
      )}

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Harvest Record"
          message={`Are you sure you want to record the harvest for ${cropName}?`}
          confirmLabel="Yes, Record Harvest"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

// ── Delete Crop Record Modal ──────────────────────────────────────────────────

function DeleteCropRecordModal({ record, onClose, onDeleted }) {
  const { showToast } = useToast()
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting,  setIsDeleting]  = useState(false)

  const hasChildren = (record.log_count > 0) || (record.disasters_count > 0)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await api.delete(`/production/monitoring/${record.id}/`)
      showToast('Crop record deleted.', 'success')
      onDeleted()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to delete record.', 'error')
      setIsDeleting(false)
    }
  }

  if (!hasChildren) {
    return (
      <ConfirmDialog
        title="Delete Crop Record"
        message={`Are you sure you want to delete "${record.crop_type_name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={onClose}
      />
    )
  }

  return (
    <ModalShell title="Delete Crop Record" onClose={onClose} maxWidth="max-w-sm">
      <div className="space-y-3">
        <p className="text-[13px] text-[#4A5E4A]">
          This record has{' '}
          {record.log_count > 0 && `${record.log_count} activity log${record.log_count !== 1 ? 's' : ''}`}
          {record.log_count > 0 && record.disasters_count > 0 && ' and '}
          {record.disasters_count > 0 && `${record.disasters_count} disaster report${record.disasters_count !== 1 ? 's' : ''}`}.
          {' '}All will be permanently deleted.
        </p>
        <p className="text-[13px] font-medium text-[#1A2B1A]">
          Type <span className="font-mono font-bold">DELETE</span> to confirm:
        </p>
        <input
          className={baseInputClasses}
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder="Type DELETE"
          autoFocus
        />
        <div className="flex justify-end gap-2 pt-2 border-t border-[#F0F4F0]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirmText !== 'DELETE' || isDeleting}
            onClick={handleDelete}
            className="rounded-lg bg-rose-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting…' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Edit Crop Monitoring Record Modal ────────────────────────────────────────

function EditCropMonitoringModal({ record, onClose, onSaved }) {
  const { showToast } = useToast()
  const [form, setForm] = useState({
    date_planted:       record.date_planted       || '',
    area_planted_ha:    record.area_planted_ha     ? String(record.area_planted_ha) : '',
    season:             record.season              || 'Wet',
    current_growth_stage: record.current_growth_stage || '',
    variety_used:       record.variety_used        || '',
    land_status:        record.land_status         || '',
    notes:              record.notes               || '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const GROWTH_STAGES = ['Land Preparation','Planted','Vegetative','Flowering','Fruiting','Maturity','Near Harvest','Harvested']
  const LAND_STATUSES = ['Owner','Lessee','Tenant','Other']

  const handleSave = async () => {
    if (!form.date_planted) { showToast('Date planted is required.', 'error'); return }
    if (!form.area_planted_ha || parseFloat(form.area_planted_ha) <= 0) { showToast('Area planted must be greater than 0.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.patch(`/production/monitoring/${record.id}/`, {
        date_planted:          form.date_planted,
        area_planted_ha:       parseFloat(form.area_planted_ha),
        season:                form.season,
        current_growth_stage:  form.current_growth_stage,
        variety_used:          form.variety_used,
        land_status:           form.land_status,
        notes:                 form.notes,
      })
      showToast('Crop record updated.', 'success')
      onSaved()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to update record.', 'error')
    } finally { setIsSubmitting(false) }
  }

  const cropName = record.crop_type_name || 'Crop Record'

  return (
    <ModalShell
      title={`Edit — ${cropName}`}
      subtitle="Update crop monitoring record details"
      icon={Pencil}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Date Planted *</label>
            <input type="date" className={baseInputClasses} value={form.date_planted}
              onChange={e => setForm(f => ({ ...f, date_planted: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Season</label>
            <select className={baseInputClasses} value={form.season}
              onChange={e => setForm(f => ({ ...f, season: e.target.value }))}>
              <option value="Wet">Wet</option>
              <option value="Dry">Dry</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Area Planted (ha) *</label>
            <input type="number" step="0.0001" className={baseInputClasses} value={form.area_planted_ha}
              onChange={e => setForm(f => ({ ...f, area_planted_ha: e.target.value }))}
              placeholder="e.g. 2.50" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Land Status</label>
            <select className={baseInputClasses} value={form.land_status}
              onChange={e => setForm(f => ({ ...f, land_status: e.target.value }))}>
              <option value="">— Select —</option>
              {LAND_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Current Growth Stage</label>
          <select className={baseInputClasses} value={form.current_growth_stage}
            onChange={e => setForm(f => ({ ...f, current_growth_stage: e.target.value }))}>
            <option value="">— Select —</option>
            {GROWTH_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Variety Used</label>
          <input type="text" className={baseInputClasses} value={form.variety_used}
            onChange={e => setForm(f => ({ ...f, variety_used: e.target.value }))}
            placeholder="e.g. NSIC Rc 222" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Notes</label>
          <textarea rows={2} className={`${baseInputClasses} resize-none`} value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={isSubmitting}
            className="bg-[#1B4D2E] hover:bg-[#235E38] text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Helper ────────────────────────────────────────────────────────────────────

function isNearHarvest(row) {
  if (!row.expected_harvest_date) return false
  if (row.status === 'Harvested')  return false
  const today   = new Date()
  const harvest = new Date(row.expected_harvest_date)
  const diffDays = (harvest - today) / (1000 * 60 * 60 * 24)
  return diffDays <= 14
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'crop_cell',       label: 'CROP' },
  { key: 'farmer_col',      label: 'FARMER' },
  { key: 'association_col', label: 'ASSOCIATION' },
  { key: 'location_col',    label: 'BARANGAY' },
  { key: 'date_planted',    label: 'DATE PLANTED' },
  { key: 'logs_cell',       label: 'LOGS', center: true },
  { key: 'actions',         label: 'ACTIONS' },
]

export default function CropMonitoringPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [searchParams] = useSearchParams()

  const [records,          setRecords]          = useState([])
  const [totalCount,       setTotalCount]       = useState(0)
  const [page,             setPage]             = useState(1)
  const [isLoading,        setIsLoading]        = useState(true)
  const [error,            setError]            = useState('')
  const [search,           setSearch]           = useState('')
  const [statusFilter,     setStatusFilter]     = useState('Active')
  const [seasonFilter,     setSeasonFilter]     = useState('')
  const [yearFilter,       setYearFilter]       = useState('')
  const [barangayFilter,   setBarangayFilter]   = useState(() => searchParams.get('barangay') || '')
  const [viewLogsRecord,   setViewLogsRecord]   = useState(null)
  const [editRecord,       setEditRecord]       = useState(null)
  const [disasterRecord,   setDisasterRecord]   = useState(null)
  const [harvestRecord,    setHarvestRecord]    = useState(null)
  const [deleteRecord,     setDeleteRecord]     = useState(null)
  const dropdownRef = useRef(null)

  // Handle ?filter=for_harvest from dashboard
  useEffect(() => {
    const filter = searchParams.get('filter')
    if (filter === 'for_harvest') setStatusFilter('Active')
    const barangay = searchParams.get('barangay')
    if (barangay) setBarangayFilter(barangay)
  }, [])

  const fetchRecords = useCallback(async (pageNum = 1) => {
    setIsLoading(true); setError('')
    try {
      const params = statusFilter === 'all' ? { page: pageNum } : { status: statusFilter, page: pageNum }
      if (seasonFilter)   params.season   = seasonFilter
      if (yearFilter)     params.year     = yearFilter
      if (barangayFilter) params.barangay = barangayFilter
      const r = await api.get('/production/monitoring/', { params })
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
      setTotalCount(typeof r.data?.count === 'number' ? r.data.count : 0)
    } catch {
      setError('Failed to load crop monitoring records.')
    } finally { setIsLoading(false) }
  }, [statusFilter, seasonFilter, yearFilter, barangayFilter])

  useEffect(() => { setPage(1) }, [statusFilter, seasonFilter, yearFilter, barangayFilter])
  useEffect(() => { fetchRecords(page) }, [fetchRecords, page])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(rec =>
      !q
      || rec.crop_type_name?.toLowerCase().includes(q)
      || rec.association_name?.toLowerCase().includes(q)
    )
  }, [records, search])

  const rows = filtered.map(rec => ({
    ...rec,
    crop_cell: (
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{rec.crop_type_name}</span>
        {rec.disasters_count > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            <AlertTriangle className="w-2.5 h-2.5" /> {rec.disasters_count > 1 ? rec.disasters_count : 'Disaster'}
          </span>
        )}
        {rec.disasters_count === 0 && rec.has_resolved_disaster && (
          <span className="text-xs text-slate-400 border border-slate-200 rounded-full px-2 py-0.5 ml-2">
            Disaster resolved
          </span>
        )}
        {rec.status === 'Harvested' && (
          <span className="inline-flex text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            Harvested
          </span>
        )}
      </span>
    ),
    farmer_col: rec.farmer_name || rec.farmer_full_name
      ? <span className="flex items-center gap-1 text-[#1A2B1A]"><User className="w-3 h-3 text-[#7A8E7A] flex-shrink-0" />{rec.farmer_name || rec.farmer_full_name}</span>
      : <span className="text-[#A8BCA8]">—</span>,
    association_col: rec.association_name || '—',
    location_col: (rec.farm_location_barangay || rec.farmer_barangay)
      ? <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-[#7A8E7A] flex-shrink-0" />{rec.farm_location_barangay || rec.farmer_barangay}</span>
      : <span className="text-[#A8BCA8]">—</span>,
    logs_cell: rec.log_count ?? 0,
    actions: (
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          title="View Logs"
          onClick={() => setViewLogsRecord(rec)}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#1B4D2E] transition-colors"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          type="button"
          title="Edit Record"
          onClick={() => setEditRecord(rec)}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#1B4D2E] transition-colors"
        >
          <Pencil className="w-4 h-4" />
        </button>
        {rec.status !== 'Total Loss' && (
          <button
            type="button"
            title="Record Harvest"
            onClick={() => setHarvestRecord(rec)}
            className={`p-1.5 rounded-lg transition-colors ${
              isNearHarvest(rec)
                ? 'text-amber-600 hover:bg-amber-50'
                : 'text-slate-500 hover:bg-slate-100 hover:text-amber-600'
            }`}
          >
            <Wheat className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          title="Report Disaster"
          onClick={() => setDisasterRecord(rec)}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
        >
          <AlertTriangle className="w-4 h-4" />
        </button>
        {user?.role === 'ADMIN' && (
          <button
            type="button"
            title="Delete Record"
            onClick={() => setDeleteRecord(rec)}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    ),
  }))

  return (
    <PageLayout title="Crop Monitoring" subtitle="Track activities and progress for each crop.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 bg-white border border-[#E2E8E2] rounded-lg px-4 py-2.5">
          <span className="text-[#A8BCA8] flex-shrink-0">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </span>
          <input
            className="flex-1 min-w-[180px] border-none bg-transparent text-[13px] text-[#1A2B1A] placeholder-[#A8BCA8] focus:outline-none"
            placeholder="Search by crop or association..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            type="button"
            onClick={() => navigate('/crop-records?action=add')}
            className="flex items-center gap-1.5 rounded-lg border border-[#C8D5C8] px-3 py-[5px] text-[12px] font-medium text-[#4A5E4A] transition-colors hover:bg-[#F5F7F5]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Crop
          </button>
          <select
            className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[5px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="Active">Active Crops</option>
            <option value="Harvested">Harvested</option>
            <option value="Damaged">Damaged</option>
            <option value="Abandoned">Abandoned</option>
            <option value="all">All Status</option>
          </select>
          <select
            className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[5px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none"
            value={seasonFilter}
            onChange={e => setSeasonFilter(e.target.value)}
          >
            <option value="">All Seasons</option>
            <option value="Dry">Dry Season</option>
            <option value="Wet">Wet Season</option>
          </select>
          <select
            className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[5px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none"
            value={yearFilter}
            onChange={e => setYearFilter(e.target.value)}
          >
            <option value="">All Years</option>
            {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {barangayFilter && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#1B4D2E]/10 px-3 py-1 text-[12px] font-medium text-[#1B4D2E]">
              <MapPin className="w-3 h-3" />
              {barangayFilter}
              <button type="button" onClick={() => setBarangayFilter('')} className="ml-0.5 hover:text-rose-600">✕</button>
            </span>
          )}
        </div>

        {error && <ErrorMessage message={error} />}

        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1B4D2E] text-white">
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key}
                    className={`px-4 py-[11px] text-[11px] font-semibold uppercase tracking-[0.06em] ${col.center ? 'text-center' : 'text-left'}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#F0F4F0] animate-pulse">
                    {COLUMNS.map((col) => (
                      <td key={col.key} className="px-4 py-[13px]">
                        <div className="h-4 bg-[#E8EEE8] rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-[#C8D5C8]">
                      <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
                      <p className="text-[14px] font-medium text-[#4A5E4A]">No monitoring records found</p>
                      <p className="text-[13px] text-[#7A8E7A]">Add crop records to begin monitoring</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id} className="border-b border-[#F0F4F0] transition-colors hover:bg-[#F9FAF9]">
                    {COLUMNS.map(col => (
                      <td key={col.key}
                        className={`px-4 py-[13px] text-[13px] text-[#1A2B1A] align-middle ${col.center ? 'text-center' : ''}`}>
                        {row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}
          totalCount={totalCount}
          pageSize={10}
          onPageChange={setPage}
        />
      </div>

      {viewLogsRecord && (
        <ViewLogsModal
          record={viewLogsRecord}
          onClose={() => setViewLogsRecord(null)}
          onLogAdded={fetchRecords}
        />
      )}

      {disasterRecord && (
        <DisasterReportModal
          record={disasterRecord}
          onClose={() => setDisasterRecord(null)}
          onSuccess={fetchRecords}
        />
      )}

      {harvestRecord && (
        <RecordHarvestFromMonitoringModal
          record={harvestRecord}
          onClose={() => setHarvestRecord(null)}
          onSuccess={() => { setHarvestRecord(null); fetchRecords(page) }}
        />
      )}

      {deleteRecord && (
        <DeleteCropRecordModal
          record={deleteRecord}
          onClose={() => setDeleteRecord(null)}
          onDeleted={() => { setDeleteRecord(null); fetchRecords(page) }}
        />
      )}

      {editRecord && (
        <EditCropMonitoringModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={() => { setEditRecord(null); fetchRecords(page) }}
        />
      )}
    </PageLayout>
  )
}
