import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Bug, CheckCircle, CheckCircle2, Eye, FileText, HelpCircle, Leaf, Lock, MapPin, Pencil, Trash2, Unlock, User, Wheat,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DisasterIndicator from '../../components/UI/DisasterIndicator.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import GrowthProgressBar from '../../components/UI/GrowthProgressBar.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useRecordLock from '../../hooks/useRecordLock.js'

const todayISO = () => new Date().toISOString().slice(0, 10)

const filterSelectCls =
  'rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none'

const otherLabel = (value, specify) => (value === 'Other' && specify ? `Other — ${specify}` : value)

function formatMMSS(totalSeconds) {
  const s = Math.max(0, totalSeconds || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

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
  const [recovering, setRecovering] = useState(null)
  const [manualNotes, setManualNotes] = useState({})
  const [showManualRecover, setShowManualRecover] = useState({})

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

  const handleMarkRecovered = async (disasterId, note) => {
    setRecovering(disasterId)
    try {
      await api.post(`/production/disasters/${disasterId}/resolve/`, note ? { recovery_note: note } : {})
      showToast('Disaster marked as recovered.', 'success')
      fetchSuggestions()
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to mark disaster as recovered.'
      showToast(msg, 'error')
    } finally {
      setRecovering(null)
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
  const isEstimated   = data?.date_planted_is_estimated ?? false

  return (
    <ModalShell title={`Activity Suggestions — ${record.crop_type_name}`} onClose={onClose} maxWidth="max-w-lg">
      <div className={loading ? 'pointer-events-none opacity-50' : ''}>
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-8 h-8 border-4 border-[#1B4D2E] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {isEstimated ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <HelpCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                <strong>Estimated planting date.</strong> This record's planting date was imported from a
                registry record-creation date, not a confirmed field date, so day-based activity
                suggestions can't be calculated reliably. A staff member needs to confirm or correct the
                real planting date first.
              </p>
            </div>
          ) : (
            <>
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
            </>
          )}

          {/* Disaster response — grouped by active disaster (independent of
              date_planted, so still shown even when the planting date is
              only an estimate). */}
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
                              If the crop has recovered, mark this disaster as recovered. You can leave it active if you're still monitoring recovery.
                            </p>
                            <div className="flex gap-2 mt-2.5">
                              <button
                                onClick={() => handleMarkRecovered(disaster.disaster_id)}
                                disabled={recovering === disaster.disaster_id}
                                className="bg-[#1B4D2E] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#235E38] disabled:opacity-50"
                              >
                                Mark as Recovered
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
                                  onClick={() => { onApply({ activity_name: rule.activity_name || rule.title, recommendation: rule.recommendation || rule.action, status: 'disaster_rule', disaster_report_id: disaster.disaster_id, disaster_rule_id: rule.rule_id }); onClose() }}
                                  className="shrink-0 text-xs font-medium bg-rose-600 text-white px-3 py-1.5 rounded-lg hover:bg-rose-700 transition"
                                >
                                  Log
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-rose-100">
                        {disaster.is_total_loss ? (
                          <p className="text-xs text-slate-500 italic">Total Loss — this record is terminal and cannot be marked as recovered.</p>
                        ) : !showManualRecover[disaster.disaster_id] ? (
                          <button
                            onClick={() => setShowManualRecover(prev => ({ ...prev, [disaster.disaster_id]: true }))}
                            className="text-xs font-medium text-slate-600 hover:text-slate-800 underline"
                          >
                            Mark as Recovered anyway
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <textarea
                              value={manualNotes[disaster.disaster_id] || ''}
                              onChange={(e) => setManualNotes(prev => ({ ...prev, [disaster.disaster_id]: e.target.value }))}
                              placeholder="Explain how/why it recovered without completing all recommended responses (required)…"
                              rows={2}
                              className={`${baseInputClasses} text-xs`}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleMarkRecovered(disaster.disaster_id, manualNotes[disaster.disaster_id])}
                                disabled={recovering === disaster.disaster_id || !(manualNotes[disaster.disaster_id] || '').trim()}
                                className="bg-[#1B4D2E] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#235E38] disabled:opacity-50"
                              >
                                {recovering === disaster.disaster_id ? 'Marking…' : 'Confirm Recovery'}
                              </button>
                              <button
                                onClick={() => setShowManualRecover(prev => ({ ...prev, [disaster.disaster_id]: false }))}
                                className="text-xs text-slate-500 px-3 py-1.5 hover:text-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!isEstimated && suggestions.length === 0 && disasterRules.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">No activity stages defined for this crop type.</p>
          )}
        </div>
      )}
      </div>

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
  const recordLock = useRecordLock('crop', record.id, showForm)
  const [showSuggest,       setShowSuggest]       = useState(false)
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [pendingSuggestion, setPendingSuggestion] = useState(null)
  const [pendingDisasterReport, setPendingDisasterReport] = useState(null)
  const [pendingDisasterRule, setPendingDisasterRule] = useState(null)
  const [expandedDisasters, setExpandedDisasters] = useState(new Set())
  const [showHarvestEdit,   setShowHarvestEdit]   = useState(false)
  const [harvestDeleteConfirm, setHarvestDeleteConfirm] = useState(false)
  const [isDeletingHarvest, setIsDeletingHarvest] = useState(false)

  const isHarvested = record.status === 'Harvested'
  const isTotalLoss = record.status === 'Total Loss'

  // Form state
  const [activityType,    setActivityType]    = useState('')
  const [activityTypeOtherSpecify, setActivityTypeOtherSpecify] = useState('')
  const [activityDate,    setActivityDate]    = useState(todayISO())
  const [plantCondition,  setPlantCondition]  = useState('')
  const [fertilizerType,  setFertilizerType]  = useState('')
  const [quantityApplied, setQuantityApplied] = useState('')
  const [quantityUnit,    setQuantityUnit]    = useState('kg')
  const [pestDiseaseName, setPestDiseaseName] = useState('')
  const [areaAffected,    setAreaAffected]    = useState('')
  const [areaAffectedError, setAreaAffectedError] = useState('')
  const [severity,        setSeverity]        = useState('')
  const [notes,           setNotes]           = useState('')

  const [remedyDisasterId, setRemedyDisasterId] = useState('')

  const showFertilizerFields = activityType === 'Fertilizer Application'
  const showPestFields = activityType === 'Pest Control' || activityType === 'Disease Control'
  const showRemedyFields = activityType === 'Disaster Remedy'
  const activeDisasters = disasters.filter(d => d.status === 'Active')
  const plantedArea = record.area_planted_ha ? Number(record.area_planted_ha) : null

  const validateAreaAffected = (value) => {
    if (!value || value === '') return 'Area affected is required.'
    const n = parseFloat(value)
    if (isNaN(n) || n <= 0) return 'Area affected must be greater than 0.'
    if (plantedArea != null && n > plantedArea) {
      return `Area affected cannot exceed the ${plantedArea} ha planted.`
    }
    return ''
  }

  const PRE_PLANTING_ACTIVITIES = [
    'Soil Preparation & Leveling', 'Seed Bed Preparation',
    'Seed Planting', 'Land Preparation', 'Planting',
  ]
  const isPrePlanting = PRE_PLANTING_ACTIVITIES.includes(activityType)

  // ── Change 1: soft "Suggested now" ordering for the Activity dropdown ──────
  const [activityStages, setActivityStages] = useState([])
  const [activityTypeOptions, setActivityTypeOptions] = useState([])

  useEffect(() => {
    if (!record.crop_type) return
    api.get(`/production/crop-types/${record.crop_type}/stages/`)
      .then(r => setActivityStages(Array.isArray(r.data) ? r.data : (r.data.results || [])))
      .catch(() => setActivityStages([]))
  }, [record.crop_type])

  useEffect(() => {
    api.get('/production/activity-types/')
      .then(r => {
        const all = Array.isArray(r.data) ? r.data : (r.data.results || [])
        setActivityTypeOptions(all.filter(t => t.is_active).map(t => t.name))
      })
      .catch(() => setActivityTypeOptions([]))
  }, [])

  const suggestedNowActivities = useMemo(() => {
    if (!record.date_planted || activityStages.length === 0) return new Set()
    const loggedTypes = new Set(logs.map(l => l.activity_type))
    const planted = new Date(record.date_planted + 'T00:00:00')
    const referenceDate = activityDate || todayISO()
    const current = new Date(referenceDate + 'T00:00:00')
    const currentDay = Math.floor((current - planted) / (1000 * 60 * 60 * 24))
    const applicable = new Set()
    activityStages.forEach(stage => {
      const days = (stage.application_days && stage.application_days.length)
        ? stage.application_days
        : [stage.day_after_planting]
      const dueNow = days.some(d => Math.abs(d - currentDay) <= 7)
      const overdueUnlogged = days.some(d => (currentDay - d) > 7) && !loggedTypes.has(stage.stage_name)
      if (dueNow || overdueUnlogged) applicable.add(stage.stage_name)
    })
    return applicable
  }, [activityStages, activityDate, record.date_planted, logs])

  const suggestedActivityOptions = activityTypeOptions.filter(o => suggestedNowActivities.has(o))
  const otherActivityOptions = activityTypeOptions.filter(o => !suggestedNowActivities.has(o))

  // Land-prep-style activities may be logged before date_planted; everything else may not.
  const selectedStageAllowsPrePlanting = useMemo(() => {
    const stage = activityStages.find(s => s.stage_name === activityType)
    return !!stage?.allows_pre_planting
  }, [activityStages, activityType])

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
    return [...logEvents.map(l => ({ ...l, _sortDate: l.date_of_activity })), ...disEvents]
      .sort((a, b) => new Date(b._sortDate || 0) - new Date(a._sortDate || 0))
  }, [logs, disasters])

  const resetForm = () => {
    setActivityType(''); setActivityDate(todayISO()); setPlantCondition('')
    setFertilizerType(''); setQuantityApplied(''); setQuantityUnit('kg')
    setActivityTypeOtherSpecify('')
    setRemedyDisasterId('')
    setPestDiseaseName(''); setAreaAffected(''); setAreaAffectedError(''); setSeverity(''); setNotes('')
    setPendingSuggestion(null)
    setPendingDisasterReport(null)
    setPendingDisasterRule(null)
  }

  const handleSubmitClick = () => {
    if (!activityType) { showToast('Please select an activity.', 'error'); return }
    if (activityType === 'Other' && !activityTypeOtherSpecify.trim()) { showToast('Please specify the activity.', 'error'); return }
    if (!activityDate) { showToast('Activity date is required.', 'error'); return }
    if (showPestFields) {
      const err = validateAreaAffected(areaAffected)
      if (err) { setAreaAffectedError(err); showToast(err, 'error'); return }
    }
    if (showRemedyFields) {
      if (!remedyDisasterId) { showToast('Please select the related disaster.', 'error'); return }
      if (!notes.trim()) { showToast('Please describe the remedy performed.', 'error'); return }
    }
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false); setIsSubmitting(true)
    try {
      await api.post(`/production/monitoring/${record.id}/logs/`, {
        activity_type:     activityType,
        activity_type_other_specify: activityType === 'Other' ? activityTypeOtherSpecify.trim() : '',
        date_of_activity:   activityDate,
        plant_condition:   plantCondition,
        fertilizer_type:   showFertilizerFields ? fertilizerType : '',
        quantity_applied:  showFertilizerFields ? (quantityApplied || null) : null,
        quantity_unit:     showFertilizerFields ? quantityUnit : '',
        pest_disease_name: showPestFields ? pestDiseaseName : '',
        area_affected_ha:  showPestFields ? (areaAffected || null) : null,
        severity:          showPestFields ? severity : '',
        notes,
        target_day: pendingSuggestion?.occurrence_day ?? null,
        disaster_report: showRemedyFields ? parseInt(remedyDisasterId, 10) : pendingDisasterReport,
        disaster_rule:   showRemedyFields ? null : pendingDisasterRule,
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
    setPendingDisasterReport(s.disaster_report_id || null)
    setPendingDisasterRule(s.disaster_rule_id || null)
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
      showToast('Harvest record deleted. Crop status reverted.', 'success')
      onLogAdded()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to delete harvest record.', 'error')
      setIsDeletingHarvest(false)
    }
  }

  const assocLabel = record.organization_name || record.farmer_name || '—'
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
            {recordLock.lockedByOther && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  🔒 <strong>{recordLock.lockedByOther.name}</strong> is currently logging this record.
                  You&apos;ll be able to log once they finish (auto-unlocks in ~{formatMMSS(recordLock.secondsRemaining)}).
                </p>
              </div>
            )}
            {!recordLock.lockedByOther && <>
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
                {/* Batch B: was a grouped <select> ("Suggested now" / "Other
                    activities" optgroups, with a "· due" label suffix on
                    suggested entries) — ComboboxWithOther takes a flat
                    option list, so the two groups are flattened into one
                    ordered list (suggested-first, same as before) and the
                    "· due" annotation is dropped since it was display-only
                    and had no separate label/value slot to live in here.
                    The selectable values and their priority order are
                    unchanged. */}
                <ComboboxWithOther
                  options={[...suggestedActivityOptions, ...otherActivityOptions].filter(o => o !== 'Other')}
                  value={activityType}
                  otherValue={activityTypeOtherSpecify}
                  onChange={(newType) => {
                    setActivityType(newType)
                    if (PRE_PLANTING_ACTIVITIES.includes(newType)) setPlantCondition('')
                    setPendingSuggestion(null)
                  }}
                  onOtherChange={setActivityTypeOtherSpecify}
                  placeholder="Select Activity"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Date of Activity *</label>
                <input type="date" className={baseInputClasses} value={activityDate}
                  max={todayISO()} min={selectedStageAllowsPrePlanting ? undefined : (record.date_planted || undefined)}
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
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Area Affected (ha) *</label>
                    <input type="number" step="0.0001" value={areaAffected}
                      onChange={e => {
                        setAreaAffected(e.target.value)
                        setAreaAffectedError(validateAreaAffected(e.target.value))
                      }}
                      placeholder="e.g. 1.50"
                      className={`${baseInputClasses} ${areaAffectedError ? 'border-rose-400' : ''}`} />
                    {areaAffectedError ? (
                      <p className="mt-1 text-[11px] font-medium text-rose-600">{areaAffectedError}</p>
                    ) : plantedArea != null ? (
                      <p className="mt-1 text-[11px] text-slate-500">Planted area: {plantedArea} ha</p>
                    ) : null}
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

            {/* Disaster Remedy fields */}
            {showRemedyFields && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-rose-800 mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Disaster Remedy Details
                </p>
                <div className="mb-2">
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Related Disaster *</label>
                  <select className={baseInputClasses} value={remedyDisasterId}
                    onChange={e => setRemedyDisasterId(e.target.value)}>
                    <option value="">Select disaster</option>
                    {activeDisasters.map(d => (
                      <option key={d.id} value={d.id}>
                        {otherLabel(d.disaster_type, d.disaster_type_other_specify)} — reported {fmtDate(d.date_of_occurrence)}
                      </option>
                    ))}
                  </select>
                  {activeDisasters.length === 0 && (
                    <p className="mt-1 text-[11px] text-rose-600">No active disaster reports on this record.</p>
                  )}
                </div>
                <p className="text-[11px] text-rose-500">
                  This remedy will not automatically satisfy any recommended response rule — describe it in the Notes field below.
                </p>
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
              <label className="mb-1 block text-xs font-medium text-slate-700">
                {showRemedyFields ? 'Remedy Performed *' : 'Recommendations'}
              </label>
              <textarea rows={3} className={`${baseInputClasses} resize-none`}
                placeholder={showRemedyFields ? 'Describe the remedy performed' : 'Recommendations (optional)'}
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            <button type="button" disabled={isSubmitting} onClick={handleSubmitClick}
              className="w-full rounded-xl bg-[#1B4D2E] py-2.5 text-sm font-medium text-white hover:bg-[#235E38] disabled:opacity-60">
              {isSubmitting ? 'Saving…' : 'Add Log'}
            </button>
            </>}
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
                const hasDetails = event.area_affected_ha || event.estimated_damage || event.production_loss || event.photo
                const isRecovered = event.status === 'Recovered'
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
                        <span className={`flex items-center gap-1.5 text-sm font-semibold ${isRecovered ? 'text-emerald-700' : 'text-rose-700'}`}>
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {otherLabel(event.disaster_type, event.disaster_type_other_specify)} — Disaster Report
                          {isRecovered ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Recovered</span>
                          ) : (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Active</span>
                          )}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-xs ${isRecovered ? 'text-emerald-500' : 'text-rose-400'}`}>{fmtDate(event.date_of_occurrence)}</span>
                          {hasDetails && (
                            <span className={`text-xs ${isRecovered ? 'text-emerald-400' : 'text-rose-300'}`}>
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          )}
                        </div>
                      </div>
                      {isRecovered && event.recovered_date && (
                        <p className="text-xs text-emerald-600 mt-0.5">
                          Recovered on {fmtDate(event.recovered_date)}{event.recovered_by_name ? ` by ${event.recovered_by_name}` : ''}
                        </p>
                      )}
                      {!isExpanded && event.area_affected_ha && (
                        <p className={`text-xs mt-0.5 ${isRecovered ? 'text-emerald-500' : 'text-rose-500'}`}>Area: {event.area_affected_ha} ha</p>
                      )}
                    </button>
                    {isExpanded && (
                      <div className={`mt-1.5 rounded-lg border px-3 py-2 space-y-1 ${
                        isRecovered ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-100'
                      }`}>
                        {isRecovered && event.recovered_date && (
                          <p className="text-xs text-emerald-700"><span className="font-medium">Recovered on:</span> {fmtDate(event.recovered_date)}{event.recovered_by_name ? ` by ${event.recovered_by_name}` : ''}</p>
                        )}
                        {isRecovered && event.recovery_note && (
                          <p className="text-xs text-emerald-700"><span className="font-medium">Recovery note:</span> {event.recovery_note}</p>
                        )}
                        {event.area_affected_ha && (
                          <p className={`text-xs ${isRecovered ? 'text-emerald-700' : 'text-rose-700'}`}><span className="font-medium">Area affected:</span> {event.area_affected_ha} ha</p>
                        )}
                        {event.estimated_damage && (
                          <p className={`text-xs ${isRecovered ? 'text-emerald-700' : 'text-rose-700'}`}><span className="font-medium">Damage:</span> {event.estimated_damage}</p>
                        )}
                        {event.production_loss && (
                          <p className={`text-xs ${isRecovered ? 'text-emerald-700' : 'text-rose-700'}`}><span className="font-medium">Production loss:</span> {event.production_loss}</p>
                        )}
                        {event.photo && (
                          <p className={`text-xs ${isRecovered ? 'text-emerald-700' : 'text-rose-700'}`}>
                            <span className="font-medium">Photo:</span>{' '}
                            <a href={event.photo} target="_blank" rel="noreferrer" className="underline">View photo</a>
                          </p>
                        )}
                        {!hasDetails && (
                          <p className={`text-xs italic ${isRecovered ? 'text-emerald-400' : 'text-rose-400'}`}>No additional details recorded.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              }
              const log = event
              const remedyDisaster = log.activity_type === 'Disaster Remedy' && log.disaster_report
                ? disasters.find(d => d.id === log.disaster_report)
                : null
              return (
                <div key={`l-${log.id}`} className={`py-3 ${remedyDisaster ? 'border-l-2 border-rose-300 pl-3 -ml-px' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{otherLabel(log.activity_type, log.activity_type_other_specify)}</span>
                    <span className="shrink-0 text-xs text-slate-400">{fmtDate(log.date_of_activity)}</span>
                  </div>
                  {remedyDisaster && (
                    <p className="text-xs text-rose-600 mt-0.5">
                      Remedy for: {otherLabel(remedyDisaster.disaster_type, remedyDisaster.disaster_type_other_specify)} reported {fmtDate(remedyDisaster.date_of_occurrence)}
                    </p>
                  )}
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
          message="This will permanently delete the harvest record and revert this crop's status. This cannot be undone."
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
                max={todayISO()}
                onChange={e => { handleChange('harvest_start_date', e.target.value); setDateError('') }} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Harvest End Date</label>
              <input type="date" className={baseInputClasses} value={form.harvest_end_date}
                min={form.harvest_start_date || undefined}
                max={todayISO()}
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
  const [disasterTypeOtherSpecify, setDisasterTypeOtherSpecify] = useState('')
  const [dateOfOccurrence,  setDateOfOccurrence]  = useState(todayISO())
  const [areaAffectedHa,    setAreaAffectedHa]    = useState('')
  const [estimatedDamage,   setEstimatedDamage]   = useState('')
  const [productionLoss,    setProductionLoss]    = useState('')
  const [isTotalLoss,       setIsTotalLoss]       = useState(false)
  const [photo,             setPhoto]             = useState(null)
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
    if (disasterType === 'Other' && !disasterTypeOtherSpecify.trim()) { showToast('Please specify the disaster type.', 'error'); return }
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
      const fields = {
        disaster_type:      disasterType,
        disaster_type_other_specify: disasterType === 'Other' ? disasterTypeOtherSpecify.trim() : '',
        date_of_occurrence: dateOfOccurrence,
        area_affected_ha:   parseFloat(isTotalLoss && maxArea ? maxArea : areaAffectedHa),
        estimated_damage:   estimatedDamage,
        production_loss:    productionLoss,
        is_total_loss:      isTotalLoss,
      }
      let payload = fields
      if (photo) {
        payload = new FormData()
        Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined) payload.append(k, v) })
        payload.append('photo', photo)
      }
      await api.post(`/production/monitoring/${record.id}/disasters/`, payload)
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
          <GrowthProgressBar
            startLabel="Planted"
            startDate={record.date_planted}
            expectedHarvestDate={record.expected_harvest_date}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Disaster Type *</label>
            <ComboboxWithOther
              options={['Drought', 'Flood', 'Typhoon', 'Strong Winds', 'Pest Outbreak']}
              value={disasterType}
              otherValue={disasterTypeOtherSpecify}
              onChange={setDisasterType}
              onOtherChange={setDisasterTypeOtherSpecify}
              placeholder="Select type"
            />
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
              className={`${baseInputClasses} ${areaError ? 'border-rose-400' : ''} ${isTotalLoss ? 'bg-slate-100 cursor-not-allowed' : ''}`}
              value={isTotalLoss && maxArea ? maxArea : areaAffectedHa}
              onChange={e => { setAreaAffectedHa(e.target.value); setAreaError(validateArea(e.target.value)) }}
              disabled={isTotalLoss}
              placeholder={maxArea ? `0.01 – ${maxArea}` : 'e.g. 2.50'} />
            {areaError && <p className="mt-1 text-xs text-rose-600">{areaError}</p>}
            {!areaError && maxArea && !isTotalLoss && (
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

          <label className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isTotalLoss}
              onChange={e => {
                setIsTotalLoss(e.target.checked)
                if (e.target.checked && maxArea) {
                  setAreaAffectedHa(String(maxArea))
                  setAreaError('')
                }
              }}
              className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
            />
            <div>
              <span className="text-sm font-medium text-rose-800">Total loss — crop completely destroyed</span>
              <p className="text-xs text-rose-500 mt-0.5">This ends the production cycle. No harvest can be recorded.</p>
            </div>
          </label>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Photo (optional)</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" className={baseInputClasses}
              onChange={e => setPhoto(e.target.files?.[0] || null)} />
            <p className="mt-1 text-xs text-slate-400">JPG, PNG, or WEBP, up to 5 MB.</p>
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
  const [unitOfMeasure,     setUnitOfMeasure]     = useState(
    (record.crop_allowed_units && record.crop_allowed_units.length > 0) ? record.crop_allowed_units[0] : 'kg'
  )
  const [quantityHarvested, setQuantityHarvested] = useState('')
  const [harvestNotes,      setHarvestNotes]      = useState('')
  const [earlyLateReason,   setEarlyLateReason]   = useState('')
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [dateError,         setDateError]         = useState('')
  const [areaError,         setAreaError]         = useState('')
  const [quantityError,     setQuantityError]     = useState('')
  const [resolvableDisasters, setResolvableDisasters] = useState([])
  const [dismissedDisasterIds, setDismissedDisasterIds] = useState(new Set())
  const [recoveringId,      setRecoveringId]      = useState(null)

  useEffect(() => {
    api.get(`/production/monitoring/${record.id}/suggestions/`)
      .then(r => {
        const ready = (r.data.disaster_response || []).filter(d => d.status !== 'Recovered' && d.all_rules_done)
        setResolvableDisasters(ready)
      })
      .catch(() => {})
  }, [record.id])

  const handleMarkRecovered = async (disasterId) => {
    setRecoveringId(disasterId)
    try {
      await api.post(`/production/disasters/${disasterId}/resolve/`)
      showToast('Disaster marked as recovered.', 'success')
      setResolvableDisasters(prev => prev.filter(d => d.disaster_id !== disasterId))
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to mark disaster as recovered.', 'error')
    } finally {
      setRecoveringId(null)
    }
  }

  const visibleResolvableDisasters = resolvableDisasters.filter(d => !dismissedDisasterIds.has(d.disaster_id))

  const cropName     = record.crop_type_name || 'this crop'
  const unitOptions  = (record.crop_allowed_units && record.crop_allowed_units.length > 0)
    ? record.crop_allowed_units
    : ['kg']

  const expectedHarvestDate = record.expected_harvest_date || null
  const daysFromNowToExpected = expectedHarvestDate
    ? Math.round((new Date(expectedHarvestDate + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000)
    : null
  const harvestVarianceDays = (expectedHarvestDate && harvestStartDate)
    ? Math.round((new Date(harvestStartDate + 'T00:00:00') - new Date(expectedHarvestDate + 'T00:00:00')) / 86400000)
    : null
  const isEarly = harvestVarianceDays !== null && harvestVarianceDays < -7
  const isLate = harvestVarianceDays !== null && harvestVarianceDays > 7
  const reasonRequired = isEarly || isLate
  const EARLY_REASONS = ['Emergency harvest — disaster damage', 'Buyer demand', 'Crop matured early', 'Other']
  const LATE_REASONS = ['Delayed field visit', 'Weather', 'Labor unavailable', 'Other']

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
    return ''
  }

  const validateQuantity = (val) => {
    if (!val) return 'Quantity harvested is required.'
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return 'Quantity must be greater than 0.'
    return ''
  }

  const handleSubmitClick = () => {
    if (!harvestStartDate) { showToast('Harvest start date is required.', 'error'); return }
    const aErr = validateArea(areaHarvested)
    const qErr = validateQuantity(quantityHarvested)
    setAreaError(aErr)
    setQuantityError(qErr)
    if (aErr || qErr || dateError) return
    if (reasonRequired && !earlyLateReason.trim()) {
      showToast(`A reason is required — this harvest is ${Math.abs(harvestVarianceDays)} days ${isEarly ? 'early' : 'late'}.`, 'error')
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
        early_late_reason:       reasonRequired ? earlyLateReason.trim() : '',
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
          {visibleResolvableDisasters.map(d => (
            <div key={d.disaster_id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-800 mb-2">
                This crop has an active <span className="font-semibold">{d.disaster_type}</span> with all recommended responses completed. Mark it recovered now?
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={recoveringId === d.disaster_id}
                  onClick={() => handleMarkRecovered(d.disaster_id)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                  {recoveringId === d.disaster_id ? 'Marking…' : 'Mark Recovered'}
                </button>
                <button type="button"
                  onClick={() => setDismissedDisasterIds(prev => new Set(prev).add(d.disaster_id))}
                  className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                  Keep Active
                </button>
              </div>
            </div>
          ))}

          {expectedHarvestDate && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Expected harvest: <span className="font-medium text-slate-800">{expectedHarvestDate}</span>{' '}
              ({daysFromNowToExpected >= 0
                ? `${daysFromNowToExpected} day${daysFromNowToExpected !== 1 ? 's' : ''} from now`
                : `${Math.abs(daysFromNowToExpected)} day${Math.abs(daysFromNowToExpected) !== 1 ? 's' : ''} ago`})
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Harvest Start Date *</label>
              <input type="date" className={baseInputClasses} value={harvestStartDate}
                max={todayISO()}
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
                max={todayISO()}
                onChange={e => handleEndDateChange(e.target.value)} />
            </div>
          </div>
          {dateError && <p className="text-xs font-medium text-rose-600">{dateError}</p>}

          {reasonRequired && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800 mb-2">
                This is {Math.abs(harvestVarianceDays)} days {isEarly ? 'earlier' : 'later'} than the expected harvest date.
              </p>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Reason for {isEarly ? 'early' : 'late'} harvest *
              </label>
              <input
                type="text"
                list="harvest-reason-options"
                className={baseInputClasses}
                value={earlyLateReason}
                onChange={e => setEarlyLateReason(e.target.value)}
                placeholder="Select or type a reason"
              />
              <datalist id="harvest-reason-options">
                {(isEarly ? EARLY_REASONS : LATE_REASONS).map(r => <option key={r} value={r} />)}
              </datalist>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Area Harvested (ha) *</label>
              <input type="number" step="0.0001"
                className={`${baseInputClasses} ${areaError ? 'border-rose-400' : ''}`}
                value={areaHarvested}
                onChange={e => { setAreaHarvested(e.target.value); setAreaError(validateArea(e.target.value)) }}
                placeholder="e.g. 2.50" />
              {areaError && <p className="mt-1 text-xs text-rose-600">{areaError}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Unit of Measure *</label>
              <select className={baseInputClasses} value={unitOfMeasure}
                onChange={e => setUnitOfMeasure(e.target.value)}>
                {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
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
            {quantityError && <p className="mt-1 text-xs text-rose-600">{quantityError}</p>}
          </div>

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
            <button type="button" onClick={handleSubmitClick}
              disabled={isSubmitting || (reasonRequired && !earlyLateReason.trim())}
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
              {isSubmitting ? 'Saving…' : 'Save Harvest Record'}
            </button>
          </div>
        </div>
      </ModalShell>

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

// ── Helper ────────────────────────────────────────────────────────────────────

function isNearHarvest(row) {
  if (!row.expected_harvest_date) return false
  if (row.status === 'Harvested')  return false
  const today   = new Date()
  const harvest = new Date(row.expected_harvest_date)
  const diffDays = (harvest - today) / (1000 * 60 * 60 * 24)
  return diffDays <= 14
}

// Mirrors core.utils.harvest_gate_status AND HarvestRecordCreateView.create()'s
// date_planted_is_estimated block on the backend (the real enforcement — this
// is client-side UX only, to explain the gate before the user even opens the
// modal rather than after a rejected submit).
function harvestGateInfo(row) {
  if (row.date_planted_is_estimated) {
    return {
      gated: true,
      message: 'This record’s planting date is an estimate (imported from a registry record, ' +
        'not a confirmed field date). Harvest cannot be recorded until a staff member confirms or ' +
        'corrects the real planting date.',
    }
  }
  if (!row.date_planted || !row.expected_harvest_date) return { gated: false, message: null }
  const planted = new Date(row.date_planted + 'T00:00:00')
  const expected = new Date(row.expected_harvest_date + 'T00:00:00')
  const totalDays = (expected - planted) / (1000 * 60 * 60 * 24)
  if (totalDays <= 0) return { gated: false, message: null }
  const halfwayDays = totalDays / 2
  const elapsedDays = (new Date() - planted) / (1000 * 60 * 60 * 24)
  if (elapsedDays >= halfwayDays) return { gated: false, message: null }
  const daysRemaining = Math.ceil(halfwayDays - elapsedDays)
  return {
    gated: true,
    message: `Harvest can only be recorded once at least half the expected growth duration has passed. Available in about ${daysRemaining} more day(s).`,
  }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// Mirrors FisheriesRecordsPage's own STATUS_TONES exactly (Stocked/Planted
// both green as the initial active state) so the two domains' status
// columns read as one consistent system, not two independently-invented ones.
const STATUS_TONES = {
  Planted:        'green',
  'Near Harvest': 'amber',
  Harvested:      'blue',
  'Total Loss':   'rose',
}

const COLUMNS = [
  { key: 'crop_cell',       label: 'CROP' },
  { key: 'farmer_col',      label: 'FARMER' },
  { key: 'organization_col', label: 'ORGANIZATION' },
  { key: 'location_col',    label: 'BARANGAY' },
  { key: 'date_planted',    label: 'DATE PLANTED' },
  { key: 'logs_cell',       label: 'LOGS', center: true },
  { key: 'status_cell',     label: 'STATUS' },
  { key: 'actions',         label: 'ACTIONS' },
]

export default function CropMonitoringPage() {
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()

  const [records,          setRecords]          = useState([])
  const [totalCount,       setTotalCount]       = useState(0)
  const [page,             setPage]             = useState(1)
  const [isLoading,        setIsLoading]        = useState(true)
  const [error,            setError]            = useState('')
  const [search,           setSearch]           = useState('')
  const [statusFilter,     setStatusFilter]     = useState('Planted,Near Harvest')
  const [seasonFilter,     setSeasonFilter]     = useState('')
  const [yearFilter,       setYearFilter]       = useState('')
  const [barangayFilter,   setBarangayFilter]   = useState(() => searchParams.get('barangay') || '')
  const [viewLogsRecord,   setViewLogsRecord]   = useState(null)
  const [disasterRecord,   setDisasterRecord]   = useState(null)
  const [harvestRecord,    setHarvestRecord]    = useState(null)

  // Handle ?filter=for_harvest from dashboard
  useEffect(() => {
    const filter = searchParams.get('filter')
    if (filter === 'for_harvest') setStatusFilter('Near Harvest')
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

  // Lock indicators for the currently-visible page only — bounded to page
  // size, not a full-table N+1 poll.
  const [lockStatuses, setLockStatuses] = useState({})
  const { isAdmin } = useAuth()

  const refreshLockStatuses = useCallback(async (recs) => {
    if (!recs.length) { setLockStatuses({}); return }
    const entries = await Promise.all(recs.map(async rec => {
      try {
        const r = await api.get('/locks/status/', { params: { record_type: 'crop', record_id: rec.id } })
        return [rec.id, r.data.locked ? r.data : null]
      } catch { return [rec.id, null] }
    }))
    setLockStatuses(Object.fromEntries(entries.filter(([, v]) => v)))
  }, [])

  useEffect(() => { refreshLockStatuses(records) }, [records, refreshLockStatuses])

  const handleForceUnlock = async (recordId) => {
    try {
      await api.post('/locks/release/', { record_type: 'crop', record_id: recordId })
      refreshLockStatuses(records)
    } catch { /* ignore */ }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(rec =>
      !q
      || rec.crop_type_name?.toLowerCase().includes(q)
      || rec.organization_name?.toLowerCase().includes(q)
    )
  }, [records, search])

  const rows = filtered.map(rec => ({
    ...rec,
    crop_cell: (
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{rec.crop_type_name}</span>
        {lockStatuses[rec.id] && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 whitespace-nowrap"
            title={`Locked by ${lockStatuses[rec.id].locked_by?.name || 'another user'}`}
          >
            <Lock className="w-2.5 h-2.5" /> {lockStatuses[rec.id].locked_by?.name}
          </span>
        )}
      </span>
    ),
    status_cell: (
      <span className="flex items-center gap-1.5">
        <StatusPill tone={STATUS_TONES[rec.status] || 'slate'}>{rec.status}</StatusPill>
        <DisasterIndicator disastersCount={rec.disasters_count} hasRecoveredDisaster={rec.has_recovered_disaster} />
      </span>
    ),
    farmer_col: rec.farmer_name || rec.farmer_full_name
      ? <span className="flex items-center gap-1 text-[#1A2B1A]"><User className="w-3 h-3 text-[#7A8E7A] flex-shrink-0" />{rec.farmer_name || rec.farmer_full_name}</span>
      : <span className="text-[#A8BCA8]">—</span>,
    organization_col: rec.organization_name || '—',
    date_planted: rec.date_planted_is_estimated ? (
      <span className="flex flex-col gap-0.5">
        <span>{rec.date_planted}</span>
        <span
          className="inline-flex w-fit items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 whitespace-nowrap"
          title="Imported from a registry record-creation date, not a confirmed field date."
        >
          <HelpCircle className="w-2.5 h-2.5" /> Estimated
        </span>
      </span>
    ) : (rec.date_planted || '—'),
    location_col: (rec.farm_location_barangay || rec.farmer_barangay)
      ? <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-[#7A8E7A] flex-shrink-0" />{rec.farm_location_barangay || rec.farmer_barangay}</span>
      : <span className="text-[#A8BCA8]">—</span>,
    logs_cell: rec.log_count ?? 0,
    // Most rows offer 3 (View Logs, Record Harvest, Report Disaster) -> ⋮.
    // Once Harvested/Total Loss, Record Harvest drops out, leaving 2 (View
    // Logs, Report Disaster) — RowActions' own action-count rule still
    // renders that as a ⋮, same per-row logic as CropInformationPage's menu.
    actions: (
      <RowActions
        actions={[
          { key: 'logs', label: 'View Logs', icon: Eye, onClick: () => setViewLogsRecord(rec) },
          rec.status !== 'Total Loss' && rec.status !== 'Harvested' && (() => {
            const gate = harvestGateInfo(rec)
            return {
              key: 'harvest',
              label: gate.gated ? 'Record Harvest (Not Yet Available)' : 'Record Harvest',
              icon: Wheat,
              onClick: () => (gate.gated ? showToast(gate.message, 'error') : setHarvestRecord(rec)),
              tone: gate.gated ? 'default' : (isNearHarvest(rec) ? 'amber' : 'default'),
            }
          })(),
          { key: 'disaster', label: 'Report Disaster', icon: AlertTriangle, onClick: () => setDisasterRecord(rec), tone: 'rose' },
          isAdmin && lockStatuses[rec.id] && {
            key: 'unlock', label: `Force Unlock (${lockStatuses[rec.id].locked_by?.name || 'locked'})`, icon: Unlock,
            onClick: () => handleForceUnlock(rec.id), tone: 'amber',
          },
        ]}
      />
    ),
  }))

  return (
    <PageLayout title="Crop Monitoring" subtitle="Track activities and progress for each crop.">
      <div className="space-y-4">
        <FilterPanel
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by crop or organization..."
          activeCount={[statusFilter !== 'Planted,Near Harvest', Boolean(seasonFilter), Boolean(yearFilter), Boolean(barangayFilter)].filter(Boolean).length}
        >
          <select className={filterSelectCls} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="Planted,Near Harvest">Active Crops</option>
            <option value="Near Harvest">Near Harvest</option>
            <option value="Harvested">Harvested</option>
            <option value="Total Loss">Total Loss</option>
            <option value="all">All Status</option>
          </select>
          <select className={filterSelectCls} value={seasonFilter} onChange={e => setSeasonFilter(e.target.value)}>
            <option value="">All Seasons</option>
            <option value="Dry">Dry Season</option>
            <option value="Wet">Wet Season</option>
          </select>
          <select className={filterSelectCls} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
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
        </FilterPanel>

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

    </PageLayout>
  )
}
