import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { CROP_DOMAIN } from './citizenDomainConfig.js'
import { labels } from './labels.js'
import { todayISO, yesterdayISO } from '../../utils/localDate.js'
import { CROP_THEME, CitizenBody, CitizenHomeHeader, CitizenScreen } from './citizenUI.jsx'
import { dayFirstLong, dayFirstShort } from './farmerDates.js'
import { Block, Choice, FIELD, SoftBox } from './farmerFormParts.jsx'

// Farmer AKTIBIDAD form, rebuilt to UPDATED FARMER CITIZEN UI.docx: one white
// card holding the form and the collapsible history, a green-tinted box for
// the activity's own fields, solid-green choice pills, and history rows whose
// I-edit sits under the details.
//
// Same endpoints and payload keys as before. What is new on the wire: the
// plant-condition pills are always offered (the backend already stored
// plant_condition on every activity log) and the fertilizer unit is chosen
// instead of being fixed at kg.
//
// Editing happens in place: I-edit loads that log back into the form above,
// which is why there is one screen and not two. Every row is editable, staff
// entries included — the backend only requires that the record is the
// citizen's own, and the rail card says so.

const F = () => labels.ffNew.farmerLog

// A fresh object per call: the default date must be today when the form is
// opened or reset, not the day the bundle was loaded.
const blank = () => ({
  activity_type: 'Fertilizer Application',
  activity_type_other_specify: '',
  date_of_activity: todayISO(),
  fertilizer_type: '',
  fertilizer_type_other: '',
  quantity_applied: '',
  quantity_unit: 'kg',
  application_method: '',
  pest_disease_name: '',
  severity: '',
  treatment_used: '',
  plant_condition: '',
  water_quality: '',
  notes: '',
})

export default function CitizenFarmerActivityScreen({ records, initialRecordId, initialActivity, initialLogId, onRecordChange, onSaved, tabBar, bare = false }) {
  const { showToast } = useToast()
  const { user } = useAuth()
  const t = F()

  const [recordId, setRecordId] = useState(
    initialRecordId || (records[0] ? String(records[0].id) : ''),
  )
  // Real ActivityType rows for the crop domain, from the admin-managed
  // Activity Settings master data. ComboboxWithOther displays an unmatched
  // value verbatim, so a name not yet loaded (or a historical value no longer
  // offered) still renders correctly.
  const [activityTypeOptions, setActivityTypeOptions] = useState([])

  useEffect(() => {
    let cancelled = false
    api.get(CROP_DOMAIN.activityTypesUrl)
      .then((r) => {
        if (cancelled) return
        const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
        setActivityTypeOptions(rows.filter((x) => x.is_active).map((x) => x.name))
      })
      .catch(() => { if (!cancelled) setActivityTypeOptions([]) })
    return () => { cancelled = true }
  }, [])

  // The desktop rail card names the crop being logged against.
  useEffect(() => { onRecordChange?.(recordId) }, [recordId, onRecordChange])

  // A suggestion task or a disaster response rule arrives naming an activity;
  // that name is stored directly since the dropdown offers the real list.
  const [form, setForm] = useState(() => {
    if (!initialActivity) return blank()
    return { ...blank(), activity_type: initialActivity }
  })
  const [editingId, setEditingId] = useState(null)
  const appliedLogId = useRef(null)
  const [saving, setSaving] = useState(false)
  const [logs, setLogs] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [dateMode, setDateMode] = useState('today')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const activity = form.activity_type
  const isFert = activity === 'Fertilizer Application'
  const isPest = activity === 'Pest Control'
  const isDisease = activity === 'Disease Control'
  const isWater = activity === 'Water Quality Check'
  const isOther = activity === 'Other'

  const resetForm = () => { setForm(blank()); setEditingId(null); setDateMode('today') }

  const loadForEdit = (log) => {
    setEditingId(log.id)
    setDateMode(
      log.date_of_activity === todayISO() ? 'today'
        : log.date_of_activity === yesterdayISO() ? 'yesterday' : 'custom',
    )
    setForm({
      ...blank(),
      activity_type: log.activity_type || 'Other',
      activity_type_other_specify: log.activity_type === 'Other' ? (log.activity_type_other_specify || '') : '',
      date_of_activity: log.date_of_activity,
      fertilizer_type: t.fertilizerOptions.includes(log.fertilizer_type) ? log.fertilizer_type : (log.fertilizer_type ? 'Other' : ''),
      fertilizer_type_other: t.fertilizerOptions.includes(log.fertilizer_type) ? '' : (log.fertilizer_type || ''),
      quantity_applied: log.quantity_applied ?? '',
      quantity_unit: log.quantity_unit || 'kg',
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

  useEffect(() => {
    if (!recordId) return undefined
    let cancelled = false
    api.get(`/production/monitoring/${recordId}/logs/`)
      .then((r) => {
        if (cancelled) return
        const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
        setLogs(rows)
        // Arriving from a crop's history "I-edit": open that entry for editing
        // once, on the first load — never again after a save reloads the list.
        if (initialLogId && appliedLogId.current !== initialLogId) {
          const log = rows.find((l) => String(l.id) === String(initialLogId))
          if (log) { appliedLogId.current = initialLogId; loadForEdit(log) }
        }
      })
      .catch(() => { if (!cancelled) setLogs([]) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, saving])

  const submit = async () => {
    if (!recordId) return
    setSaving(true)
    try {
      const fert = form.fertilizer_type === 'Other' ? form.fertilizer_type_other : form.fertilizer_type
      // Every conditional field is cleared unless its own activity is
      // selected, so switching type cannot smuggle a stale value through.
      const payload = {
        activity_type: isOther ? 'Other' : activity,
        activity_type_other_specify: isOther ? form.activity_type_other_specify : '',
        date_of_activity: form.date_of_activity,
        fertilizer_type: isFert ? fert : '',
        quantity_applied: isFert && form.quantity_applied !== '' ? form.quantity_applied : null,
        quantity_unit: isFert ? form.quantity_unit : '',
        application_method: isFert ? form.application_method : '',
        pest_disease_name: isPest || isDisease ? form.pest_disease_name : '',
        severity: isPest || isDisease ? form.severity : '',
        treatment_used: isPest || isDisease ? form.treatment_used : '',
        plant_condition: form.plant_condition,
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

  const card = (
    <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-[14px]">
      {records.length === 0 ? (
        <p className="px-1 py-8 text-center text-[13px] italic text-cz-text-muted">{t.noCrops}</p>
      ) : (
        <>
          <Block label={t.cropHeading}>
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
          </Block>

          <Block label={t.activityHeading} required>
            <ComboboxWithOther
              options={activityTypeOptions}
              value={activity}
              otherValue={form.activity_type_other_specify}
              onChange={(v) => set('activity_type', v)}
              onOtherChange={(v) => set('activity_type_other_specify', v)}
              otherLabel={t.types.Other}
              placeholder={t.selectPlaceholder}
              inputClassName={FIELD}
              chevronSize={18}
            />
          </Block>

          <Block label={t.dateHeading} required>
            <div className="grid grid-cols-3 gap-2">
              {dateOptions.map((opt) => (
                <Choice
                  key={opt.key}
                  selected={dateMode === opt.key}
                  onClick={() => {
                    setDateMode(opt.key)
                    if (opt.value) set('date_of_activity', opt.value)
                  }}
                >
                  {opt.text}
                </Choice>
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
            <p className="mt-1.5 text-[12px] text-cz-text-2">{dayFirstLong(form.date_of_activity)}</p>
          </Block>

          {isFert && (
            <SoftBox>
              <Block label={t.fertilizerType}>
                <ComboboxWithOther
                  options={t.fertilizerOptions}
                  value={form.fertilizer_type}
                  otherValue={form.fertilizer_type_other}
                  onChange={(v) => set('fertilizer_type', v)}
                  onOtherChange={(v) => set('fertilizer_type_other', v)}
                  otherLabel={t.types.Other}
                  placeholder={t.selectPlaceholder}
                  inputClassName={FIELD}
                  chevronSize={18}
                />
              </Block>
              <div className="mb-[18px] grid grid-cols-[3fr_2fr] gap-2.5">
                <Block label={t.quantityKg} last>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.quantity_applied}
                    onChange={(e) => set('quantity_applied', e.target.value)}
                    placeholder={t.quantityPlaceholder}
                    className={FIELD}
                  />
                </Block>
                <Block label={t.unit} last>
                  <select
                    value={form.quantity_unit}
                    onChange={(e) => set('quantity_unit', e.target.value)}
                    className={FIELD}
                  >
                    {Object.entries(labels.activityLog.quantityUnitOptions).map(([v, text]) => (
                      <option key={v} value={v}>{text}</option>
                    ))}
                  </select>
                </Block>
              </div>
              <Block label={t.applicationMethod} last>
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
              </Block>
            </SoftBox>
          )}

          {(isPest || isDisease) && (
            <SoftBox>
              <Block label={isPest ? t.pestName : t.diseaseName}>
                <input
                  type="text"
                  value={form.pest_disease_name}
                  onChange={(e) => set('pest_disease_name', e.target.value)}
                  placeholder={isPest ? t.pestPlaceholder : t.diseasePlaceholder}
                  className={FIELD}
                />
              </Block>
              <Block label={t.damageLevel}>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(t.damageOptions).map(([v, text]) => (
                    <Choice key={v} selected={form.severity === v} onClick={() => set('severity', form.severity === v ? '' : v)}>
                      {text}
                    </Choice>
                  ))}
                </div>
              </Block>
              <Block label={isPest ? t.pestTreatment : t.diseaseTreatment} last>
                <input
                  type="text"
                  value={form.treatment_used}
                  onChange={(e) => set('treatment_used', e.target.value)}
                  placeholder={isPest ? t.pestTreatmentPlaceholder : t.diseaseTreatmentPlaceholder}
                  className={FIELD}
                />
              </Block>
            </SoftBox>
          )}

          {isWater && (
            <SoftBox>
              <Block label={t.waterQuality} last>
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
              </Block>
            </SoftBox>
          )}

          <Block label={t.plantCondition}>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(t.conditionOptions).map(([v, text]) => (
                <Choice key={v} selected={form.plant_condition === v} onClick={() => set('plant_condition', form.plant_condition === v ? '' : v)}>
                  {text}
                </Choice>
              ))}
            </div>
          </Block>

          <Block label={t.notes} optional={t.notesOptional}>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder={t.notesPlaceholder}
              className={`${FIELD} resize-y`}
            />
          </Block>

          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="w-full rounded-[10px] bg-cz-crop-header py-[15px] disabled:opacity-50"
          >
            <span className="text-[15px] font-semibold text-white">{editingId ? t.saveEdit : t.save}</span>
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="mt-2 w-full rounded-[10px] border-[0.5px] border-cz-border-strong bg-cz-surface py-[13px]"
            >
              <span className="text-[14px] font-medium text-cz-text-2">{t.cancelEdit}</span>
            </button>
          )}

          <div className="mt-5 border-t-[0.5px] border-cz-border pt-4">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
              className="flex w-full items-center gap-2.5 py-1 text-left"
            >
              <span className="flex-1 text-[15px] font-semibold text-cz-text">{t.historyHeading}</span>
              {historyOpen
                ? <ChevronUp size={16} className="shrink-0 text-cz-text" aria-hidden="true" />
                : <ChevronDown size={16} className="shrink-0 text-cz-text" aria-hidden="true" />}
            </button>

            {historyOpen && (
              <div className="mt-4 space-y-2.5">
                {logs.length === 0 && (
                  <p className="py-4 text-center text-[13px] italic text-cz-text-muted">{t.historyEmpty}</p>
                )}
                {logs.map((log) => {
                  // logged_by_name is set for a citizen's OWN logs too, so it
                  // cannot be the staff test by itself — comparing the id is
                  // what distinguishes them.
                  const byStaff = log.recorded_by !== user?.id
                  const detail = [
                    dayFirstShort(log.date_of_activity),
                    log.fertilizer_type,
                    log.quantity_applied ? `${log.quantity_applied} ${log.quantity_unit || 'kg'}` : null,
                    log.application_method,
                    log.pest_disease_name,
                    log.notes,
                  ].filter(Boolean).join(' · ')
                  return (
                    <div key={log.id} className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <p className="text-[15px] font-semibold text-cz-text">
                          {log.activity_type === 'Other'
                            ? (log.activity_type_other_specify || t.types.Other)
                            : log.activity_type}
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.03em] ${
                            byStaff
                              ? 'bg-semantic-warning-bg text-semantic-warning'
                              : 'bg-semantic-safe-bg text-semantic-safe'
                          }`}
                        >
                          {byStaff ? labels.ffNew.loggedByStaff : labels.ffNew.loggedByYou}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-[1.5] text-cz-text-2">{detail}</p>
                      <button type="button" onClick={() => loadForEdit(log)} className="mt-2.5 block text-left">
                        <span className="text-[14px] font-bold text-cz-crop-header">{t.editBtn}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )

  if (bare) return card

  // Phone: the reference goes straight from the app header to the card, with
  // no back link or title row.
  return (
    <CitizenScreen hasTabBar>
      <CitizenHomeHeader theme={CROP_THEME} />
      <CitizenBody className="!px-3 !pt-3">{card}</CitizenBody>
      {tabBar}
    </CitizenScreen>
  )
}
