import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Bug, CheckCircle, CheckCircle2, Fish, Lock, Wheat,
} from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import GrowthProgressBar from '../../components/UI/GrowthProgressBar.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const todayISO = () => new Date().toISOString().slice(0, 10)

const otherLabel = (value, specify) => (value === 'Other' && specify ? `Other — ${specify}` : value)

const ACTIVITY_OPTIONS = [
  'Pond Preparation', 'Stocking', 'Feed Monitoring', 'Water Quality Check',
  'Sampling', 'Disease Control', 'Pre-Harvest Inspection', 'Harvesting',
  'Disaster Remedy', 'Other',
]

function fmtDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

// ── Suggestions Modal ─────────────────────────────────────────────────────────

export function StockingSuggestionsModal({ record, onClose, onApply }) {
  const { showToast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [earlyConfirm, setEarlyConfirm] = useState(null)
  const [dismissedDisasters, setDismissedDisasters] = useState(new Set())
  const [resolving, setResolving] = useState(null)

  const fetchSuggestions = useCallback(() => {
    if (!record) return
    setLoading(true)
    api.get(`/fisheries/stocking/${record.id}/suggestions/`)
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
      await api.post(`/fisheries/disasters/${disasterId}/resolve/`)
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
    <ModalShell title={`Activity Suggestions — ${record.species_name}`} onClose={onClose} maxWidth="max-w-lg">
      <div className={loading ? 'pointer-events-none opacity-50' : ''}>
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-8 h-8 border-4 border-[#1B4D2E] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Progress bar */}
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Culture Progress</span>
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
                              Day {s.day_after_stocking}
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
                              If the stock has recovered, mark this disaster as resolved. You can leave it active if you're still monitoring recovery.
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
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {suggestions.length === 0 && disasterRules.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">No activity stages defined for this species.</p>
          )}
        </div>
      )}
      </div>

      {earlyConfirm && (
        <ConfirmDialog
          title="Log Activity Early?"
          message={`"${earlyConfirm.activity_name}" is scheduled for Day ${earlyConfirm.day_after_stocking}. It's ${Math.abs(earlyConfirm.days_diff)} day${Math.abs(earlyConfirm.days_diff) !== 1 ? 's' : ''} away. Log it now anyway?`}
          confirmLabel="Yes, Log Early"
          onConfirm={() => { setEarlyConfirm(null); onApply(earlyConfirm); onClose() }}
          onCancel={() => setEarlyConfirm(null)}
        />
      )}
    </ModalShell>
  )
}

// ── View Logs Modal ───────────────────────────────────────────────────────────

export function ViewStockingLogsModal({ record, onClose, onLogAdded }) {
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
  const [pendingDisasterReport, setPendingDisasterReport] = useState(null)
  const [pendingDisasterRule, setPendingDisasterRule] = useState(null)
  const [expandedDisasters, setExpandedDisasters] = useState(new Set())

  const isHarvested  = record.status === 'Harvested'
  const isTotalLoss  = record.status === 'Total Loss'

  // Form state
  const [activityType,     setActivityType]     = useState('')
  const [activityTypeOtherSpecify, setActivityTypeOtherSpecify] = useState('')
  const [activityDate,     setActivityDate]     = useState(todayISO())
  const [waterCondition,   setWaterCondition]   = useState('')
  const [feedType,         setFeedType]         = useState('')
  const [feedQuantityKg,   setFeedQuantityKg]   = useState('')
  const [feedBrand,        setFeedBrand]        = useState('')
  const [observedIssue,    setObservedIssue]    = useState('')
  const [severity,         setSeverity]         = useState('')
  const [mortalityCount,   setMortalityCount]   = useState('')
  const [areaAffected,     setAreaAffected]     = useState('')
  const [areaAffectedError, setAreaAffectedError] = useState('')
  const [treatmentApplied, setTreatmentApplied] = useState('')
  const [outcome,          setOutcome]          = useState('')
  const [recommendations,  setRecommendations]  = useState('')

  const [remedyDisasterId, setRemedyDisasterId] = useState('')

  const showFeedFields  = activityType === 'Feed Monitoring'
  const showIssueFields = activityType === 'Disease Control'
  const showRemedyFields = activityType === 'Disaster Remedy'
  const activeDisasters = disasters.filter(d => d.status === 'Active')
  const stockedArea = record.area_hectares ? Number(record.area_hectares) : null

  const validateAreaAffected = (value) => {
    if (!value || value === '') return 'Area affected is required.'
    const n = parseFloat(value)
    if (isNaN(n) || n <= 0) return 'Area affected must be greater than 0.'
    if (stockedArea != null && n > stockedArea) {
      return `Area affected cannot exceed the ${stockedArea} ha stocked.`
    }
    return ''
  }

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const [logsRes, disRes] = await Promise.all([
        api.get(`/fisheries/stocking/${record.id}/logs/`),
        api.get(`/fisheries/stocking/${record.id}/disasters/`),
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
    setActivityType(''); setActivityDate(todayISO()); setWaterCondition('')
    setFeedType(''); setFeedQuantityKg(''); setFeedBrand('')
    setActivityTypeOtherSpecify('')
    setRemedyDisasterId('')
    setObservedIssue(''); setSeverity(''); setMortalityCount(''); setTreatmentApplied(''); setOutcome('')
    setAreaAffected(''); setAreaAffectedError('')
    setRecommendations('')
    setPendingSuggestion(null)
    setPendingDisasterReport(null)
    setPendingDisasterRule(null)
  }

  const handleSubmitClick = () => {
    if (!activityType) { showToast('Please select an activity.', 'error'); return }
    if (activityType === 'Other' && !activityTypeOtherSpecify.trim()) { showToast('Please specify the activity.', 'error'); return }
    if (!activityDate) { showToast('Activity date is required.', 'error'); return }
    if (showIssueFields) {
      const err = validateAreaAffected(areaAffected)
      if (err) { setAreaAffectedError(err); showToast(err, 'error'); return }
    }
    if (showRemedyFields) {
      if (!remedyDisasterId) { showToast('Please select the related disaster.', 'error'); return }
      if (!recommendations.trim()) { showToast('Please describe the remedy performed.', 'error'); return }
    }
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false); setIsSubmitting(true)
    try {
      await api.post(`/fisheries/stocking/${record.id}/logs/`, {
        activity:            activityType,
        activity_other_specify: activityType === 'Other' ? activityTypeOtherSpecify.trim() : '',
        date_of_activity:    activityDate,
        water_fish_condition: waterCondition,
        feed_type:           showFeedFields ? feedType : '',
        feed_quantity_kg:    showFeedFields ? (feedQuantityKg || null) : null,
        feed_brand:          showFeedFields ? feedBrand : '',
        observed_issue:      showIssueFields ? observedIssue : '',
        severity:            showIssueFields ? severity : '',
        mortality_count:     showIssueFields ? (mortalityCount || null) : null,
        area_affected_ha:    showIssueFields ? (areaAffected || null) : null,
        treatment_applied:   showIssueFields ? treatmentApplied : '',
        outcome:             showIssueFields ? outcome : '',
        recommendations,
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
    setRecommendations(s.recommendation || '')
    setPendingDisasterReport(s.disaster_report_id || null)
    setPendingDisasterRule(s.disaster_rule_id || null)
    setShowSuggest(false)
    setShowForm(true)
    if (s.status === 'overdue') {
      setPendingSuggestion({ occurrence_day: s.day_after_stocking, status: 'overdue' })
    } else {
      setPendingSuggestion(null)
    }
  }

  const assocLabel = record.fisherfolk_name || '—'

  return (
    <>
      <ModalShell
        title={record.species_name?.toUpperCase() ?? 'STOCKING RECORD'}
        subtitle={`${assocLabel} - Stocked: ${record.date_stocked || '—'}`}
        icon={Fish}
        onClose={onClose}
        maxWidth="max-w-sm"
      >
        {/* Post-harvest / total-loss read-only banners */}
        {isHarvested ? (
          <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 mb-1">
              <Wheat className="w-4 h-4 flex-shrink-0" />
              Harvest Recorded
            </div>
            <div className="text-xs text-emerald-700 space-y-0.5">
              {record.total_harvested_kg > 0 && (
                <p>Total harvested: <span className="font-medium">{Number(record.total_harvested_kg).toLocaleString()} kg</span> across {record.harvest_count} harvest{record.harvest_count !== 1 ? 's' : ''}</p>
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
                This stock was recorded as a total loss. Activity logs are read-only.
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

        {/* Inline form — hidden for harvested stock */}
        {showForm && !isHarvested && (
          <div className="mb-4 space-y-3">
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
                    setActivityType(e.target.value)
                    if (e.target.value !== 'Other') setActivityTypeOtherSpecify('')
                    setPendingSuggestion(null)
                  }}>
                  <option value="">Select Activity</option>
                  {ACTIVITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {activityType === 'Other' && (
                  <input type="text" className={`${baseInputClasses} mt-2`}
                    placeholder="Please specify the activity"
                    value={activityTypeOtherSpecify}
                    onChange={e => setActivityTypeOtherSpecify(e.target.value)} />
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Date of Activity *</label>
                <input type="date" className={baseInputClasses} value={activityDate}
                  max={todayISO()} min={record.date_stocked || undefined}
                  onChange={e => setActivityDate(e.target.value)} />
              </div>
            </div>

            {/* Date Logged — read-only display */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Date Logged</label>
              <input type="text" className={`${baseInputClasses} bg-slate-100 text-slate-400 cursor-not-allowed`}
                value={fmtDate(todayISO())} disabled readOnly />
              <p className="mt-1 text-xs text-slate-400">Automatically recorded when you save.</p>
            </div>

            {/* Water/Fish Condition */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Water / Fish Condition</label>
              <select className={baseInputClasses} value={waterCondition}
                onChange={e => setWaterCondition(e.target.value)}>
                <option value="">Select condition</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Poor">Poor</option>
              </select>
            </div>

            {/* Feed fields */}
            {showFeedFields && (
              <div className="bg-[#EBF5EE] border border-[#C8E6D0] rounded-xl p-3">
                <p className="text-xs font-semibold text-[#1B4D2E] mb-2 flex items-center gap-1">
                  <Fish className="w-3.5 h-3.5" /> Feed Details
                </p>
                <div className="mb-2">
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Feed Type</label>
                  <input type="text" value={feedType} onChange={e => setFeedType(e.target.value)}
                    placeholder="e.g. Commercial Pellet, Trash Fish" className={baseInputClasses} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Quantity (kg)</label>
                    <input type="number" step="0.01" value={feedQuantityKg}
                      onChange={e => setFeedQuantityKg(e.target.value)} placeholder="e.g. 25" className={baseInputClasses} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Brand</label>
                    <input type="text" value={feedBrand} onChange={e => setFeedBrand(e.target.value)}
                      placeholder="e.g. Sunrise" className={baseInputClasses} />
                  </div>
                </div>
              </div>
            )}

            {/* Issue/Disease fields */}
            {showIssueFields && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-rose-800 mb-2 flex items-center gap-1">
                  <Bug className="w-3.5 h-3.5" /> Observed Issue
                </p>
                <div className="mb-2">
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Observed Issue</label>
                  <input type="text" value={observedIssue} onChange={e => setObservedIssue(e.target.value)}
                    placeholder="e.g. White spot disease, Low DO" className={baseInputClasses} />
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Severity</label>
                    <select value={severity} onChange={e => setSeverity(e.target.value)} className={baseInputClasses}>
                      <option value="">Select</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Mortality Count</label>
                    <input type="number" value={mortalityCount}
                      onChange={e => setMortalityCount(e.target.value)} placeholder="e.g. 50" className={baseInputClasses} />
                  </div>
                </div>
                <div className="mb-2">
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Area Affected (ha) *</label>
                  <input type="number" step="0.0001" value={areaAffected}
                    onChange={e => {
                      setAreaAffected(e.target.value)
                      setAreaAffectedError(validateAreaAffected(e.target.value))
                    }}
                    placeholder="e.g. 0.50"
                    className={`${baseInputClasses} ${areaAffectedError ? 'border-rose-400' : ''}`} />
                  {areaAffectedError ? (
                    <p className="mt-1 text-[11px] font-medium text-rose-600">{areaAffectedError}</p>
                  ) : stockedArea != null ? (
                    <p className="mt-1 text-[11px] text-slate-500">Planted area: {stockedArea} ha</p>
                  ) : null}
                </div>
                <div className="mb-2">
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Treatment Applied</label>
                  <input type="text" value={treatmentApplied} onChange={e => setTreatmentApplied(e.target.value)}
                    placeholder="e.g. Salt bath, Antibiotic" className={baseInputClasses} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Outcome</label>
                  <select value={outcome} onChange={e => setOutcome(e.target.value)} className={baseInputClasses}>
                    <option value="">Select</option>
                    <option value="Recovered">Recovered</option>
                    <option value="Ongoing">Ongoing</option>
                    <option value="Losses Incurred">Losses Incurred</option>
                  </select>
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
                  This remedy will not automatically satisfy any recommended response rule — describe it in the Recommendations field below.
                </p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                {showRemedyFields ? 'Remedy Performed *' : 'Recommendations'}
              </label>
              <textarea rows={3} className={`${baseInputClasses} resize-none`}
                placeholder={showRemedyFields ? 'Describe the remedy performed' : 'Recommendations (optional)'}
                value={recommendations} onChange={e => setRecommendations(e.target.value)} />
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
                const isResolved = event.status === 'Resolved'
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
                        <span className={`flex items-center gap-1.5 text-sm font-semibold ${isResolved ? 'text-emerald-700' : 'text-rose-700'}`}>
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {otherLabel(event.disaster_type, event.disaster_type_other_specify)} — Disaster Report
                          {isResolved ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Resolved</span>
                          ) : (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Active</span>
                          )}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-xs ${isResolved ? 'text-emerald-500' : 'text-rose-400'}`}>{fmtDate(event.date_of_occurrence)}</span>
                          {hasDetails && (
                            <span className={`text-xs ${isResolved ? 'text-emerald-400' : 'text-rose-300'}`}>
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          )}
                        </div>
                      </div>
                      {isResolved && event.resolved_date && (
                        <p className="text-xs text-emerald-600 mt-0.5">
                          Resolved on {fmtDate(event.resolved_date)}{event.resolved_by_name ? ` by ${event.resolved_by_name}` : ''}
                        </p>
                      )}
                      {!isExpanded && event.area_affected_ha && (
                        <p className={`text-xs mt-0.5 ${isResolved ? 'text-emerald-500' : 'text-rose-500'}`}>Area: {event.area_affected_ha} ha</p>
                      )}
                    </button>
                    {isExpanded && (
                      <div className={`mt-1.5 rounded-lg border px-3 py-2 space-y-1 ${
                        isResolved ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-100'
                      }`}>
                        {isResolved && event.resolved_date && (
                          <p className="text-xs text-emerald-700"><span className="font-medium">Resolved on:</span> {fmtDate(event.resolved_date)}{event.resolved_by_name ? ` by ${event.resolved_by_name}` : ''}</p>
                        )}
                        {event.area_affected_ha && (
                          <p className={`text-xs ${isResolved ? 'text-emerald-700' : 'text-rose-700'}`}><span className="font-medium">Area affected:</span> {event.area_affected_ha} ha</p>
                        )}
                        {event.estimated_damage && (
                          <p className={`text-xs ${isResolved ? 'text-emerald-700' : 'text-rose-700'}`}><span className="font-medium">Damage:</span> {event.estimated_damage}</p>
                        )}
                        {event.production_loss && (
                          <p className={`text-xs ${isResolved ? 'text-emerald-700' : 'text-rose-700'}`}><span className="font-medium">Production loss:</span> {event.production_loss}</p>
                        )}
                        {!hasDetails && (
                          <p className={`text-xs italic ${isResolved ? 'text-emerald-400' : 'text-rose-400'}`}>No additional details recorded.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              }
              const log = event
              const remedyDisaster = log.activity === 'Disaster Remedy' && log.disaster_report
                ? disasters.find(d => d.id === log.disaster_report)
                : null
              return (
                <div key={`l-${log.id}`} className={`py-3 ${remedyDisaster ? 'border-l-2 border-rose-300 pl-3 -ml-px' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{otherLabel(log.activity, log.activity_other_specify)}</span>
                    <span className="shrink-0 text-xs text-slate-400">{fmtDate(log.date_of_activity)}</span>
                  </div>
                  {remedyDisaster && (
                    <p className="text-xs text-rose-600 mt-0.5">
                      Remedy for: {otherLabel(remedyDisaster.disaster_type, remedyDisaster.disaster_type_other_specify)} reported {fmtDate(remedyDisaster.date_of_occurrence)}
                    </p>
                  )}
                  {log.water_fish_condition && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${
                      log.water_fish_condition === 'Good' ? 'bg-green-100 text-green-700'
                      : log.water_fish_condition === 'Fair' ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-600'
                    }`}>
                      {log.water_fish_condition}
                    </span>
                  )}
                  {log.is_late && (
                    <span className="mt-1 ml-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Logged late — target Day {log.target_day}
                    </span>
                  )}
                  {(log.feed_type || log.feed_quantity_kg) && (
                    <p className="text-xs text-slate-500 mt-1">
                      {[log.feed_type, log.feed_quantity_kg && `${log.feed_quantity_kg} kg`, log.feed_brand].filter(Boolean).join(' — ')}
                    </p>
                  )}
                  {log.observed_issue && (
                    <p className="text-xs text-slate-500 mt-1">
                      {log.observed_issue}
                      {log.severity && ` | Severity: ${log.severity}`}
                      {log.mortality_count != null && ` | Mortality: ${log.mortality_count}`}
                      {log.outcome && ` | ${log.outcome}`}
                    </p>
                  )}
                  {log.recommendations && <p className="mt-0.5 text-xs text-slate-500">{log.recommendations}</p>}
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
        <StockingSuggestionsModal
          record={record}
          onClose={() => setShowSuggest(false)}
          onApply={handleApplySuggestion}
        />
      )}
    </>
  )
}

// ── Disaster Report Modal ─────────────────────────────────────────────────────

const DISASTER_TYPE_OPTIONS = [
  'Fish Kill', 'Disease Outbreak', 'Flood', 'Typhoon',
  'Drought', 'Predator Attack', 'Pollution Incident', 'Other',
]

export function StockingDisasterReportModal({ record, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [disasterType,      setDisasterType]      = useState('')
  const [disasterTypeOtherSpecify, setDisasterTypeOtherSpecify] = useState('')
  const [dateOfOccurrence,  setDateOfOccurrence]  = useState(todayISO())
  const [areaAffectedHa,    setAreaAffectedHa]    = useState('')
  const [estimatedDamage,   setEstimatedDamage]   = useState('')
  const [productionLoss,    setProductionLoss]    = useState('')
  const [isTotalLoss,       setIsTotalLoss]       = useState(false)
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [areaError,         setAreaError]         = useState('')
  const [dateError,         setDateError]         = useState('')

  const speciesName  = record.species_name || 'this stock'
  const maxArea       = record.area_hectares ? parseFloat(record.area_hectares) : null
  const dateStocked   = record.date_stocked || null

  const validateArea = (val) => {
    if (!val) return 'Area affected is required.'
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return 'Area must be greater than 0.'
    if (maxArea !== null && n > maxArea) return `Cannot exceed area stocked (${maxArea} ha).`
    return ''
  }

  const validateDate = (val) => {
    if (!val) return 'Date of occurrence is required.'
    if (val > todayISO()) return 'Date cannot be in the future.'
    if (dateStocked && val < dateStocked) return `Date cannot be before date stocked (${dateStocked}).`
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
      await api.post(`/fisheries/stocking/${record.id}/disasters/`, {
        disaster_type:      disasterType,
        disaster_type_other_specify: disasterType === 'Other' ? disasterTypeOtherSpecify.trim() : '',
        date_of_occurrence: dateOfOccurrence,
        area_affected_ha:   parseFloat(isTotalLoss && maxArea ? maxArea : areaAffectedHa),
        estimated_damage:   estimatedDamage,
        production_loss:    productionLoss,
        is_total_loss:      isTotalLoss,
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
        subtitle={`Report a disaster event for ${speciesName}`}
        icon={AlertTriangle}
        iconBg="bg-rose-100"
        iconColor="text-rose-600"
        onClose={onClose}
        maxWidth="max-w-md"
      >
        <div className="space-y-3">
          <GrowthProgressBar
            startLabel="Stocked"
            startDate={record.date_stocked}
            expectedHarvestDate={record.expected_harvest_date}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Disaster Type *</label>
            <select className={baseInputClasses} value={disasterType}
              onChange={e => {
                setDisasterType(e.target.value)
                if (e.target.value !== 'Other') setDisasterTypeOtherSpecify('')
              }}>
              <option value="">Select type</option>
              {DISASTER_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {disasterType === 'Other' && (
              <input type="text" className={`${baseInputClasses} mt-2`}
                placeholder="Please specify the disaster type"
                value={disasterTypeOtherSpecify}
                onChange={e => setDisasterTypeOtherSpecify(e.target.value)} />
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Date of Occurrence *</label>
            <input type="date" className={`${baseInputClasses} ${dateError ? 'border-rose-400' : ''}`}
              value={dateOfOccurrence}
              max={todayISO()}
              min={dateStocked || undefined}
              onChange={e => { setDateOfOccurrence(e.target.value); setDateError(validateDate(e.target.value)) }} />
            {dateError && <p className="mt-1 text-xs text-rose-600">{dateError}</p>}
            {dateStocked && !dateError && (
              <p className="mt-1 text-xs text-slate-400">Must be between {dateStocked} and today.</p>
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
              <p className="mt-1 text-xs text-slate-400">Max: {maxArea} ha (total area stocked)</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Damage Description (optional)</label>
            <textarea rows={3} className={`${baseInputClasses} resize-none`} value={estimatedDamage}
              onChange={e => setEstimatedDamage(e.target.value)}
              placeholder="Describe the damage observed (stock, infrastructure, etc.)" />
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
              <span className="text-sm font-medium text-rose-800">Total loss — stock completely destroyed</span>
              <p className="text-xs text-rose-500 mt-0.5">This ends the production cycle. No harvest can be recorded.</p>
            </div>
          </label>

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
          message={`Are you sure you want to log this disaster event for ${speciesName}? This will be recorded in the monitoring history.`}
          confirmLabel="Yes, Report"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

// ── Record Harvest Modal ──────────────────────────────────────────────────────

export function RecordStockingHarvestModal({ record, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [harvestDate,       setHarvestDate]       = useState(todayISO())
  const [quantityKg,        setQuantityKg]        = useState('')
  const [avgBodyWeightKg,   setAvgBodyWeightKg]   = useState('')
  const [areaOrUnits,       setAreaOrUnits]       = useState('')
  const [notes,             setNotes]             = useState('')
  const [earlyLateReason,   setEarlyLateReason]   = useState('')
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [quantityError,     setQuantityError]     = useState('')
  const [resolvableDisasters, setResolvableDisasters] = useState([])
  const [dismissedDisasterIds, setDismissedDisasterIds] = useState(new Set())
  const [resolvingId,       setResolvingId]       = useState(null)

  useEffect(() => {
    api.get(`/fisheries/stocking/${record.id}/suggestions/`)
      .then(r => {
        const ready = (r.data.disaster_response || []).filter(d => d.status !== 'Resolved' && d.all_rules_done)
        setResolvableDisasters(ready)
      })
      .catch(() => {})
  }, [record.id])

  const handleMarkResolved = async (disasterId) => {
    setResolvingId(disasterId)
    try {
      await api.post(`/fisheries/disasters/${disasterId}/resolve/`)
      showToast('Disaster marked as resolved.', 'success')
      setResolvableDisasters(prev => prev.filter(d => d.disaster_id !== disasterId))
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to resolve disaster.', 'error')
    } finally {
      setResolvingId(null)
    }
  }

  const visibleResolvableDisasters = resolvableDisasters.filter(d => !dismissedDisasterIds.has(d.disaster_id))

  const speciesName = record.species_name || 'this stock'
  const estYield     = record.estimated_harvest_kg ? parseFloat(record.estimated_harvest_kg) : null

  const expectedHarvestDate = record.expected_harvest_date || null
  const daysFromNowToExpected = expectedHarvestDate
    ? Math.round((new Date(expectedHarvestDate + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000)
    : null
  const harvestVarianceDays = (expectedHarvestDate && harvestDate)
    ? Math.round((new Date(harvestDate + 'T00:00:00') - new Date(expectedHarvestDate + 'T00:00:00')) / 86400000)
    : null
  const isEarly = harvestVarianceDays !== null && harvestVarianceDays < -7
  const isLate = harvestVarianceDays !== null && harvestVarianceDays > 7
  const reasonRequired = isEarly || isLate
  const EARLY_REASONS = ['Emergency harvest — disaster damage', 'Buyer demand', 'Crop matured early', 'Other']
  const LATE_REASONS = ['Delayed field visit', 'Weather', 'Labor unavailable', 'Other']

  const validateQuantity = (val) => {
    if (!val) return 'Quantity harvested is required.'
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return 'Quantity must be greater than 0.'
    return ''
  }

  const handleSubmitClick = () => {
    if (!harvestDate) { showToast('Harvest date is required.', 'error'); return }
    const qErr = validateQuantity(quantityKg)
    setQuantityError(qErr)
    if (qErr) return
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
      await api.post(`/fisheries/stocking/${record.id}/harvests/`, {
        harvest_date:            harvestDate,
        quantity_kg:             parseFloat(quantityKg),
        avg_body_weight_kg:      avgBodyWeightKg !== '' ? parseFloat(avgBodyWeightKg) : null,
        area_or_units_harvested: areaOrUnits,
        is_final:                true,
        early_late_reason:       reasonRequired ? earlyLateReason.trim() : '',
        notes,
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
        subtitle={`Record harvest details for ${speciesName}`}
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
                This stock has an unresolved <span className="font-semibold">{d.disaster_type}</span> with all recommended responses completed. Resolve it now?
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={resolvingId === d.disaster_id}
                  onClick={() => handleMarkResolved(d.disaster_id)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                  {resolvingId === d.disaster_id ? 'Resolving…' : 'Mark Resolved'}
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

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Harvest Date *</label>
            <input type="date" className={baseInputClasses} value={harvestDate}
              max={todayISO()}
              onChange={e => setHarvestDate(e.target.value)} />
          </div>

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
                list="fisheries-harvest-reason-options"
                className={baseInputClasses}
                value={earlyLateReason}
                onChange={e => setEarlyLateReason(e.target.value)}
                placeholder="Select or type a reason"
              />
              <datalist id="fisheries-harvest-reason-options">
                {(isEarly ? EARLY_REASONS : LATE_REASONS).map(r => <option key={r} value={r} />)}
              </datalist>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Quantity Harvested (kg) *</label>
            <input type="number" step="0.01"
              className={`${baseInputClasses} ${quantityError ? 'border-rose-400' : ''}`}
              value={quantityKg}
              onChange={e => { setQuantityKg(e.target.value); setQuantityError(validateQuantity(e.target.value)) }}
              placeholder="e.g. 500" />
            {quantityError
              ? <p className="mt-1 text-xs text-rose-600">{quantityError}</p>
              : estYield && (
                <p className="mt-1 text-xs text-slate-400">
                  Estimated harvest: {Number(estYield).toLocaleString()} kg
                </p>
              )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Avg Body Weight (kg)</label>
              <input type="number" step="0.001" className={baseInputClasses}
                value={avgBodyWeightKg}
                onChange={e => setAvgBodyWeightKg(e.target.value)}
                placeholder="e.g. 0.250" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Area / Units Harvested</label>
              <input type="text" className={baseInputClasses}
                value={areaOrUnits}
                onChange={e => setAreaOrUnits(e.target.value)}
                placeholder="e.g. Pond 2, 3 cages" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Notes (optional)</label>
            <textarea rows={2} className={`${baseInputClasses} resize-none`} value={notes}
              onChange={e => setNotes(e.target.value)}
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
          message={`Are you sure you want to record the harvest for ${speciesName}? This will mark the cycle as Harvested.`}
          confirmLabel="Yes, Record Harvest"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
