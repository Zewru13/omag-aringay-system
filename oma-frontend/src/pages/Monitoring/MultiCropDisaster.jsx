import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PhotoListField from '../../components/UI/PhotoListField.jsx'
import usePhotoList from '../../hooks/usePhotoList.js'
import { useToast } from '../../context/ToastContext.jsx'
import { todayISO } from '../../utils/localDate.js'
import {
  MAX_CROPS, allTotal, areaProblem, buildRequest, dateProblem, filterCrops, isWholeArea, selectionSummary, toRows, withAllTotal, withArea, withTotal,
} from './multiCropDisaster.js'

// Log Disaster on a farmer's crops: tick the crops that were hit (step 2), then fill ONE form for the whole event (step 3):
// the type, date, description and photos are shared; each crop has its own area affected and Total Loss tick.
// Saves one disaster record per crop in one go (POST /production/disasters/multi/), all or nothing.

const DISASTER_TYPES = ['Drought', 'Flood', 'Typhoon', 'Strong Winds', 'Pest Outbreak']

// Step 2. crops = the farmer's crops (null while loading); each has an id, a `label` and crop_type_name.
export function ChooseCropsModal({ title = 'Log Disaster', subtitle, crops, blockedMessage = '', onBack, onClose, onContinue, inline = false }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const shown = useMemo(() => (crops ? filterCrops(crops, query) : []), [crops, query])
  const allShownSelected = shown.length > 0 && shown.every((c) => selected.has(c.id))
  const tooMany = selected.size > MAX_CROPS

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAllShown = () => setSelected((prev) => {
    const next = new Set(prev)
    if (allShownSelected) shown.forEach((c) => next.delete(c.id)); else shown.forEach((c) => next.add(c.id))
    return next
  })
  const chosen = (crops || []).filter((c) => selected.has(c.id))

  return (
    <ModalShell title={title} subtitle={subtitle} icon={AlertTriangle} onClose={onClose} maxWidth={inline ? 'max-w-2xl' : 'max-w-md'} inline={inline}
      footer={(
        <>
          {!(inline && !onBack) && <Button type="button" variant="outline" onClick={onBack || onClose}>{onBack ? 'Back' : 'Cancel'}</Button>}
          <Button type="button" disabled={!chosen.length || tooMany} onClick={() => onContinue(chosen)}>Continue</Button>
        </>
      )}>
      {crops === null ? <p className="text-sm text-slate-500">Loading…</p> : blockedMessage ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700" data-testid="disaster-blocked">{blockedMessage}</p>
      ) : crops.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">This farmer has no crops to log a disaster on.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Tick every crop that was affected. You fill in the disaster once for all of them.</p>
          {crops.length > 6 && (
            <input type="search" className={baseInputClasses} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by crop, season or place" aria-label="Search crops" />
          )}
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={allShownSelected} onChange={toggleAllShown} />
            Select all{query.trim() ? ' shown' : ''} ({shown.length})
          </label>
          <ul className="max-h-64 overflow-y-auto rounded-xl border border-slate-200" aria-label="Crops">
            {shown.map((c) => (
              <li key={c.id} className="border-b border-slate-100 last:border-b-0">
                <label className={`flex min-h-[44px] cursor-pointer items-start gap-2.5 px-3 py-2 text-sm ${selected.has(c.id) ? 'bg-[#f0f7f0]' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none accent-[#1B4D2E]" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="min-w-0 break-words">{c.label}</span>
                </label>
              </li>
            ))}
            {!shown.length && <li className="px-3 py-3 text-sm text-slate-400">No crops match.</li>}
          </ul>
          <p className={`text-xs ${tooMany ? 'font-medium text-rose-600' : 'text-slate-500'}`}>
            {tooMany ? `Choose at most ${MAX_CROPS} crops at a time.` : selectionSummary(chosen)}
          </p>
        </div>
      )}
    </ModalShell>
  )
}

// Step 3. crops = the chosen crop records (id, label, crop_type_name, area_planted_ha, date_planted).
export function MultiCropDisasterModal({ crops, onBack, onClose, onSuccess, inline = false }) {
  const { showToast } = useToast()
  const [disasterType, setDisasterType] = useState('')
  const [other, setOther] = useState('')
  const [date, setDate] = useState(todayISO())
  const [damage, setDamage] = useState('')
  const [loss, setLoss] = useState('')
  const [rows, setRows] = useState(() => toRows(crops))
  const photosState = usePhotoList()
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const today = todayISO()
  const dateError = dateProblem(date, rows, crops, today)
  const rowErrors = rows.map(areaProblem)
  const typeError = !disasterType ? 'Please select a disaster type.' : (disasterType === 'Other' && !other.trim() ? 'Please specify the disaster type.' : '')
  const totalLossCount = rows.filter((r) => r.total).length

  const updateRow = (id, fn) => setRows((prev) => prev.map((r) => (r.id === id ? fn(r) : r)))

  const handleSubmitClick = () => {
    setShowErrors(true)
    if (typeError) { showToast(typeError, 'error'); return }
    if (dateError) return
    if (rowErrors.some(Boolean)) return
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      const { fields, crops: items } = buildRequest({ disasterType, other, date, damage, loss }, rows)
      let payload
      if (photosState.photos.length) {
        payload = new FormData()
        Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined) payload.append(k, v) })
        payload.append('crops', JSON.stringify(items))
        photosState.photos.forEach((p) => payload.append('photos', p.file))
      } else {
        payload = { ...fields, crops: items }
      }
      await api.post('/production/disasters/multi/', payload)
      showToast(`Disaster recorded on ${rows.length} crop${rows.length === 1 ? '' : 's'}.`, 'success')
      onSuccess?.()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      showToast(data?.photos?.[0] || data?.detail || data?.crops?.[0] || 'Failed to save the disaster report.', 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <>
      <ModalShell
        title="Report Disaster / Damage"
        subtitle={`${selectionSummary(rows)} — one report for each`}
        icon={AlertTriangle}
        iconBg="bg-rose-100"
        iconColor="text-rose-600"
        onClose={onClose}
        maxWidth={inline ? 'max-w-2xl' : 'max-w-lg'}
        inline={inline}
        footer={(
          <>
            <button type="button" onClick={onBack || onClose}
              className="rounded-xl px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100">
              {onBack ? 'Back' : 'Cancel'}
            </button>
            <button type="button" onClick={handleSubmitClick} disabled={isSubmitting}
              className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-60">
              {isSubmitting ? 'Saving…' : `Report Disaster${rows.length > 1 ? ` (${rows.length} crops)` : ''}`}
            </button>
          </>
        )}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Disaster Type *</label>
            <ComboboxWithOther options={DISASTER_TYPES} value={disasterType} otherValue={other}
              onChange={setDisasterType} onOtherChange={setOther} placeholder="Select type" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Date of Occurrence *</label>
            <input type="date" className={`${baseInputClasses} ${showErrors && dateError ? 'border-rose-400' : ''}`}
              value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            {showErrors && dateError && <p className="mt-1 text-xs text-rose-600">{dateError}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Damage Description (optional)</label>
            <textarea rows={3} className={`${baseInputClasses} resize-none`} value={damage} onChange={(e) => setDamage(e.target.value)}
              placeholder="Describe the damage observed (crops, infrastructure, etc.)" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Estimated Production Loss (optional)</label>
            <textarea rows={2} className={`${baseInputClasses} resize-none`} value={loss} onChange={(e) => setLoss(e.target.value)}
              placeholder="Describe or estimate production loss" />
          </div>

          <fieldset className="space-y-2" data-testid="crop-rows">
            <legend className="mb-1 text-xs font-medium text-slate-700">Affected crops: area affected for each</legend>
            {rows.length > 1 && (
              <label className="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs">
                <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                  checked={allTotal(rows)} onChange={(e) => setRows((prev) => withAllTotal(prev, e.target.checked))} />
                <span>
                  <span className="font-medium text-rose-800">Mark all {rows.length} crops as total loss</span>
                  <span className="block text-rose-500">Every crop is completely destroyed: the area affected is set to the whole planted area.</span>
                </span>
              </label>
            )}
            {rows.map((row, i) => (
              <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 break-words text-sm font-medium text-slate-800">{row.label}</p>
                <div className="grid gap-2 sm:grid-cols-2 sm:items-start">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Area affected (ha) *</label>
                    <DecimalInput decimals={4} max={row.plantedHa ?? undefined}
                      className={`${baseInputClasses} ${showErrors && rowErrors[i] ? 'border-rose-400' : ''}`}
                      value={row.area} onChange={(v) => updateRow(row.id, (r) => withArea(r, v))}
                      placeholder={row.plantedHa ? `0.01 – ${row.plantedHa}` : 'e.g. 2.50'} />
                    {showErrors && rowErrors[i]
                      ? <p className="mt-1 text-xs text-rose-600">{rowErrors[i]}</p>
                      : row.plantedHa !== null && <p className="mt-1 text-[11px] text-slate-400">Planted: {row.plantedHa} ha</p>}
                  </div>
                  <label className={`flex min-h-[44px] items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs ${row.total || isWholeArea(row) ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                      checked={row.total} disabled={!isWholeArea(row)}
                      onChange={(e) => updateRow(row.id, (r) => withTotal(r, e.target.checked))} />
                    <span>
                      <span className="font-medium text-rose-800">Total loss</span>
                      <span className="block text-rose-500">{isWholeArea(row) ? 'Crop completely destroyed.' : 'Only when the whole area is affected.'}</span>
                    </span>
                  </label>
                </div>
              </div>
            ))}
          </fieldset>
          {totalLossCount > 0 && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {totalLossCount === 1 ? '1 crop is' : `${totalLossCount} crops are`} marked as a total loss: that ends {totalLossCount === 1 ? 'its' : 'their'} production cycle and no harvest can be recorded.
            </p>
          )}

          <PhotoListField photosState={photosState} title="Photos (optional)"
            hint="Up to 10 photos showing the damage. Each crop's report keeps a copy." altPrefix="Damage photo" />
        </div>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog variant="primary"
          title="Confirm Disaster Report"
          message={`Log this disaster event on ${rows.length} crop${rows.length === 1 ? '' : 's'}? A separate report is recorded for each crop.`}
          confirmLabel="Yes, Report"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
