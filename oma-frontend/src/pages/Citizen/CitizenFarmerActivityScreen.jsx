import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, FileText, SquarePen } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { labels } from './labels.js'
import { todayISO, yesterdayISO } from '../../utils/localDate.js'
import { CROP_THEME, CitizenBody, CitizenScreen, CitizenSubHeader } from './citizenUI.jsx'

// ─── Farmer AKTIBIDAD (frames 21-26) ──────────────────────────────────────
// The farmer log is NOT the fisherfolk log with different colours. The
// reference gives it its own structure: a TANIMAN dropdown instead of record
// cards, a 2x2 grid of Tagalog activity pills instead of icon rows, three
// date pills where the third reveals a picker, a different conditional field
// set per activity, and a collapsible activity history at the bottom of the
// same screen rather than a separate view.
//
// Because TANIMAN is a dropdown, this screen needs no record-picker step --
// the AKTIBIDAD tab opens straight into it with every active crop listed.
//
// Editing happens in place: tapping I-edit on a history row loads that log
// back into the form above, which is why there is one screen and not two.

const FIELD = 'w-full rounded-[10px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3.5 py-[13px] text-[15px] text-cz-text placeholder:text-cz-text-muted focus:border-cz-crop-deep focus:outline-none disabled:opacity-50'

const F = () => labels.ffNew.farmerLog

function Label({ children, optional }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">
      {children}
      {optional && <span className="ml-1.5 font-normal normal-case tracking-normal text-cz-text-muted">{optional}</span>}
    </p>
  )
}

// Pale-tint selection, which is how the reference marks a chosen pill on the
// FARMER side -- the fisherfolk side uses a solid navy fill instead. Both are
// deliberate and both are copied as drawn.
function Pill({ selected, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-[10px] border-[0.5px] px-3.5 py-3 text-[14px] leading-[1.3] transition-colors ${
        selected
          ? 'border-cz-crop-deep bg-cz-crop-pale font-semibold text-cz-crop-deeper'
          : 'border-cz-border bg-cz-surface text-cz-text-2 hover:bg-cz-page'
      } ${className}`}
    >
      {children}
    </button>
  )
}

const BLANK = {
  activity_type: 'Fertilizer Application',
  activity_type_other_specify: '',
  date_of_activity: todayISO(),
  fertilizer_type: '',
  fertilizer_type_other: '',
  quantity_applied: '',
  application_method: '',
  pest_disease_name: '',
  severity: '',
  treatment_used: '',
  plant_condition: '',
  water_quality: '',
  notes: '',
}

export default function CitizenFarmerActivityScreen({ records, initialRecordId, initialActivity, onBack, onSaved, tabBar }) {
  const { showToast } = useToast()
  const { user } = useAuth()
  const t = F()

  const [recordId, setRecordId] = useState(
    initialRecordId || (records[0] ? String(records[0].id) : ''),
  )
  // A suggestion task or a disaster response rule arrives naming an activity.
  // If it is one of the reference's five tiles it selects that tile; anything
  // else (Weeding, Land Preparation, ...) lands on 'Iba pa' with the name
  // already filled in, which is how those values have always been stored.
  const [form, setForm] = useState(() => {
    if (!initialActivity) return BLANK
    const known = Object.keys(labels.ffNew.farmerLog.types).includes(initialActivity)
    return {
      ...BLANK,
      activity_type: known ? initialActivity : 'Other',
      activity_type_other_specify: known ? '' : initialActivity,
    }
  })
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [logs, setLogs] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [dateMode, setDateMode] = useState('today')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!recordId) return undefined
    let cancelled = false
    api.get(`/production/monitoring/${recordId}/logs/`)
      .then((r) => {
        if (cancelled) return
        setLogs(Array.isArray(r.data) ? r.data : (r.data?.results || []))
      })
      .catch(() => { if (!cancelled) setLogs([]) })
    return () => { cancelled = true }
  }, [recordId, saving])

  const activity = form.activity_type
  const isFert = activity === 'Fertilizer Application'
  const isPest = activity === 'Pest Control'
  const isDisease = activity === 'Disease Control'
  const isWater = activity === 'Water Quality Check'
  const isOther = activity === 'Other'

  const resetForm = () => { setForm(BLANK); setEditingId(null); setDateMode('today') }

  const loadForEdit = (log) => {
    setEditingId(log.id)
    setDateMode(
      log.date_of_activity === todayISO() ? 'today'
        : log.date_of_activity === yesterdayISO() ? 'yesterday' : 'custom',
    )
    const known = Object.keys(t.types).includes(log.activity_type)
    setForm({
      ...BLANK,
      activity_type: known ? log.activity_type : 'Other',
      activity_type_other_specify: known ? '' : log.activity_type,
      date_of_activity: log.date_of_activity,
      fertilizer_type: t.fertilizerOptions.includes(log.fertilizer_type) ? log.fertilizer_type : (log.fertilizer_type ? '__other' : ''),
      fertilizer_type_other: t.fertilizerOptions.includes(log.fertilizer_type) ? '' : (log.fertilizer_type || ''),
      quantity_applied: log.quantity_applied ?? '',
      application_method: log.application_method || '',
      pest_disease_name: log.pest_disease_name || '',
      severity: log.severity || '',
      treatment_used: log.treatment_used || '',
      plant_condition: log.plant_condition || '',
      water_quality: log.water_quality || '',
      notes: log.notes || '',
    })
    setHistoryOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async () => {
    if (!recordId) return
    setSaving(true)
    try {
      const fert = form.fertilizer_type === '__other' ? form.fertilizer_type_other : form.fertilizer_type
      // Every conditional field is cleared unless its own activity is
      // selected, so switching type cannot smuggle a stale value through.
      const payload = {
        activity_type: isOther ? 'Other' : activity,
        activity_type_other_specify: isOther ? form.activity_type_other_specify : '',
        date_of_activity: form.date_of_activity,
        fertilizer_type: isFert ? fert : '',
        quantity_applied: isFert && form.quantity_applied !== '' ? form.quantity_applied : null,
        quantity_unit: isFert ? 'kg' : '',
        application_method: isFert ? form.application_method : '',
        pest_disease_name: isPest || isDisease ? form.pest_disease_name : '',
        severity: isPest || isDisease ? form.severity : '',
        treatment_used: isPest || isDisease ? form.treatment_used : '',
        plant_condition: isWater ? form.plant_condition : '',
        water_quality: isWater ? form.water_quality : '',
        notes: form.notes,
      }
      if (editingId) {
        await api.patch(`/production/monitoring/logs/${editingId}/detail/`, payload)
      } else {
        await api.post(`/production/monitoring/${recordId}/logs/`, payload)
      }
      resetForm()
      onSaved?.()
    } catch (err) {
      const detail = err?.response?.data
      const msg = typeof detail === 'string'
        ? detail
        : Object.values(detail || {}).flat().join(' ') || labels.common.genericSaveError
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  const dateOptions = [
    { key: 'today', text: t.dateToday, value: todayISO() },
    { key: 'yesterday', text: t.dateYesterday, value: yesterdayISO() },
    { key: 'custom', text: t.dateOther, value: null },
  ]

  return (
    <CitizenScreen hasTabBar>
      <CitizenSubHeader theme={CROP_THEME} title={t.title} onBack={onBack} />
      <CitizenBody>
        {records.length === 0 ? (
          <p className="px-1 py-8 text-center text-[13px] italic text-cz-text-muted">{t.noCrops}</p>
        ) : (
          <>
            <div className="mb-[18px]">
              <Label>{t.cropHeading}</Label>
              <select
                value={recordId}
                onChange={(e) => { setRecordId(e.target.value); resetForm() }}
                className={FIELD}
              >
                {records.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t.cropOption(
                      r.crop_type_name || labels.yieldAnalysis.cropCropLabel,
                      r.area_planted_ha ?? labels.common.unknown,
                      r.farm_location_barangay || labels.common.unknown,
                    )}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-[18px]">
              <Label>{t.activityHeading}</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(t.types).map(([value, text]) => (
                  <Pill
                    key={value}
                    selected={activity === value}
                    onClick={() => set('activity_type', value)}
                    className="text-left"
                  >
                    {text}
                  </Pill>
                ))}
              </div>
              {isOther && (
                <input
                  type="text"
                  value={form.activity_type_other_specify}
                  onChange={(e) => set('activity_type_other_specify', e.target.value)}
                  placeholder={t.otherPlaceholder}
                  className={`${FIELD} mt-2`}
                />
              )}
            </div>

            <div className="mb-[18px]">
              <Label>{t.dateHeading}</Label>
              <div className="grid grid-cols-3 gap-2">
                {dateOptions.map((opt) => (
                  <Pill
                    key={opt.key}
                    selected={dateMode === opt.key}
                    onClick={() => {
                      setDateMode(opt.key)
                      if (opt.value) set('date_of_activity', opt.value)
                    }}
                  >
                    {opt.text}
                  </Pill>
                ))}
              </div>
              {dateMode === 'custom' && (
                <input
                  type="date"
                  value={form.date_of_activity}
                  max={todayISO()}
                  onChange={(e) => set('date_of_activity', e.target.value)}
                  className={`${FIELD} mt-2`}
                />
              )}
            </div>

            {isFert && (
              <>
                <div className="mb-[18px]">
                  <Label>{t.fertilizerType}</Label>
                  <select
                    value={form.fertilizer_type}
                    onChange={(e) => set('fertilizer_type', e.target.value)}
                    className={FIELD}
                  >
                    <option value="">{t.selectPlaceholder}</option>
                    {t.fertilizerOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                    <option value="__other">{t.types.Other}</option>
                  </select>
                  {form.fertilizer_type === '__other' && (
                    <input
                      type="text"
                      value={form.fertilizer_type_other}
                      onChange={(e) => set('fertilizer_type_other', e.target.value)}
                      className={`${FIELD} mt-2`}
                    />
                  )}
                </div>
                <div className="mb-[18px]">
                  <Label>{t.quantityKg}</Label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.quantity_applied}
                    onChange={(e) => set('quantity_applied', e.target.value)}
                    placeholder={t.quantityPlaceholder}
                    className={FIELD}
                  />
                </div>
                <div className="mb-[18px]">
                  <Label>{t.applicationMethod}</Label>
                  <select
                    value={form.application_method}
                    onChange={(e) => set('application_method', e.target.value)}
                    className={FIELD}
                  >
                    <option value="">{t.selectPlaceholder}</option>
                    {Object.entries(t.methodOptions).map(([v, text]) => (
                      <option key={v} value={v}>{text}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {(isPest || isDisease) && (
              <>
                <div className="mb-[18px]">
                  <Label>{isPest ? t.pestName : t.diseaseName}</Label>
                  <input
                    type="text"
                    value={form.pest_disease_name}
                    onChange={(e) => set('pest_disease_name', e.target.value)}
                    placeholder={isPest ? t.pestPlaceholder : t.diseasePlaceholder}
                    className={FIELD}
                  />
                </div>
                <div className="mb-[18px]">
                  <Label>{t.damageLevel}</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(t.damageOptions).map(([v, text]) => (
                      <Pill key={v} selected={form.severity === v} onClick={() => set('severity', form.severity === v ? '' : v)}>
                        {text}
                      </Pill>
                    ))}
                  </div>
                </div>
                <div className="mb-[18px]">
                  <Label>{isPest ? t.pestTreatment : t.diseaseTreatment}</Label>
                  <input
                    type="text"
                    value={form.treatment_used}
                    onChange={(e) => set('treatment_used', e.target.value)}
                    placeholder={isPest ? t.pestTreatmentPlaceholder : t.diseaseTreatmentPlaceholder}
                    className={FIELD}
                  />
                </div>
              </>
            )}

            {isWater && (
              <>
                <div className="mb-[18px]">
                  <Label>{t.plantCondition}</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(t.conditionOptions).map(([v, text]) => (
                      <Pill key={v} selected={form.plant_condition === v} onClick={() => set('plant_condition', form.plant_condition === v ? '' : v)}>
                        {text}
                      </Pill>
                    ))}
                  </div>
                </div>
                <div className="mb-[18px]">
                  <Label>{t.waterQuality}</Label>
                  <select
                    value={form.water_quality}
                    onChange={(e) => set('water_quality', e.target.value)}
                    className={FIELD}
                  >
                    <option value="">{t.selectPlaceholder}</option>
                    {Object.entries(t.waterOptions).map(([v, text]) => (
                      <option key={v} value={v}>{text}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="mb-[18px]">
              <Label optional={t.notesOptional}>{t.notes}</Label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder={t.notesPlaceholder}
                className={`${FIELD} resize-none`}
              />
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className={`w-full rounded-[10px] py-[15px] text-[15px] font-semibold disabled:opacity-50 ${CROP_THEME.solidBtn}`}
            >
              {editingId ? t.saveEdit : t.save}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="mt-2 w-full rounded-[10px] border-[0.5px] border-cz-border-strong bg-cz-surface py-[13px] text-[14px] font-medium text-cz-text-2"
              >
                {t.cancelEdit}
              </button>
            )}

            <div className="mt-6 border-t-[0.5px] border-cz-border pt-4">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                aria-expanded={historyOpen}
                className="flex w-full items-center gap-2.5 py-1 text-left"
              >
                <FileText size={17} className="shrink-0 text-cz-text-2" aria-hidden="true" />
                <span className="flex-1 text-[15px] font-semibold text-cz-text">{t.historyHeading}</span>
                {historyOpen
                  ? <ChevronUp size={18} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
                  : <ChevronDown size={18} className="shrink-0 text-cz-text-muted" aria-hidden="true" />}
              </button>

              {historyOpen && (
                <div className="mt-3 space-y-2">
                  {logs.length === 0 && (
                    <p className="py-4 text-center text-[13px] italic text-cz-text-muted">{t.historyEmpty}</p>
                  )}
                  {logs.map((log) => {
                    // logged_by_name is derived from recorded_by and is set
                    // for a citizen's OWN logs too, so it cannot be the staff
                    // test by itself -- comparing the id is what distinguishes
                    // them. Same rule FarmerCropHistoryView already uses.
                    const byStaff = log.recorded_by !== user?.id
                    return (
                      <div key={log.id} className="rounded-[10px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-cz-text">
                              {log.activity_type === 'Other'
                                ? (log.activity_type_other_specify || t.types.Other)
                                : log.activity_type}
                            </p>
                            <span className="mt-1.5 inline-block rounded-[6px] bg-cz-crop-pale px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.04em] text-cz-crop-deeper">
                              {byStaff ? labels.ffNew.loggedByStaff : labels.ffNew.loggedByYou}
                            </span>
                            {byStaff && (
                              <p className="mt-1 text-[13px] text-cz-text-2">{log.logged_by_name}</p>
                            )}
                            <p className="text-[13px] text-cz-text-2">
                              {labels.common.formatDate(log.date_of_activity)}
                            </p>
                            {(log.fertilizer_type || log.pest_disease_name || log.notes) && (
                              <p className="mt-1 text-[13px] text-cz-text-2">
                                {[
                                  log.fertilizer_type,
                                  log.quantity_applied ? `${log.quantity_applied} kg` : null,
                                  log.pest_disease_name,
                                  log.notes,
                                ].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                          {!byStaff && (
                            <button
                              type="button"
                              onClick={() => loadForEdit(log)}
                              className="flex shrink-0 items-center gap-1.5 rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3 py-2 text-[13px] font-semibold text-cz-crop-deeper transition-colors hover:bg-cz-page"
                            >
                              <SquarePen size={14} aria-hidden="true" />
                              {t.editBtn}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </CitizenBody>
      {tabBar}
    </CitizenScreen>
  )
}
