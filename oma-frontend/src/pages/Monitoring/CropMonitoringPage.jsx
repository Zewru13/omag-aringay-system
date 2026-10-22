import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import {
  AlertTriangle, Bug, CheckCircle, CheckCircle2, ChevronDown, ClipboardList, Eye, FileText, HelpCircle, Leaf, Lock, MapPin, Pencil, Printer, Trash2, Unlock, User, Wheat,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import useIsPhone from '../../hooks/useIsPhone.js'
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
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import LoggedDatePicker from '../../components/UI/LoggedDatePicker.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useRecordLock from '../../hooks/useRecordLock.js'
import usePhotoList from '../../hooks/usePhotoList.js'
import PhotoListField from '../../components/UI/PhotoListField.jsx'
import PhotoLinks from '../../components/UI/PhotoLinks.jsx'
import { groupActivityOptions, overdueStepDay } from '../../utils/activityPicker.js'
import { cycleProgress, filterCycleActivities } from '../../utils/cycleActivity.js'
import { todayISO as localToday } from '../../utils/localDate.js'
import CycleDayBanner from '../../components/UI/CycleDayBanner.jsx'
import GroupedMonitoringTable from './GroupedMonitoringTable.jsx'
import { DEFAULT_GROUP, GROUP_OPTIONS, monitoringParams } from './monitoringGroups.js'
import { printSpec } from './disasterReportDocument.js'
import {
  EARLY_REASONS, LATE_REASONS, OTHER_REASON, buildHarvestReportSpec, composeReason, harvestTiming, reasonProblem,
} from './harvestReport.js'

const todayISO = () => new Date().toISOString().slice(0, 10)

// DRF's default validation-error shape is {field: [message, ...]}, not
// {detail: message} — a plain `.detail` fallback (the pattern used
// elsewhere in this file) silently swallows every field-level rejection
// from HarvestRecordCreateSerializer's validate() (future date, harvest
// before planting, missing early/late reason) behind a generic "Failed"
// toast, with no way for the user to know which of those actually fired.
// Real kg-per-unit conversion, for the units that genuinely have one — kg
// (trivial), Metric Ton (1000kg, universal), Cavan (50kg, the standard
// Philippine grain-trade unit, already self-documented in that exact
// allowed_units label). Sack/Bundle/Piece/Hand/Crate are deliberately left
// unconverted (null) — checked directly against DA's own price-monitoring
// bulletins, which price these strictly per kg, never per sack/bundle/
// piece: there is no official standard weight for them, it varies by crop,
// vendor, and region. Returning null here means the comparison below falls
// back to treating the entered number as already-kg, same as this form's
// original (pre-conversion) behavior, rather than applying a guessed factor.
const STANDARD_HARVEST_UNITS = ['kg', 'bags', 'cavan', 'sacks', 'pieces', 'bundles', 'boxes']

function unitToKgFactor(unit) {
  const normalized = (unit || '').trim().toLowerCase()
  if (normalized === 'kg') return 1
  if (normalized === 'metric ton') return 1000
  if (normalized.startsWith('cavan')) return 50
  return null
}

function extractErrorMessage(err, fallback) {
  const data = err?.response?.data
  if (data?.detail) return data.detail
  if (data && typeof data === 'object') {
    const firstKey = Object.keys(data)[0]
    const firstVal = data[firstKey]
    if (firstKey && firstVal) {
      const msg = Array.isArray(firstVal) ? firstVal[0] : firstVal
      return msg
    }
  }
  return fallback
}

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
                  if (disaster.can_recover !== false && disaster.all_rules_done && !dismissedDisasters.has(disaster.disaster_id)) {
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
                  if (disaster.can_recover !== false && disaster.all_rules_done && dismissedDisasters.has(disaster.disaster_id)) {
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
                        {disaster.is_total_loss || disaster.can_recover === false ? (
                          <p className="text-xs text-slate-500 italic">{disaster.is_total_loss ? 'Total Loss — this record is terminal and cannot be marked as recovered.' : (disaster.recovery_block_reason || 'This disaster cannot be marked as recovered.')}</p>
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
        <ConfirmDialog variant="primary"
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

function ViewLogsModal({ record, onClose, onLogAdded, initialForm = false }) {
  const { showToast } = useToast()
  const [logs,              setLogs]              = useState([])
  const [disasters,         setDisasters]         = useState([])
  const [isLoading,         setIsLoading]         = useState(true)
  const { isAdmin, isFarmer } = useAuth()
  const [showForm,          setShowForm]          = useState(Boolean(initialForm))
  const [showHistory,       setShowHistory]       = useState(false)   // the past activity stays closed until asked for
  const recordLock = useRecordLock('crop', record.id, showForm)
  const [showSuggest,       setShowSuggest]       = useState(false)
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [editingLogId,      setEditingLogId]      = useState(null)   // farmer: the activity log being edited
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
  // The crop recovered because of the remedy: tick it on the form (saved together with the log) or use the button on a saved remedy.
  const [recoveredAfterRemedy, setRecoveredAfterRemedy] = useState(false)
  const [recoverTarget, setRecoverTarget] = useState(null)   // { disaster, note } while the recovery dialog is open
  const [isRecovering, setIsRecovering] = useState(false)

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
  // The server's schedule for this crop (each step due / overdue / upcoming / done); the picker follows it.
  const [scheduleSteps, setScheduleSteps] = useState([])

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

  // "Suggested now" = scheduled steps due or overdue and not yet done, earliest first; "Other" = unscheduled
  // activities and steps that are only upcoming; an activity whose steps are all done is left out (see
  // utils/activityPicker.js). The log being edited keeps its own activity selectable.
  const editingLogType = editingLogId ? (logs.find(l => l.id === editingLogId)?.activity_type || '') : ''
  // Set-up work (Land Preparation, Planting) is done once: after a log of it exists it is not offered again.
  const recordedActivities = useMemo(() => [...new Set(logs.map(l => l.activity_type))], [logs])
  const { suggested: suggestedActivityOptions, other: otherActivityOptions } = useMemo(
    () => groupActivityOptions({ allTypes: activityTypeOptions, suggestions: scheduleSteps, editingType: editingLogType, recorded: recordedActivities }),
    [activityTypeOptions, scheduleSteps, editingLogType, recordedActivities],
  )

  // Land-prep-style activities may be logged before date_planted; everything else may not.
  const selectedStageAllowsPrePlanting = useMemo(() => {
    const stage = activityStages.find(s => s.stage_name === activityType)
    return !!stage?.allows_pre_planting
  }, [activityStages, activityType])

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const [logsRes, disRes, scheduleRes] = await Promise.all([
        api.get(`/production/monitoring/${record.id}/logs/`),
        api.get(`/production/monitoring/${record.id}/disasters/`),
        api.get(`/production/monitoring/${record.id}/suggestions/`).catch(() => null),
      ])
      setScheduleSteps(scheduleRes?.data?.suggestions || [])
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
    setRecoveredAfterRemedy(false)
    setPestDiseaseName(''); setAreaAffected(''); setAreaAffectedError(''); setSeverity(''); setNotes('')
    setPendingSuggestion(null)
    setPendingDisasterReport(null)
    setPendingDisasterRule(null)
    setEditingLogId(null)
  }

  // A farmer can correct their own entries: load the log back into the form, and save it with a PATCH.
  const startEdit = (log) => {
    setEditingLogId(log.id)
    setActivityType(log.activity_type || '')
    setActivityTypeOtherSpecify(log.activity_type === 'Other' ? (log.activity_type_other_specify || '') : '')
    setActivityDate(log.date_of_activity || todayISO())
    setPlantCondition(log.plant_condition || '')
    setFertilizerType(log.fertilizer_type || '')
    setQuantityApplied(log.quantity_applied ?? '')
    setQuantityUnit(log.quantity_unit || 'kg')
    setPestDiseaseName(log.pest_disease_name || '')
    setAreaAffected(log.area_affected_ha ?? '')
    setAreaAffectedError('')
    setSeverity(log.severity || '')
    setNotes(log.notes || '')
    setRemedyDisasterId(log.disaster_report ? String(log.disaster_report) : '')
    setPendingSuggestion(null)
    setShowForm(true)
  }

  const confirmRecovered = async () => {
    if (!recoverTarget) return
    setIsRecovering(true)
    try {
      await api.post(`/production/disasters/${recoverTarget.disaster.id}/resolve/`, { recovery_note: recoverTarget.note.trim() })
      showToast('Disaster marked as recovered.', 'success')
      setRecoverTarget(null)
      await fetchLogs(); onLogAdded()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to mark the disaster as recovered.', 'error')
    } finally { setIsRecovering(false) }
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
      const payload = {
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
      }
      if (editingLogId) {
        // Editing keeps the entry's own late/disaster links: only the fields on the form change.
        await api.patch(`/production/monitoring/logs/${editingLogId}/detail/`, payload)
      } else {
        await api.post(`/production/monitoring/${record.id}/logs/`, {
          ...payload,
          // A late log chosen from the dropdown is tied to the activity's earliest overdue step, like one started from a suggestion.
          target_day: pendingSuggestion?.occurrence_day ?? overdueStepDay(activityType, scheduleSteps),
          disaster_report: showRemedyFields ? parseInt(remedyDisasterId, 10) : pendingDisasterReport,
          disaster_rule:   showRemedyFields ? null : pendingDisasterRule,
        })
      }
      showToast(editingLogId ? 'Activity log updated.' : 'Activity log added.', 'success')
      if (!editingLogId && showRemedyFields && recoveredAfterRemedy) {
        try {
          await api.post(`/production/disasters/${remedyDisasterId}/resolve/`, { recovery_note: notes.trim() })
          showToast('Disaster marked as recovered.', 'success')
        } catch (err) {
          showToast(err?.response?.data?.detail || 'The remedy was saved, but the disaster could not be marked as recovered.', 'error')
        }
      }
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
  const cycle = cycleProgress(record.date_planted, record.expected_harvest_date, localToday())
  // Disaster Remedy needs a disaster report; Pre-Harvest Inspection and Harvesting open from half way through the season.
  const activityChoices = filterCycleActivities(
    [...suggestedActivityOptions, ...otherActivityOptions].filter(o => o !== 'Other'),
    { hasDisaster: activeDisasters.length > 0, halfway: cycle ? cycle.halfway : true, keep: editingLogType },
  )

  return (
    <>
      <ModalShell
        title={record.crop_type_name?.toUpperCase() ?? 'CROP'}
        subtitle={`${assocLabel} - Planted: ${record.date_planted || '—'}${cycle ? ` · Day ${cycle.day}${cycle.total ? ` of ${cycle.total}` : ''}` : ''}`}
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
            <CycleDayBanner progress={cycle} stage={growthInfo?.stage} />

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
                  options={activityChoices}
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
                <LoggedDatePicker
                  id="crop-log-date"
                  className={baseInputClasses}
                  value={activityDate}
                  max={todayISO()}
                  min={selectedStageAllowsPrePlanting ? undefined : (record.date_planted || undefined)}
                  onChange={setActivityDate}
                  loggedDates={logs.filter(l => l.id !== editingLogId).map(l => l.date_of_activity)}
                  labels={{ loggedNote: 'This crop already has a log on this date.' }}
                />
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
                  {record.growth_stage && record.recommended_input_type_name && fertilizerType !== record.recommended_input_type_name && (
                    <p className="mt-1 text-[11px] text-[#1B4D2E]">
                      {record.growth_stage} stage — recommended: <strong>{record.recommended_input_type_name}</strong>{' '}
                      <button type="button" className="underline" onClick={() => setFertilizerType(record.recommended_input_type_name)}>Use this</button>
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Quantity Applied</label>
                    <DecimalInput decimals={2} value={quantityApplied}
                      onChange={setQuantityApplied} placeholder="e.g. 50" className={baseInputClasses} />
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
                    <DecimalInput decimals={4} max={plantedArea} value={areaAffected}
                      onChange={v => {
                        setAreaAffected(v)
                        setAreaAffectedError(validateAreaAffected(v))
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
                {!editingLogId && (
                  <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs font-medium text-emerald-800">
                    <input
                      type="checkbox" className="mt-0.5" checked={recoveredAfterRemedy} disabled={!remedyDisasterId}
                      onChange={(e) => setRecoveredAfterRemedy(e.target.checked)}
                    />
                    <span>The crop has recovered because of this remedy — also mark the disaster as Recovered.</span>
                  </label>
                )}
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
              {isSubmitting ? 'Saving…' : (editingLogId ? 'Save Changes' : 'Add Log')}
            </button>
            </>}
          </div>
        )}

        {/* Activity History: closed until it is opened, so the modal stays short */}
        <button
          type="button" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}
          className="mb-3 flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-slate-50"
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2D7A4F]" />
          <span className="text-sm font-semibold text-slate-700">Activity History</span>
          {!isLoading && <span className="text-xs text-slate-400">({allEvents.length})</span>}
          {disasters.length > 1 && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
              <AlertTriangle className="w-3 h-3" /> {disasters.length} disaster reports
            </span>
          )}
          <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${showHistory ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {/* Unified timeline */}
        {showHistory && (isLoading ? (
          <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
        ) : allEvents.length === 0 ? (
          <p className="py-4 text-center text-sm italic text-slate-400">No logs yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {allEvents.map(event => {
              if (event._type === 'disaster') {
                const isExpanded = expandedDisasters.has(event.id)
                const hasDetails = event.area_affected_ha || event.estimated_damage || event.production_loss || event.photo || event.photos?.length
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
                        {(event.photo || event.photos?.length > 0) && (
                          <div className={`text-xs ${isRecovered ? 'text-emerald-700' : 'text-rose-700'}`}>
                            <span className="font-medium">Photos:</span>
                            <PhotoLinks photos={event.photos} legacy={event.photo} className="mt-1" />
                          </div>
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
                  {remedyDisaster && remedyDisaster.status === 'Recovered' && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="w-3 h-3" /> Recovered{remedyDisaster.recovered_date ? ` on ${fmtDate(remedyDisaster.recovered_date)}` : ''}
                    </p>
                  )}
                  {remedyDisaster && remedyDisaster.status === 'Active' && remedyDisaster.can_recover !== false && !remedyDisaster.is_total_loss && !isHarvested && !isTotalLoss && (
                    <button
                      type="button"
                      onClick={() => setRecoverTarget({ disaster: remedyDisaster, note: log.notes || '' })}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark as Recovered
                    </button>
                  )}
                  {isFarmer && !isHarvested && !isTotalLoss && (
                    <button type="button" onClick={() => startEdit(log)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#1B4D2E] hover:underline">
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog variant="primary"
          title="Confirm Action"
          message={editingLogId ? 'Are you sure you want to save your changes to this activity log?' : 'Are you sure you want to add this activity log?'}
          confirmLabel="Confirm"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {recoverTarget && (
        <ConfirmDialog
          title="Mark this disaster as Recovered?"
          message={`The crop recovered after the remedy for ${otherLabel(recoverTarget.disaster.disaster_type, recoverTarget.disaster.disaster_type_other_specify)}. Say how it recovered; this note is kept with the disaster.`}
          confirmLabel={isRecovering ? 'Saving...' : 'Mark as Recovered'}
          variant="primary" danger={false} icon={CheckCircle2} iconBg="#DCFCE7" iconColor="#15803D"
          showReasonInput reasonLabel="How it recovered (required)"
          reasonValue={recoverTarget.note}
          onReasonChange={(v) => setRecoverTarget((cur) => ({ ...cur, note: v }))}
          onConfirm={() => { if (recoverTarget.note.trim() && !isRecovering) confirmRecovered() }}
          onCancel={() => { if (!isRecovering) setRecoverTarget(null) }}
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
  // The units this harvest's crop allows (Crop Options); the standard codes when the harvest has no crop record.
  const [cropUnits,    setCropUnits]    = useState(null)

  useEffect(() => {
    api.get(`/production/${harvestId}/`)
      .then(r => {
        const d = r.data
        if (d.monitoring_record) {
          api.get(`/production/monitoring/${d.monitoring_record}/`)
            .then(m => setCropUnits(m.data.crop_allowed_units?.length ? m.data.crop_allowed_units : null))
            .catch(() => {})
        }
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
      iconBg="bg-amber-100" iconColor="text-amber-600" onClose={onClose} maxWidth="max-w-md"
      footer={!isLoading && form ? (
        <>
          <button type="button" onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting}
            className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      ) : null}>
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
              <DecimalInput decimals={2} className={baseInputClasses}
                value={form.area_harvested_hectares}
                onChange={v => handleChange('area_harvested_hectares', v)}
                placeholder="e.g. 2.50" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Unit</label>
              <select className={baseInputClasses} value={form.unit_of_measure}
                onChange={e => handleChange('unit_of_measure', e.target.value)}>
                {/* The crop's own units, always including the unit already saved on this harvest. */}
                {[...new Set([...(cropUnits || STANDARD_HARVEST_UNITS), form.unit_of_measure])].map(u => <option key={u} value={u}>{u}</option>)}
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
        </div>
      )}
    </ModalShell>
  )
}

// ── Disaster Report Modal ─────────────────────────────────────────────────────
// Also used, unchanged, by Admin > Disaster > Farmer Disaster > Log Disaster (after choosing the farmer and
// their crop record).

export function DisasterReportModal({ record, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [disasterType,      setDisasterType]      = useState('')
  const [disasterTypeOtherSpecify, setDisasterTypeOtherSpecify] = useState('')
  const [dateOfOccurrence,  setDateOfOccurrence]  = useState(todayISO())
  const [areaAffectedHa,    setAreaAffectedHa]    = useState('')
  const [estimatedDamage,   setEstimatedDamage]   = useState('')
  const [productionLoss,    setProductionLoss]    = useState('')
  const [isTotalLoss,       setIsTotalLoss]       = useState(false)
  const photosState = usePhotoList()
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [areaError,         setAreaError]         = useState('')
  const [dateError,         setDateError]         = useState('')

  const cropName   = record.crop_type_name || 'this crop'
  const maxArea    = record.area_planted_ha ? parseFloat(record.area_planted_ha) : null
  const datePlanted = record.date_planted || null
  // Total Loss means the whole planted area is affected: the option is available only once the area typed equals it.
  const isWholeArea = maxArea === null || (areaAffectedHa !== '' && Math.abs(parseFloat(areaAffectedHa) - maxArea) < 0.00005)

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
        area_affected_ha:   parseFloat(areaAffectedHa),
        estimated_damage:   estimatedDamage,
        production_loss:    productionLoss,
        is_total_loss:      isTotalLoss && isWholeArea,
      }
      let payload = fields
      if (photosState.photos.length) {
        payload = new FormData()
        Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined) payload.append(k, v) })
        photosState.photos.forEach(p => payload.append('photos', p.file))
      }
      await api.post(`/production/monitoring/${record.id}/disasters/`, payload)
      showToast('Disaster report recorded.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.photos?.[0] || err?.response?.data?.detail || 'Failed to save disaster report.', 'error')
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
        footer={
          <>
            <button type="button" onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmitClick} disabled={isSubmitting}
              className="bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
              {isSubmitting ? 'Saving…' : 'Report Disaster'}
            </button>
          </>
        }
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
            <DecimalInput decimals={4} max={maxArea}
              className={`${baseInputClasses} ${areaError ? 'border-rose-400' : ''}`}
              value={areaAffectedHa}
              onChange={v => {
                setAreaAffectedHa(v)
                setAreaError(validateArea(v))
                // Total Loss needs the whole area: typing anything else switches it off
                if (isTotalLoss && maxArea !== null && !(Math.abs(parseFloat(v) - maxArea) < 0.00005)) setIsTotalLoss(false)
              }}
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

          <label className={`flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 ${isWholeArea ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
            <input
              type="checkbox"
              checked={isTotalLoss && isWholeArea}
              disabled={!isWholeArea}
              onChange={e => setIsTotalLoss(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
            />
            <div>
              <span className="text-sm font-medium text-rose-800">Total loss — crop completely destroyed</span>
              <p className="text-xs text-rose-500 mt-0.5">This ends the production cycle. No harvest can be recorded.</p>
              {!isWholeArea && (
                <p className="mt-1 text-xs text-slate-600">Available only when the whole area is affected{maxArea ? ` (${maxArea} ha)` : ''}.</p>
              )}
            </div>
          </label>

          <PhotoListField photosState={photosState} title="Photos (optional)"
            hint="Up to 10 photos showing the damage." altPrefix="Damage photo" />
        </div>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog variant="primary"
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
  const [reasonChoice,      setReasonChoice]      = useState('')
  const [reasonDetail,      setReasonDetail]      = useState('')
  const [saved,             setSaved]             = useState(null)   // { harvest, reason } once the harvest is recorded
  const [isPrinting,        setIsPrinting]        = useState(false)
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
        const ready = (r.data.disaster_response || []).filter(d => d.status !== 'Recovered' && d.can_recover !== false && d.all_rules_done)
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
  const timing = harvestTiming(record.date_planted, expectedHarvestDate, harvestStartDate)
  const harvestVarianceDays = timing.varianceDays
  const { isEarly, isLate } = timing
  const reasonRequired = isEarly || isLate
  const reasonText = composeReason(reasonChoice, reasonDetail)
  const reasonOptions = isEarly ? EARLY_REASONS : LATE_REASONS
  const changeHarvestDate = (v) => {
    setHarvestStartDate(v)
    // The early and late lists differ: a reason picked for one is not carried over to the other.
    setReasonChoice(''); setReasonDetail('')
  }

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
    if (reasonRequired && reasonProblem(reasonChoice, reasonDetail)) {
      showToast(`A reason is required — this harvest is ${Math.abs(harvestVarianceDays)} days ${isEarly ? 'early' : 'late'}. ${reasonProblem(reasonChoice, reasonDetail)}`, 'error')
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

      const res = await api.post('/production/create/', {
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
        early_late_reason:       reasonRequired ? reasonText : '',
        remarks:                 harvestNotes,
      })

      showToast('Harvest recorded successfully!', 'success')
      setSaved({ harvest: res.data, reason: reasonRequired ? reasonText : '', recordedOn: localToday() })
      onSuccess()   // refreshes the list behind this window; the window stays open for Print report
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to record harvest.'), 'error')
    } finally { setIsSubmitting(false) }
  }

  const handlePrint = async () => {
    setIsPrinting(true)
    try {
      await printSpec(buildHarvestReportSpec({
        record, harvest: saved.harvest, reason: saved.reason, notes: harvestNotes, recordedOn: saved.recordedOn,
      }))
    } catch {
      showToast('The report could not be printed. Please try again.', 'error')
    } finally { setIsPrinting(false) }
  }

  if (saved) {
    const t = harvestTiming(record.date_planted, expectedHarvestDate, saved.harvest.harvest_start_date)
    return (
      <ModalShell
        title="Harvest Recorded"
        subtitle={`${cropName} — saved`}
        icon={CheckCircle2}
        iconBg="bg-emerald-100"
        iconColor="text-emerald-600"
        onClose={onClose}
        maxWidth="max-w-md"
        footer={
          <>
            <button type="button" onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Close
            </button>
            <button type="button" onClick={handlePrint} disabled={isPrinting}
              className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
              <Printer size={15} /> {isPrinting ? 'Preparing…' : 'Print report'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>The harvest of <span className="font-medium">{cropName}</span> was recorded. You can print a report of it now.</p>
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <dt className="text-slate-500">Harvest date</dt><dd className="font-medium">{saved.harvest.harvest_start_date}</dd>
            {t.varianceDays !== null && (<><dt className="text-slate-500">Timing</dt><dd className="font-medium">
              {t.varianceDays === 0 ? 'On the expected date'
                : `${Math.abs(t.varianceDays)} day${Math.abs(t.varianceDays) === 1 ? '' : 's'} ${t.varianceDays < 0 ? 'earlier' : 'later'} than expected`}
            </dd></>)}
            {saved.reason && (<><dt className="text-slate-500">Reason</dt><dd className="font-medium">{saved.reason}</dd></>)}
            <dt className="text-slate-500">Quantity</dt><dd className="font-medium">{saved.harvest.volume_kg} {saved.harvest.unit_of_measure}</dd>
          </dl>
        </div>
      </ModalShell>
    )
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
        footer={
          <>
            <button type="button" onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmitClick}
              disabled={isSubmitting || (reasonRequired && Boolean(reasonProblem(reasonChoice, reasonDetail)))}
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
              {isSubmitting ? 'Saving…' : 'Save Harvest Record'}
            </button>
          </>
        }
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
            <div className={`rounded-xl border px-3 py-2 text-xs ${
              harvestVarianceDays === null
                ? 'border-slate-200 bg-slate-50 text-slate-600'
                : reasonRequired
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}>
              <p>
                Expected harvest: <span className="font-medium">{expectedHarvestDate}</span>{' '}
                ({daysFromNowToExpected >= 0
                  ? `${daysFromNowToExpected} day${daysFromNowToExpected !== 1 ? 's' : ''} from now`
                  : `${Math.abs(daysFromNowToExpected)} day${Math.abs(daysFromNowToExpected) !== 1 ? 's' : ''} ago`})
              </p>
              {/* Live comparison against the Harvest Start Date below — updates
                  as it's picked (it defaults to today, so this shows immediately
                  on open too), not just once the >7-day mandatory-reason
                  threshold is crossed. This is the actual "am I meeting the
                  estimate" answer the static date alone doesn't give. */}
              {harvestVarianceDays !== null && (
                <p className="mt-1 font-medium">
                  {harvestVarianceDays === 0
                    ? '✓ Right on the expected harvest date.'
                    : harvestVarianceDays < 0
                      ? `${Math.abs(harvestVarianceDays)} day${Math.abs(harvestVarianceDays) !== 1 ? 's' : ''} earlier than expected.`
                      : `${harvestVarianceDays} day${harvestVarianceDays !== 1 ? 's' : ''} later than expected.`}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Harvest Start Date *</label>
              <input type="date" className={baseInputClasses} value={harvestStartDate}
                max={todayISO()}
                onChange={e => {
                  changeHarvestDate(e.target.value)
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
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3" data-testid="harvest-reason">
              <p className="text-xs font-medium text-amber-800 mb-2">
                This is {Math.abs(harvestVarianceDays)} days {isEarly ? 'earlier' : 'later'} than the expected harvest date
                {isEarly && timing.percentGrown !== null ? ` — the crop has grown ${timing.percentGrown}% of its expected growing time` : ''}.
              </p>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Reason for {isEarly ? 'early' : 'late'} harvest *
              </label>
              <select className={baseInputClasses} value={reasonChoice} onChange={e => setReasonChoice(e.target.value)}>
                <option value="">Choose a reason</option>
                {reasonOptions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {reasonChoice && (
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    {reasonChoice === OTHER_REASON ? 'Describe the reason *' : 'Details (optional)'}
                  </label>
                  <input type="text" className={baseInputClasses} value={reasonDetail} maxLength={200}
                    onChange={e => setReasonDetail(e.target.value)}
                    placeholder={reasonChoice === OTHER_REASON ? 'What made you harvest early?' : 'e.g. signal no. 3 expected on Friday'} />
                </div>
              )}
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
            {/* Estimated yield (crop_type.yield_per_ha_kg × area_planted_ha,
                computed server-side and already on the record) — same live
                "meeting the estimate or not" comparison as the harvest date
                above, against what's actually typed here, converted to kg
                first via unitToKgFactor whenever the selected Unit of
                Measure has a real, unambiguous kg equivalent (kg itself,
                Metric Ton, Cavan). The rest of this app still treats
                Quantity Harvested as a raw kg figure regardless of unit
                (see HarvestRecordCreateSerializer/volume_kg) — this
                comparison is display-only and doesn't change what gets
                submitted. */}
            {record.estimated_yield_kg != null && (() => {
              const kgFactor = unitToKgFactor(unitOfMeasure)
              const enteredKg = quantityHarvested && !isNaN(parseFloat(quantityHarvested))
                ? parseFloat(quantityHarvested) * (kgFactor ?? 1)
                : null
              return (
                <div className={`mt-2 rounded-xl border px-3 py-2 text-xs ${
                  enteredKg === null
                    ? 'border-slate-200 bg-slate-50 text-slate-600'
                    : enteredKg >= parseFloat(record.estimated_yield_kg)
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}>
                  <p>
                    Estimated yield: <span className="font-medium">
                      {Number(record.estimated_yield_kg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                    </span>
                  </p>
                  {kgFactor === null && unitOfMeasure !== 'kg' && (
                    <p className="mt-1 text-slate-500">
                      No standard kg conversion exists for "{unitOfMeasure}" — this comparison assumes the number
                      entered is already in kg.
                    </p>
                  )}
                  {enteredKg !== null && (
                    <p className="mt-1 font-medium">
                      {(() => {
                        const diff = enteredKg - parseFloat(record.estimated_yield_kg)
                        const pct = record.estimated_yield_kg != 0 ? Math.abs((diff / parseFloat(record.estimated_yield_kg)) * 100) : 0
                        if (Math.abs(diff) < 0.01) return '✓ Right at the estimated yield.'
                        return diff > 0
                          ? `${diff.toFixed(2)} kg above estimate (${pct.toFixed(0)}% more).`
                          : `${Math.abs(diff).toFixed(2)} kg below estimate (${pct.toFixed(0)}% less).`
                      })()}
                    </p>
                  )}
                </div>
              )
            })()}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Notes (optional)</label>
            <textarea rows={2} className={`${baseInputClasses} resize-none`} value={harvestNotes}
              onChange={e => setHarvestNotes(e.target.value)}
              placeholder="Any additional harvest notes or observations" />
          </div>
        </div>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog variant="primary"
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

// Mirrors HarvestRecordCreateView.create()'s date_planted_is_estimated block on the backend (the real
// enforcement - this is client-side UX only, to explain it before the user opens the modal rather than after a
// rejected submit). A crop can otherwise be harvested at any time: an early harvest asks for a reason in the form.
function harvestGateInfo(row) {
  if (row.date_planted_is_estimated) {
    return {
      gated: true,
      message: 'This record’s planting date is an estimate (imported from a registry record, ' +
        'not a confirmed field date). Harvest cannot be recorded until a staff member confirms or ' +
        'corrects the real planting date.',
    }
  }
  return { gated: false, message: null }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// Mirrors FisheriesRecordsPage's own STATUS_TONES exactly (Stocked/Planted
// both green as the initial active state) so the two domains' status
// columns read as one consistent system, not two independently-invented ones.
// 'Due Harvest'/'Ready for Harvest'/'Overdue' are NOT real backend status
// values — see getCropDisplayStatus below — but need their own tone entries
// since the pill renders whatever that function returns, never the raw
// 'Near Harvest' string directly. 'Overdue' shares 'rose' with 'Ready for
// Harvest'/'Total Loss' rather than inventing a new hue — this system
// already relies on the text+dot to distinguish same-tone states (also
// matches components/UI/StatusPill.jsx's own OVERDUE: TONE.rose mapping).
const STATUS_TONES = {
  Planted:             'green',
  'Near Harvest':      'amber',
  'Due Harvest':       'amber',
  'Ready for Harvest': 'rose',
  Overdue:             'rose',
  Harvested:           'blue',
  'Total Loss':        'rose',
}

// Display-only reinterpretation of the real 'Near Harvest' backend status —
// the backend enum, model, and stored value are untouched; this only
// decides which of three words the pill shows for a record already inside
// that existing ≤7-day-or-later window (a record that's sat in 'Near
// Harvest' unharvested for a while never moves itself past that raw value —
// see CropInformationPage's own getDisplayStatus for the same gap on the
// Planted side). Every other status (Planted/Harvested/Total Loss) passes
// through unchanged.
//
// Two boundaries, both single `<` /`<=` tests so every day maps to exactly
// one label:
//   diffDays >  0   -> 'Due Harvest'       (still counting down)
//   -7 <= diffDays <= 0 -> 'Ready for Harvest'  (day 0 = harvest date has
//                          arrived, through a week past — still "just
//                          became ready", not yet neglected)
//   diffDays < -7   -> 'Overdue'           (more than a week past due with
//                          no harvest recorded — mirrors the width of the
//                          existing 7-day Near-Harvest window itself, the
//                          only other day-count already meaningful in this
//                          codebase, rather than inventing an arbitrary
//                          second number)
function getCropDisplayStatus(rec) {
  if (rec.status !== 'Near Harvest' || !rec.expected_harvest_date) return rec.status
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expected = new Date(rec.expected_harvest_date + 'T00:00:00')
  const diffDays = Math.round((expected - today) / (1000 * 60 * 60 * 24))
  if (diffDays < -7) return 'Overdue'
  return diffDays <= 0 ? 'Ready for Harvest' : 'Due Harvest'
}

const COLUMNS = [
  { key: 'crop_cell',       label: 'CROP' },
  { key: 'variety_col',     label: 'VARIETY' },
  { key: 'farmer_col',      label: 'FARMER' },
  { key: 'organization_col', label: 'ORGANIZATION' },
  { key: 'location_col',    label: 'BARANGAY' },
  { key: 'date_planted',    label: 'DATE PLANTED' },
  { key: 'expected_harvest_cell', label: 'EXPECTED HARVEST' },
  { key: 'logs_cell',       label: 'LOGS', center: true },
  { key: 'status_cell',     label: 'STATUS' },
  { key: 'actions',         label: 'ACTIONS' },
]

export default function CropMonitoringPage() {
  const isPhone = useIsPhone()
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()

  const [records,          setRecords]          = useState([])
  const [totalCount,       setTotalCount]       = useState(0)
  const [page,             setPage]             = useState(1)
  const [isLoading,        setIsLoading]        = useState(true)
  const [error,            setError]            = useState('')
  const [search,           setSearch]           = useState('')
  // The search runs on the server over every record (farmer, RSBSA, crop,
  // organization, barangay), so it is debounced, and a slower earlier answer
  // can never overwrite the one for what is typed now.
  const debouncedSearch = useDebouncedValue(search.trim())
  const requestSeq = useRef(0)
  const [statusFilter,     setStatusFilter]     = useState('Planted,Near Harvest')
  const [seasonFilter,     setSeasonFilter]     = useState('')
  const [yearFilter,       setYearFilter]       = useState('')
  const [barangayFilter,   setBarangayFilter]   = useState(() => searchParams.get('barangay') || '')
  // Crop name: one of the active crop types (the same list Forecasting filters by).
  const [cropFilter,       setCropFilter]       = useState('')
  const [cropTypes,        setCropTypes]        = useState([])
  useEffect(() => {
    api.get('/production/crop-types/', { params: { is_active: 'true' } })
      .then(r => setCropTypes(Array.isArray(r.data) ? r.data : (r.data.results || [])))
      .catch(() => {})
  }, [])
  // Grouped by crop (default), by farmer, or a plain list. `version` makes an open grouped table load again after an action.
  const [groupBy,          setGroupBy]          = useState(DEFAULT_GROUP)
  const [version,          setVersion]          = useState(0)
  const [viewLogsRecord,   setViewLogsRecord]   = useState(null)
  const [logsStartForm,    setLogsStartForm]    = useState(false)   // open the logs window on the add-activity form
  const [disasterRecord,   setDisasterRecord]   = useState(null)
  const [harvestRecord,    setHarvestRecord]    = useState(null)

  // Handle ?filter=for_harvest from dashboard
  useEffect(() => {
    const filter = searchParams.get('filter')
    if (filter === 'for_harvest') setStatusFilter('Near Harvest')
    const barangay = searchParams.get('barangay')
    if (barangay) setBarangayFilter(barangay)
  }, [])

  // ?record=<id> (a link from a farmer's profile): open that record's details window. The endpoint applies the usual
  // access rules, so a record that cannot be opened simply does not open.
  const linkedRecordId = searchParams.get('record')
  useEffect(() => {
    if (!linkedRecordId) return undefined
    let cancelled = false
    api.get(`/production/monitoring/${linkedRecordId}/`)
      .then(r => { if (!cancelled) setViewLogsRecord(r.data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [linkedRecordId])

  const fetchRecords = useCallback(async (pageNum = 1) => {
    const seq = ++requestSeq.current
    setIsLoading(true); setError('')
    try {
      const params = { ...monitoringParams({ statusFilter, season: seasonFilter, year: yearFilter, barangay: barangayFilter, cropType: cropFilter, search: debouncedSearch }), page: pageNum }
      const r = await api.get('/production/monitoring/', { params })
      if (seq !== requestSeq.current) return
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
      setTotalCount(typeof r.data?.count === 'number' ? r.data.count : 0)
    } catch {
      if (seq === requestSeq.current) setError('Failed to load crop monitoring records.')
    } finally { if (seq === requestSeq.current) setIsLoading(false) }
  }, [statusFilter, seasonFilter, yearFilter, barangayFilter, cropFilter, debouncedSearch])

  useEffect(() => { setPage(1) }, [statusFilter, seasonFilter, yearFilter, barangayFilter, cropFilter, debouncedSearch])
  // The plain list is only fetched when it is the chosen view; grouped views fetch their own groups.
  useEffect(() => { if (groupBy === 'none') fetchRecords(page) }, [fetchRecords, page, groupBy])
  const refreshAll = useCallback(() => { setVersion(v => v + 1); if (groupBy === 'none') fetchRecords(page) }, [groupBy, fetchRecords, page])

  // Lock indicators for the currently-visible page only — bounded to page
  // size, not a full-table N+1 poll.
  const [lockStatuses, setLockStatuses] = useState({})
  const { isAdmin, isFarmer } = useAuth()
  // A farmer account sees only its own crops, so the Farmer column is redundant, and the record-lock
  // indicators (a staff editing aid) are skipped.
  const columns = isFarmer ? COLUMNS.filter(c => c.key !== 'farmer_col') : COLUMNS

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

  useEffect(() => { if (!isFarmer && groupBy === 'none') refreshLockStatuses(records) }, [records, refreshLockStatuses, isFarmer, groupBy])
  // Records of an opened group: add their lock state to what is already known (same lookup as the list's).
  const addLockStatuses = useCallback(async (recs) => {
    if (isFarmer || !recs.length) return
    const entries = await Promise.all(recs.map(async rec => {
      try {
        const r = await api.get('/locks/status/', { params: { record_type: 'crop', record_id: rec.id } })
        return [rec.id, r.data.locked ? r.data : null]
      } catch { return [rec.id, null] }
    }))
    setLockStatuses(prev => ({ ...prev, ...Object.fromEntries(entries.filter(([, v]) => v)) }))
  }, [isFarmer])

  const handleForceUnlock = async (recordId) => {
    try {
      await api.post('/locks/release/', { record_type: 'crop', record_id: recordId })
      refreshLockStatuses(records)
    } catch { /* ignore */ }
  }

  const filtered = records   // the server already applied every filter, including the Due / Ready / Overdue split

  const buildRow = (rec) => ({
    ...rec,
    variety_col: rec.variety_used || <span className="text-[#A8BCA8]">—</span>,
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
        <StatusPill tone={STATUS_TONES[getCropDisplayStatus(rec)] || 'slate'}>{getCropDisplayStatus(rec)}</StatusPill>
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
    expected_harvest_cell: rec.expected_harvest_date || '—',
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
          rec.status !== 'Total Loss' && rec.status !== 'Harvested' && {
            key: 'activity', label: 'Record Activity', icon: ClipboardList, onClick: () => { setLogsStartForm(true); setViewLogsRecord(rec) },
          },
          { key: 'logs', label: 'View Crop Details', icon: Eye, onClick: () => { setLogsStartForm(false); setViewLogsRecord(rec) } },
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
  })
  const rows = filtered.map(buildRow)

  // Inside a group the grouping column is left out: its name is the group's heading.
  const groupedColumns = columns.filter(c => c.key !== (groupBy === 'farmer' ? 'farmer_col' : 'crop_cell'))

  return (
    <PageLayout title="Crop Monitoring" subtitle={isFarmer ? 'Track activities and progress for your crops.' : 'Track activities and progress for each crop.'}>
      <div className="space-y-4">
        <FilterPanel
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={isFarmer ? 'Search by crop or barangay...' : 'Search by farmer, RSBSA, crop, or organization...'}
          activeCount={[statusFilter !== 'Planted,Near Harvest', Boolean(seasonFilter), Boolean(yearFilter), Boolean(barangayFilter), Boolean(cropFilter), groupBy !== DEFAULT_GROUP].filter(Boolean).length}
        >
          <select className={filterSelectCls} value={groupBy} onChange={e => setGroupBy(e.target.value)} aria-label="Group by">
            {GROUP_OPTIONS.filter(o => !(isFarmer && o.value === 'farmer')).map(o => <option key={o.value} value={o.value}>{o.value === 'none' ? o.label : `Group by ${o.label}`}</option>)}
          </select>
          <select className={filterSelectCls} value={cropFilter} onChange={e => setCropFilter(e.target.value)} aria-label="Crop name">
            <option value="">All Crops</option>
            {cropTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={filterSelectCls} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="Planted,Near Harvest">Active Crops</option>
            <option value="Near Harvest">Near Harvest</option>
            <option value="Due Harvest">Due Harvest</option>
            <option value="Ready for Harvest">Ready for Harvest</option>
            <option value="Overdue">Overdue</option>
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

        {groupBy !== 'none' ? (
          <GroupedMonitoringTable
            key={`${groupBy}|${JSON.stringify(monitoringParams({ statusFilter, season: seasonFilter, year: yearFilter, barangay: barangayFilter, cropType: cropFilter, search: debouncedSearch }))}`}
            groupBy={groupBy}
            params={monitoringParams({ statusFilter, season: seasonFilter, year: yearFilter, barangay: barangayFilter, cropType: cropFilter, search: debouncedSearch })}
            version={version}
            columns={groupedColumns}
            buildRow={buildRow}
            phoneTitleKey={groupBy === 'farmer' ? 'crop_cell' : 'variety_col'}
            phoneSubtitleKey={groupBy === 'farmer' ? 'variety_col' : 'farmer_col'}
            onRecordsLoaded={addLockStatuses}
            emptyText={isFarmer ? 'Your crops will appear here once the office registers them.' : 'No monitoring records found'}
          />
        ) : (<>
        {error && <ErrorMessage message={error} />}

        {isFarmer || isPhone ? (
          // A farmer account, and any account on a phone, gets the system's standard table: cards on a phone, a table
          // on a larger screen (the same DataTable the Fisheries pages use), instead of this page's sideways-scrolling
          // staff table.
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            phoneTitleKey="crop_cell"
            phoneSubtitleKey="farmer_col"
            emptyState={(
              <div className="px-4 py-12 text-center">
                <p className="text-[14px] font-medium text-[#4A5E4A]">No monitoring records found</p>
                <p className="text-[13px] text-[#7A8E7A]">{isFarmer ? 'Your crops will appear here once the office registers them.' : 'Add crop records to begin monitoring'}</p>
              </div>
            )}
          />
        ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1B4D2E] text-white">
              <tr>
                {columns.map(col => (
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
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-[13px]">
                        <div className="h-4 bg-[#E8EEE8] rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-[#C8D5C8]">
                      <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
                      <p className="text-[14px] font-medium text-[#4A5E4A]">No monitoring records found</p>
                      <p className="text-[13px] text-[#7A8E7A]">{isFarmer ? 'Your crops will appear here once the office registers them.' : 'Add crop records to begin monitoring'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id} className="border-b border-[#F0F4F0] transition-colors hover:bg-[#F9FAF9]">
                    {columns.map(col => (
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
        )}

        <PaginationBar
          page={page}
          totalCount={totalCount}
          pageSize={10}
          onPageChange={setPage}
        />
        </>)}
      </div>

      {viewLogsRecord && (
        <ViewLogsModal
          record={viewLogsRecord}
          initialForm={logsStartForm}
          onClose={() => { setViewLogsRecord(null); setLogsStartForm(false) }}
          onLogAdded={refreshAll}
        />
      )}

      {disasterRecord && (
        <DisasterReportModal
          record={disasterRecord}
          onClose={() => setDisasterRecord(null)}
          onSuccess={refreshAll}
        />
      )}

      {harvestRecord && (
        <RecordHarvestFromMonitoringModal
          record={harvestRecord}
          onClose={() => setHarvestRecord(null)}
          onSuccess={refreshAll}
        />
      )}

    </PageLayout>
  )
}
