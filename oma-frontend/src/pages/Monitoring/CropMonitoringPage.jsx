import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Bug, Eye, FileText, Leaf, MoreVertical, TrendingUp, Wheat,
} from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
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
  Low:    'bg-[#4CAF50] text-white',
  HIGH:   'bg-rose-500 text-white',
  MEDIUM: 'bg-amber-500 text-white',
  LOW:    'bg-[#4CAF50] text-white',
}

const fmtDate = (v) => {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

// ── Suggestions Modal ─────────────────────────────────────────────────────────

function SuggestionsModal({ record, onClose, onApply }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!record) return
    setLoading(true)
    api.get(`/production/monitoring/${record.id}/suggestions/`)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [record])

  if (!record) return null

  const groups = {
    overdue: { label: 'Overdue', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700' },
    due_now: { label: 'Due Now', color: 'text-[#1E4620]', bg: 'bg-[#f0f7f0]', border: 'border-[#c5e0c5]', badge: 'bg-[#1E4620] text-white' },
    upcoming: { label: 'Upcoming', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
    done: { label: 'Done', color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-200 text-slate-600' },
  }

  const groupOrder = ['overdue', 'due_now', 'upcoming', 'done']

  const suggestions = data?.suggestions || []
  const daysElapsed = data?.days_elapsed ?? 0
  const totalDays = data?.total_days ?? 0
  const progressPct = totalDays > 0 ? Math.min(100, Math.round((daysElapsed / totalDays) * 100)) : 0

  return (
    <ModalShell title={`Activity Suggestions — ${record.crop_type_name}`} onClose={onClose} maxWidth="max-w-lg">
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-8 h-8 border-4 border-[#1E4620] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Progress bar */}
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Growing Progress</span>
              <span className="text-sm font-semibold text-[#1E4620]">Day {daysElapsed} of {totalDays} days</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1E4620] rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Grouped suggestions */}
          {groupOrder.map(key => {
            const group = groups[key]
            const items = suggestions.filter(s => s.status === key)
            if (items.length === 0) return null
            return (
              <div key={key}>
                <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${group.color}`}>
                  {group.label} ({items.length})
                </h4>
                <div className="space-y-2">
                  {items.map(s => (
                    <div
                      key={s.id}
                      className={`rounded-xl border p-4 ${group.bg} ${group.border}`}
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
                        </div>
                        {key !== 'done' && (
                          <button
                            onClick={() => { onApply(s); onClose(); }}
                            className="shrink-0 text-xs font-medium bg-[#1E4620] text-white px-3 py-1.5 rounded-lg hover:bg-[#163318] transition"
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

          {suggestions.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">No activity stages defined for this crop type.</p>
          )}
        </div>
      )}
    </ModalShell>
  )
}

// ── View Logs Modal ───────────────────────────────────────────────────────────

function ViewLogsModal({ record, onClose, onLogAdded }) {
  const { showToast } = useToast()
  const [logs,         setLogs]         = useState([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [showSuggest,  setShowSuggest]  = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/production/monitoring/${record.id}/logs/`)
      setLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      showToast('Failed to load activity logs.', 'error')
    } finally { setIsLoading(false) }
  }, [record.id])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const resetForm = () => {
    setActivityType('')
    setActivityDate(todayISO())
    setPlantCondition('')
    setFertilizerType('')
    setQuantityApplied('')
    setQuantityUnit('kg')
    setPestDiseaseName('')
    setAreaAffected('')
    setSeverity('')
    setNotes('')
  }

  const handleSubmitClick = () => {
    if (!activityType) { showToast('Please select an activity.', 'error'); return }
    if (!activityDate) { showToast('Activity date is required.', 'error'); return }
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      await api.post(`/production/monitoring/${record.id}/logs/`, {
        activity_type:    activityType,
        activity_date:    activityDate,
        plant_condition:  plantCondition,
        fertilizer_type:  showFertilizerFields ? fertilizerType : '',
        quantity_applied: showFertilizerFields ? (quantityApplied || null) : null,
        quantity_unit:    showFertilizerFields ? quantityUnit : '',
        pest_disease_name: showPestFields ? pestDiseaseName : '',
        area_affected_ha:  showPestFields ? (areaAffected || null) : null,
        severity:          showPestFields ? severity : '',
        notes,
      })
      showToast('Activity log added.', 'success')
      resetForm()
      setShowForm(false)
      await fetchLogs()
      onLogAdded()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to save log.', 'error')
    } finally { setIsSubmitting(false) }
  }

  const handleApplySuggestion = (s) => {
    setActivityType(s.activity_name)
    setNotes(s.recommendation || '')
    setShowSuggest(false)
    setShowForm(true)
  }

  const assocLabel = record.association_name || record.farmer_name || '—'

  return (
    <>
      <ModalShell
        title={record.crop_type_name?.toUpperCase() ?? 'CROP'}
        subtitle={`${assocLabel} - Planted: ${record.date_planted || '—'}`}
        icon={FileText}
        onClose={onClose}
        maxWidth="max-w-sm"
      >
        {/* TOP ROW */}
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={() => { setShowForm(v => !v); if (showForm) resetForm() }}
            className="text-sm font-medium text-[#1E4620] hover:underline">
            {showForm ? '— Cancel' : '+ Add New Log'}
          </button>
          <button type="button" onClick={() => setShowSuggest(true)}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
            🌿 Get Suggestions
          </button>
        </div>

        {/* Inline form */}
        {showForm && (
          <div className="mb-4 space-y-3">
            {/* Activity + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Activity *</label>
                <select className={baseInputClasses} value={activityType}
                  onChange={e => setActivityType(e.target.value)}>
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
              <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-green-800 mb-2 flex items-center gap-1">
                  <Leaf className="w-3.5 h-3.5" /> Fertilizer Details
                </p>
                <div className="mb-2">
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Type of Fertilizer</label>
                  <input type="text" value={fertilizerType} onChange={e => setFertilizerType(e.target.value)}
                    placeholder="e.g. 14-14-14 NPK, Urea 46-0-0, Organic"
                    className={baseInputClasses} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Quantity Applied</label>
                    <input type="number" step="0.01" value={quantityApplied}
                      onChange={e => setQuantityApplied(e.target.value)}
                      placeholder="e.g. 50" className={baseInputClasses} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Unit</label>
                    <select value={quantityUnit} onChange={e => setQuantityUnit(e.target.value)}
                      className={baseInputClasses}>
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
                    placeholder="e.g. Brown Planthopper, Bacterial Blight"
                    className={baseInputClasses} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Area Affected (ha)</label>
                    <input type="number" step="0.0001" value={areaAffected}
                      onChange={e => setAreaAffected(e.target.value)}
                      placeholder="e.g. 1.50" className={baseInputClasses} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Severity</label>
                    <select value={severity} onChange={e => setSeverity(e.target.value)}
                      className={baseInputClasses}>
                      <option value="">Select</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Plant Condition — always visible */}
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

            {/* Recommendations */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Recommendations</label>
              <textarea rows={3} className={`${baseInputClasses} resize-none`}
                placeholder="Recommendations (optional)"
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            <button type="button" disabled={isSubmitting} onClick={handleSubmitClick}
              className="w-full rounded-xl bg-[#1E4620] py-2.5 text-sm font-medium text-white hover:bg-[#2D6A31] disabled:opacity-60">
              {isSubmitting ? 'Saving…' : 'Add Log'}
            </button>
          </div>
        )}

        {/* Activity Logs header */}
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#4CAF50]" />
          <span className="text-sm font-semibold text-slate-700">Activity Logs</span>
        </div>

        {/* Logs list */}
        {isLoading ? (
          <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="py-4 text-center text-sm italic text-slate-400">No logs yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map(log => (
              <div key={log.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">{log.activity_type}</span>
                  <span className="shrink-0 text-xs text-slate-400">{fmtDate(log.activity_date)}</span>
                </div>

                {log.plant_condition && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${
                    log.plant_condition === 'Good'
                      ? 'bg-green-100 text-green-700'
                      : log.plant_condition === 'Fair'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-600'
                  }`}>
                    {log.plant_condition}
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
            ))}
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
    </>
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

  const cropName = record.crop_type_name || 'this crop'

  const handleSubmitClick = () => {
    if (!disasterType)     { showToast('Please select a disaster type.', 'error'); return }
    if (!dateOfOccurrence) { showToast('Date of occurrence is required.', 'error'); return }
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      await api.post(`/production/monitoring/${record.id}/disasters/`, {
        disaster_type:     disasterType,
        date_of_occurrence: dateOfOccurrence,
        area_affected_ha:  areaAffectedHa || null,
        estimated_damage:  estimatedDamage,
        production_loss:   productionLoss,
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
            <input type="date" className={baseInputClasses} value={dateOfOccurrence}
              onChange={e => setDateOfOccurrence(e.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Area Affected (ha)</label>
            <input type="number" step="0.01" className={baseInputClasses} value={areaAffectedHa}
              onChange={e => setAreaAffectedHa(e.target.value)}
              placeholder="e.g. 2.50" />
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
  const [harvestStartDate, setHarvestStartDate] = useState(todayISO())
  const [harvestEndDate,   setHarvestEndDate]   = useState('')
  const [areaHarvested,    setAreaHarvested]     = useState(record.area_planted_ha ? String(record.area_planted_ha) : '')
  const [unitOfMeasure,    setUnitOfMeasure]     = useState('kg')
  const [quantityHarvested, setQuantityHarvested] = useState('')
  const [harvestNotes,     setHarvestNotes]      = useState('')
  const [showConfirm,      setShowConfirm]       = useState(false)
  const [isSubmitting,     setIsSubmitting]      = useState(false)
  const [dateError,        setDateError]         = useState('')

  const cropName = record.crop_type_name || 'this crop'

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

  const handleSubmitClick = () => {
    if (!harvestStartDate) { showToast('Harvest start date is required.', 'error'); return }
    if (!areaHarvested)    { showToast('Area harvested is required.', 'error'); return }
    if (!quantityHarvested){ showToast('Quantity harvested is required.', 'error'); return }
    if (dateError) return
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      // Determine season from harvest start date
      const month = new Date(harvestStartDate).getMonth() + 1
      const season = (month >= 6 && month <= 11) ? 'Wet' : 'Dry'
      const year = new Date(harvestStartDate).getFullYear()

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
              <label className="mb-1 block text-xs font-medium text-slate-700">Harvest End Date <span className="font-normal text-slate-400">(optional)</span></label>
              <input type="date" className={baseInputClasses} value={harvestEndDate}
                min={harvestStartDate || undefined}
                onChange={e => handleEndDateChange(e.target.value)} />
            </div>
          </div>
          {dateError && <p className="text-xs font-medium text-rose-600">{dateError}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Area Harvested (ha) *</label>
              <input type="number" step="0.0001" className={baseInputClasses} value={areaHarvested}
                onChange={e => setAreaHarvested(e.target.value)} placeholder="e.g. 2.50" />
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
            <input type="number" step="0.01" className={baseInputClasses} value={quantityHarvested}
              onChange={e => setQuantityHarvested(e.target.value)} placeholder="e.g. 500" />
          </div>

          {yieldPerHa && (
            <div className="bg-[#f0fdf4] border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  Yield per Hectare: {Number(yieldPerHa).toLocaleString()} {unitOfMeasure}/ha
                </p>
                <p className="text-xs text-green-600">Auto-computed from quantity ÷ area harvested</p>
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

// ── Main Page ─────────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'crop_type_name',  label: 'CROP' },
  { key: 'association_col', label: 'FARMER ASSOCIATION' },
  { key: 'date_planted',    label: 'DATE PLANTED' },
  { key: 'logs_cell',       label: 'LOGS',    center: true },
  { key: 'actions',         label: 'ACTIONS' },
]

export default function CropMonitoringPage() {
  const [records,          setRecords]          = useState([])
  const [isLoading,        setIsLoading]        = useState(true)
  const [error,            setError]            = useState('')
  const [search,           setSearch]           = useState('')
  const [viewLogsRecord,   setViewLogsRecord]   = useState(null)
  const [disasterRecord,   setDisasterRecord]   = useState(null)
  const [harvestRecord,    setHarvestRecord]    = useState(null)
  const [openDropdownId,   setOpenDropdownId]   = useState(null)
  const dropdownRefs = useRef({})

  const fetchRecords = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get('/production/monitoring/')
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load crop monitoring records.')
    } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  useEffect(() => {
    const handleClickOutside = (e) => {
      const clickedOutside = Object.values(dropdownRefs.current)
        .every(ref => ref && !ref.contains(e.target))
      if (clickedOutside) setOpenDropdownId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleDropdown = (id) => setOpenDropdownId(prev => prev === id ? null : id)

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
    association_col: rec.association_name || '—',
    logs_cell: rec.log_count ?? 0,
    actions: (
      <div className="flex items-center gap-1.5">
        <button type="button"
          onClick={() => setViewLogsRecord(rec)}
          className="flex items-center gap-1.5 rounded-lg bg-[#1E4620] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2D6A31] transition-colors">
          <Eye className="h-3.5 w-3.5" />
          View Logs
        </button>

        <div className="relative" ref={el => { dropdownRefs.current[rec.id] = el }}>
          <button type="button"
            onClick={() => toggleDropdown(rec.id)}
            className="border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm p-1.5 rounded-lg transition-colors">
            <MoreVertical className="w-4 h-4" />
          </button>

          {openDropdownId === rec.id && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[180px] z-50">
              <button type="button"
                onClick={() => { setViewLogsRecord(rec); setOpenDropdownId(null) }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                <Eye className="w-4 h-4 text-slate-500" />
                View Logs
              </button>

              <div className="border-t border-slate-100 my-1" />

              <button type="button"
                onClick={() => { setHarvestRecord(rec); setOpenDropdownId(null) }}
                className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm transition-colors ${
                  isNearHarvest(rec)
                    ? 'text-amber-700 hover:bg-amber-50 font-medium'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}>
                <Wheat className={`w-4 h-4 ${isNearHarvest(rec) ? 'text-amber-500' : 'text-slate-400'}`} />
                <div className="text-left">
                  <p>Record Harvest</p>
                  {isNearHarvest(rec) && (
                    <p className="text-xs text-amber-600 font-normal">Nearing harvest date</p>
                  )}
                </div>
              </button>

              <button type="button"
                onClick={() => { setDisasterRecord(rec); setOpenDropdownId(null) }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                <AlertTriangle className="w-4 h-4 text-slate-400" />
                Report Disaster
              </button>
            </div>
          )}
        </div>
      </div>
    ),
  }))

  return (
    <PageLayout title="Crop Monitoring" subtitle="Track activities and progress for each crop.">
      <div className="space-y-4">
        <input
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm placeholder-slate-400 focus:border-[#1E4620] focus:outline-none"
          placeholder="Search by crop or association..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {error && <ErrorMessage message={error} />}

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1E4620] text-white">
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide ${col.center ? 'text-center' : 'text-left'}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-10 text-center text-sm text-slate-400">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-10 text-center text-sm text-slate-400">No crop monitoring records found.</td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50">
                    {COLUMNS.map(col => (
                      <td key={col.key}
                        className={`px-4 py-3 text-sm text-slate-800 ${col.center ? 'text-center' : ''}`}>
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
          onSuccess={() => { setHarvestRecord(null); fetchRecords() }}
        />
      )}
    </PageLayout>
  )
}
