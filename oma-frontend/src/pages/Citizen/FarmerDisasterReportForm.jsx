import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { FarmerDesktopBody, FarmerRailCard } from './FarmerChrome.jsx'
import { CROP_THEME, CitizenBody, CitizenHomeHeader, CitizenScreen } from './citizenUI.jsx'
import { dayFirstLong } from './farmerDates.js'
import { Block, Choice, FIELD } from './farmerFormParts.jsx'
import { labels } from './labels.js'
import { todayISO, yesterdayISO } from '../../utils/localDate.js'

// Farmer Sakuna report form, rebuilt to UPDATED FARMER CITIZEN UI.docx.
// Rendered by CitizenDisasterScreen when it is given variant="farmer"; that
// screen still owns the record lock and the switch to the reported-disasters
// list, so this file is only the form itself.
//
// Same endpoint and fields as before, with one addition on the wire: the
// damage level (Antas ng pinsala) is now required and actually sent as
// `severity`. The reference draws it as required and the disaster cards show
// it, but the previous form never included it in the payload.

const DAMAGE_TONE = { Low: 'low', Medium: 'medium', High: 'high' }

// The label copy is stored upper-case (it was drawn that way before); the
// reference writes these two headings in sentence case.
const sentenceCase = (text) => text.charAt(0) + text.slice(1).toLowerCase()

export default function FarmerDisasterReportForm({
  domain, recordId, record, recordLock, onCancel, onReported, onViewReported, tabBar, bare = false,
}) {
  const { showToast } = useToast()
  const D = labels.ffNew.desktop
  const S = labels.ffNew.sakuna
  const isCrop = domain.key === 'crop'

  const [form, setForm] = useState(() => ({
    disaster_type: domain.disasterTypeChoices[0],
    disaster_type_other_specify: '',
    date_of_occurrence: todayISO(),
    area_affected_ha: '',
    estimated_damage: '',
    production_loss: '',
    severity: '',
    is_total_loss: false,
  }))
  const [dateMode, setDateMode] = useState('today')
  const [areaError, setAreaError] = useState('')
  const [severityError, setSeverityError] = useState('')
  const [photo, setPhoto] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const recordArea = isCrop
    ? (record?.area_planted_ha ? Number(record.area_planted_ha) : null)
    : (record?.area_hectares ? Number(record.area_hectares) : null)
  const blockedByOther = Boolean(recordLock?.lockedByOther)

  const validateArea = (value) => {
    if (!value || value === '') return labels.disaster.errors.areaAffectedRequired
    const n = parseFloat(value)
    if (Number.isNaN(n) || n <= 0) return labels.disaster.errors.areaAffectedInvalid
    if (recordArea != null && n > recordArea) return labels.disaster.errors.areaAffectedExceeds(recordArea)
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.date_of_occurrence) { showToast(labels.disaster.errors.dateRequired, 'error'); return }
    if (form.disaster_type === 'Other' && !form.disaster_type_other_specify.trim()) {
      showToast(labels.disaster.errors.specifyType, 'error')
      return
    }
    const areaErr = validateArea(form.area_affected_ha)
    if (areaErr) { setAreaError(areaErr); showToast(areaErr, 'error'); return }
    if (!form.severity) {
      const msg = labels.disaster.errors.severityRequired
      setSeverityError(msg)
      showToast(msg, 'error')
      return
    }
    if (blockedByOther) { showToast(labels.disaster.errors.lockedByOther, 'error'); return }

    setIsSubmitting(true)
    try {
      const fields = {
        disaster_type: form.disaster_type,
        disaster_type_other_specify: form.disaster_type === 'Other' ? form.disaster_type_other_specify : '',
        date_of_occurrence: form.date_of_occurrence,
        area_affected_ha: form.area_affected_ha,
        estimated_damage: form.estimated_damage,
        production_loss: form.production_loss,
        severity: form.severity,
        is_total_loss: form.is_total_loss,
      }
      let payload = fields
      if (photo) {
        payload = new FormData()
        Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined) payload.append(k, v) })
        payload.append('photo', photo)
      }
      await api.post(domain.disastersUrl(recordId), payload)
      showToast(labels.disaster.submitSuccess, 'success')
      onReported()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
      showToast(firstError || data?.detail || labels.disaster.errors.genericSaveError, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const dateOptions = [
    { key: 'today', text: labels.activityLog.dateShortcuts.today, value: todayISO() },
    { key: 'yesterday', text: labels.activityLog.dateShortcuts.yesterday, value: yesterdayISO() },
    { key: 'custom', text: labels.activityLog.dateShortcuts.pickDate, value: null },
  ]

  const card = (
    <form onSubmit={handleSubmit} className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-[14px]">
      {blockedByOther && (
        <div className="mb-[18px] rounded-[12px] border-[0.5px] border-cz-warn-border bg-cz-warn-bg p-[14px]">
          <p className="text-[13px] text-cz-warn-body">
            🔒 <strong className="font-medium">{recordLock.lockedByOther.name}</strong> {labels.common.lockedByOtherSuffix}
            {recordLock.secondsRemaining ? labels.common.lockedByOtherMinutes(Math.ceil(recordLock.secondsRemaining / 60)) : ''}.
          </p>
        </div>
      )}

      <div className="mb-[18px] flex gap-2.5 rounded-[10px] border-[0.5px] border-cz-alert-border bg-cz-alert-bg px-3.5 py-3">
        <AlertTriangle size={17} className="mt-px shrink-0 text-cz-alert-title" aria-hidden="true" />
        <p className="text-[13px] leading-[1.5] text-cz-alert-title">{isCrop ? S.introCrop : S.introFisheries}</p>
      </div>

      <Block label={sentenceCase(labels.ffNew.disasterTypeHeading)} required>
        <ComboboxWithOther
          options={domain.disasterTypeChoices
            .filter((choice) => choice !== 'Other')
            .map((choice) => ({ value: choice, label: labels.ffNew.disasterTypes[choice] || choice }))}
          value={form.disaster_type}
          otherValue={form.disaster_type_other_specify}
          onChange={(v) => set('disaster_type', v)}
          onOtherChange={(v) => set('disaster_type_other_specify', v)}
          otherLabel={labels.ffNew.disasterTypes.Other || 'Other'}
          disabled={blockedByOther}
          inputClassName={FIELD}
          chevronSize={18}
        />
      </Block>

      <Block label={labels.disaster.fields.dateOfOccurrence} required>
        <div className="grid grid-cols-3 gap-2">
          {dateOptions.map((opt) => (
            <Choice
              key={opt.key}
              selected={dateMode === opt.key}
              disabled={blockedByOther}
              onClick={() => {
                setDateMode(opt.key)
                if (opt.value) set('date_of_occurrence', opt.value)
              }}
            >
              {opt.text}
            </Choice>
          ))}
        </div>
        {dateMode === 'custom' && (
          <input
            type="date"
            max={todayISO()}
            className={`${FIELD} mt-2`}
            value={form.date_of_occurrence}
            onChange={(e) => set('date_of_occurrence', e.target.value)}
            disabled={blockedByOther}
          />
        )}
        <p className="mt-1.5 text-[12px] text-cz-text-2">{dayFirstLong(form.date_of_occurrence)}</p>
      </Block>

      <Block label={labels.disaster.fields.areaAffected} required error={areaError}>
        <input
          type="number"
          step="0.0001"
          inputMode="decimal"
          className={FIELD}
          value={form.area_affected_ha}
          onChange={(e) => { set('area_affected_ha', e.target.value); setAreaError('') }}
          disabled={blockedByOther}
        />
      </Block>

      <Block label={labels.disaster.fields.estimatedDamage}>
        <textarea
          rows={3}
          className={`${FIELD} resize-y`}
          value={form.estimated_damage}
          onChange={(e) => set('estimated_damage', e.target.value)}
          disabled={blockedByOther}
        />
      </Block>

      <Block label={labels.disaster.fields.productionLoss}>
        <textarea
          rows={3}
          className={`${FIELD} resize-y`}
          value={form.production_loss}
          onChange={(e) => set('production_loss', e.target.value)}
          disabled={blockedByOther}
        />
      </Block>

      <Block label={sentenceCase(S.damageLevel)} required error={severityError}>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(S.damageOptions).map(([value, text]) => (
            <Choice
              key={value}
              tone={DAMAGE_TONE[value]}
              selected={form.severity === value}
              disabled={blockedByOther}
              onClick={() => { set('severity', form.severity === value ? '' : value); setSeverityError('') }}
            >
              {text}
            </Choice>
          ))}
        </div>
      </Block>

      <div className="mb-[18px]">
        <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border-[0.5px] border-cz-border bg-cz-surface px-3.5 py-3">
          <input
            type="checkbox"
            checked={form.is_total_loss}
            onChange={(e) => set('is_total_loss', e.target.checked)}
            disabled={blockedByOther}
            className="mt-1 h-4 w-4 shrink-0 accent-cz-crop-header"
          />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-cz-text">{labels.farmerDisaster.totalLoss}</span>
            {form.is_total_loss && (
              <span className="mt-1.5 block text-[12.5px] leading-[1.5] text-cz-danger-accent">
                {labels.disaster.fields.isTotalLossHint}
              </span>
            )}
          </span>
        </label>
      </div>

      <Block label={labels.disaster.fields.photo}>
        <div className="rounded-[10px] border border-dashed border-cz-border-strong px-3.5 py-3">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            disabled={blockedByOther}
            className="w-full text-[14px] text-cz-text"
          />
        </div>
        <p className="mt-2 text-[11px] text-cz-text-muted">{labels.disaster.fields.photoHint}</p>
      </Block>

      <button
        type="submit"
        disabled={blockedByOther || isSubmitting}
        className="w-full rounded-[10px] bg-cz-crop-header py-[15px] disabled:opacity-50"
      >
        <span className="text-[15px] font-semibold text-white">{labels.disaster.submit}</span>
      </button>
      <button type="button" onClick={onCancel} className="mt-1 w-full py-[14px] text-center">
        <span className="text-[14px] text-cz-text-2">{labels.common.cancel}</span>
      </button>
      <button type="button" onClick={onViewReported} className="w-full py-2 text-center">
        <span className="text-[13px] text-cz-crop-header underline underline-offset-4">{S.viewHistory}</span>
      </button>
    </form>
  )

  if (bare) {
    return (
      <FarmerDesktopBody
        rail={
          <>
            <FarmerRailCard title={D.selectedCrop}>
              {record ? (
                <>
                  <p className="text-[15px] font-semibold text-cz-text">
                    {record.crop_type_name || labels.yieldAnalysis.cropCropLabel}
                  </p>
                  <p className="mt-1.5 text-[12px] text-cz-text-2">
                    {record.area_planted_ha ?? labels.common.unknown} ha · Brgy. {record.farm_location_barangay || labels.common.unknown}
                  </p>
                </>
              ) : (
                <p className="text-[12px] text-cz-text-2">{D.selectedCropHint}</p>
              )}
            </FarmerRailCard>
            <FarmerRailCard title={D.cropInsuranceHeading}>
              <p className="text-[12px] leading-[1.55] text-cz-text-2">{D.cropInsuranceBody}</p>
            </FarmerRailCard>
          </>
        }
      >
        {card}
      </FarmerDesktopBody>
    )
  }

  return (
    <CitizenScreen hasTabBar>
      <CitizenHomeHeader theme={CROP_THEME} />
      <CitizenBody className="!px-3 !pt-3">{card}</CitizenBody>
      {tabBar}
    </CitizenScreen>
  )
}
