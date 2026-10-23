import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Search, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PhotoListField from '../../components/UI/PhotoListField.jsx'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import usePhotoList from '../../hooks/usePhotoList.js'
import { useToast } from '../../context/ToastContext.jsx'
import { todayISO } from '../../utils/localDate.js'
import {
  allSelected, allTotal, counts, dropRecords, farmerLine, groupByParcel, isSelected, markTotal, orderedSelection, selectCrop, selectMany, updateRow,
} from './disasterEvent.js'
import { MAX_CROPS, areaProblem, buildRequest, dateProblem, isWholeArea, withArea, withTotal } from './multiCropDisaster.js'

// Log Disaster (Crop Disaster page): one disaster event over the crops of SEVERAL farmers. Fill the event once (type, date, description,
// estimated loss, photos), add the farmers that were hit, open each farmer's parcels and tick the crops that were affected: each has its
// own area affected and total-loss tick, with "all crops" / "all total loss" at the top, per farmer and per parcel. Saves one disaster
// record per crop in one go (POST /production/disasters/multi/), all or nothing.

const DISASTER_TYPES = ['Drought', 'Flood', 'Typhoon', 'Strong Winds', 'Pest Outbreak']
const CHECK = 'h-4 w-4 flex-none accent-[#1B4D2E]'
const TOTAL_CHECK = 'h-4 w-4 flex-none rounded border-rose-300 text-rose-600 accent-rose-600 focus:ring-rose-500'
const listOf = (data) => (Array.isArray(data) ? data : data?.results || [])

function FarmerSearch({ chosenIds, onAdd }) {
  const [q, setQ] = useState('')
  const query = useDebouncedValue(q.trim())
  const [found, setFound] = useState({ query: '', list: [] })
  useEffect(() => {
    if (!query) return undefined
    let alive = true
    api.get('/farmers/', { params: { search: query } })
      .then((r) => alive && setFound({ query, list: listOf(r.data).slice(0, 8) }))
      .catch(() => alive && setFound({ query, list: [] }))
    return () => { alive = false }
  }, [query])
  const results = query && found.query === query ? found.list.filter((f) => !chosenIds.includes(f.id)) : []

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-[#E2E8E2] bg-white px-3">
        <Search size={15} className="text-[#7A8E7A]" aria-hidden="true" />
        <input type="search" className="h-[38px] w-full bg-transparent text-[13px] outline-none" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search a farmer by name or RSBSA number to add…" aria-label="Search farmers" />
      </div>
      {q.trim() && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[#E2E8E2] bg-white py-1 shadow-lg" aria-label="Farmers found">
          {results.map((f) => (
            <li key={f.id}>
              <button type="button" className="w-full px-3 py-2 text-left text-[13px] hover:bg-[#F5F7F5]" onClick={() => { onAdd(f); setQ('') }}>
                <span className="font-medium text-[#1A2B1A]">{f.full_name}</span>
                <span className="ml-2 text-[#7A8E7A]">{[f.rsbsa_number, f.barangay].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-3 py-2 text-[13px] text-[#7A8E7A]">{found.query === query ? 'No farmer found.' : 'Searching…'}</li>}
        </ul>
      )}
    </div>
  )
}

function CropRow({ record, row, showErrors, onToggle, onChange }) {
  const problem = row ? areaProblem(row) : ''
  return (
    <li className={`border-b border-[#F0F4F0] px-3 py-2 last:border-b-0 ${row ? 'bg-[#F6FAF7]' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex min-h-[40px] min-w-0 flex-1 basis-64 cursor-pointer items-start gap-2.5 text-[13px] text-[#1A2B1A]">
          <input type="checkbox" className={`${CHECK} mt-0.5`} checked={Boolean(row)} onChange={(e) => onToggle(record, e.target.checked)} />
          <span className="min-w-0 break-words">
            {record.label}
            <span className="ml-2 text-[11.5px] text-[#7A8E7A]">{record.area_planted_ha ? `${Number(record.area_planted_ha)} ha planted` : 'area not recorded'}</span>
          </span>
        </label>
        {row && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-[11.5px] font-medium text-[#4A5E4A]" htmlFor={`area-${record.id}`}>Area affected (ha) *</label>
              <DecimalInput id={`area-${record.id}`} decimals={4} max={row.plantedHa ?? undefined}
                className={`${baseInputClasses} w-28 ${showErrors && problem ? 'border-rose-400' : ''}`} value={row.area}
                onChange={(v) => onChange(record.id, (r) => withArea(r, v))} />
            </div>
            <label className={`flex min-h-[36px] items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[12px] font-medium text-rose-800 ${isWholeArea(row) || row.total ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
              title={isWholeArea(row) ? undefined : 'Only when the whole area is affected'}>
              <input type="checkbox" className={TOTAL_CHECK} checked={row.total} disabled={!isWholeArea(row)}
                onChange={(e) => onChange(record.id, (r) => withTotal(r, e.target.checked))} />
              Total loss
            </label>
          </>
        )}
      </div>
      {showErrors && problem && <p className="mt-1 pl-7 text-xs text-rose-600">{problem}</p>}
    </li>
  )
}

function ParcelGroup({ group, selection, showErrors, onToggleCrop, onSelectAll, onTotalAll, onChange }) {
  const [open, setOpen] = useState(false)
  const picked = group.records.filter((r) => isSelected(selection, r)).length
  return (
    <li className="rounded-lg border border-[#E2E8E2] bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex min-h-[40px] min-w-0 flex-1 basis-56 items-center gap-2 text-left">
          <ChevronDown size={15} className={`flex-none text-[#4A5E4A] transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block break-words text-[13px] font-semibold text-[#1A2B1A]">{group.label}</span>
            <span className="block text-[11.5px] text-[#7A8E7A]">
              {group.records.length} crop{group.records.length === 1 ? '' : 's'} growing · {picked} affected
            </span>
          </span>
        </button>
        <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-[12px] font-medium text-[#1A2B1A]">
          <input type="checkbox" className={CHECK} checked={allSelected(selection, group.records)} onChange={(e) => onSelectAll(group.records, e.target.checked)} />
          Select all crops
        </label>
        <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-[12px] font-medium text-rose-800">
          <input type="checkbox" className={TOTAL_CHECK} checked={allTotal(selection, group.records)} onChange={(e) => onTotalAll(group.records, e.target.checked)} />
          Select all total loss
        </label>
      </div>
      {open && (
        <ul className="border-t border-[#F0F4F0]" aria-label={`Crops on ${group.label}`}>
          {group.records.map((record) => (
            <CropRow key={record.id} record={record} row={selection[record.id]} showErrors={showErrors} onToggle={onToggleCrop} onChange={onChange} />
          ))}
        </ul>
      )}
    </li>
  )
}

function FarmerCard({ farmer, groups, selection, showErrors, onRemove, onToggleCrop, onSelectAll, onTotalAll, onChange }) {
  const records = groups ? groups.flatMap((g) => g.records) : []
  const picked = records.filter((r) => isSelected(selection, r)).length
  return (
    <section className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="break-words text-[14px] font-semibold text-[#1A2B1A]">{farmer.full_name}</p>
          <p className="text-[12px] text-[#7A8E7A]">{[farmer.rsbsa_number, farmer.barangay].filter(Boolean).join(' · ')}</p>
        </div>
        {records.length > 0 && (
          <>
            <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-[12px] font-medium text-[#1A2B1A]">
              <input type="checkbox" className={CHECK} checked={allSelected(selection, records)} onChange={(e) => onSelectAll(records, e.target.checked)} />
              All of this farmer&apos;s crops ({picked}/{records.length})
            </label>
            <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-[12px] font-medium text-rose-800">
              <input type="checkbox" className={TOTAL_CHECK} checked={allTotal(selection, records)} onChange={(e) => onTotalAll(records, e.target.checked)} />
              All total loss
            </label>
          </>
        )}
        <button type="button" onClick={() => onRemove(farmer, records)} aria-label={`Remove ${farmer.full_name}`}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-md text-[#7A8E7A] hover:bg-rose-50 hover:text-rose-600">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2">
        {groups === null ? <p className="text-[13px] text-[#7A8E7A]">Loading crops…</p>
          : groups === false ? <p className="text-[13px] text-rose-600">Could not load this farmer&apos;s crops. Remove the farmer and add them again.</p>
          : groups.length === 0 ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">This farmer has no crops growing now, so there is nothing to log a disaster on.</p>
          : (
            <ul className="space-y-2" aria-label={`Parcels of ${farmer.full_name}`}>
              {groups.map((group) => (
                <ParcelGroup key={group.key} group={group} selection={selection} showErrors={showErrors}
                  onToggleCrop={onToggleCrop} onSelectAll={onSelectAll} onTotalAll={onTotalAll} onChange={onChange} />
              ))}
            </ul>
          )}
      </div>
    </section>
  )
}

export default function LogCropDisasterModal({ onClose, onSuccess }) {
  const { showToast } = useToast()
  const today = todayISO()
  const [disasterType, setDisasterType] = useState('')
  const [other, setOther] = useState('')
  const [date, setDate] = useState(today)
  const [damage, setDamage] = useState('')
  const [loss, setLoss] = useState('')
  const photosState = usePhotoList()
  const [farmers, setFarmers] = useState([])               // [{ id, full_name, rsbsa_number, barangay }]
  const [cropsByFarmer, setCropsByFarmer] = useState({})   // { [farmerId]: groups | null (loading) | false (failed) }
  const [selection, setSelection] = useState({})
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const addFarmer = (farmer) => {
    setFarmers((list) => (list.some((f) => f.id === farmer.id) ? list : [...list, farmer]))
    setCropsByFarmer((map) => ({ ...map, [farmer.id]: null }))
    api.get('/production/monitoring/', { params: { farmer: farmer.id } })
      .then((r) => setCropsByFarmer((map) => ({ ...map, [farmer.id]: groupByParcel(listOf(r.data)) })))
      .catch(() => setCropsByFarmer((map) => ({ ...map, [farmer.id]: false })))
  }
  const removeFarmer = (farmer, records) => {
    setFarmers((list) => list.filter((f) => f.id !== farmer.id))
    setCropsByFarmer((map) => Object.fromEntries(Object.entries(map).filter(([id]) => Number(id) !== farmer.id)))
    setSelection((s) => dropRecords(s, records))
  }

  const allGroups = farmers.map((f) => cropsByFarmer[f.id] || [])
  const everyRecord = allGroups.flatMap((groups) => groups.flatMap((g) => g.records))
  const { rows, records } = useMemo(() => orderedSelection(selection, allGroups), [selection, cropsByFarmer, farmers]) // eslint-disable-line react-hooks/exhaustive-deps
  const { crops: cropCount, total: totalCount } = counts(selection)
  const farmerCount = new Set(records.map((r) => r.farmer)).size

  const typeError = !disasterType ? 'Please select a disaster type.' : (disasterType === 'Other' && !other.trim() ? 'Please specify the disaster type.' : '')
  const dateError = dateProblem(date, rows, records, today)
  const tooMany = cropCount > MAX_CROPS
  const rowErrors = rows.some((r) => areaProblem(r))

  const toggleCrop = (record, on) => setSelection((s) => selectCrop(s, record, on))
  const selectAll = (recs, on) => setSelection((s) => selectMany(s, recs, on))
  const totalAll = (recs, on) => setSelection((s) => markTotal(s, recs, on))
  const changeRow = (id, change) => setSelection((s) => updateRow(s, id, change))

  const handleSubmitClick = () => {
    setShowErrors(true)
    if (!farmers.length) { showToast('Add at least one farmer.', 'error'); return }
    if (!cropCount) { showToast('Tick at least one affected crop.', 'error'); return }
    if (tooMany) { showToast(`Choose at most ${MAX_CROPS} crops at a time.`, 'error'); return }
    if (typeError) { showToast(typeError, 'error'); return }
    if (dateError || rowErrors) return
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
      showToast(`Disaster recorded on ${cropCount} crop${cropCount === 1 ? '' : 's'} of ${farmerCount} farmer${farmerCount === 1 ? '' : 's'}.`, 'success')
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
        title="Log Disaster"
        subtitle="One disaster event: choose the farmers, their parcels and the crops that were affected"
        icon={AlertTriangle}
        iconBg="bg-rose-100"
        iconColor="text-rose-600"
        onClose={onClose}
        maxWidth="max-w-5xl"
        footer={(
          <>
            <p className={`mr-auto self-center text-[12.5px] ${tooMany ? 'font-medium text-rose-600' : 'text-[#4A5E4A]'}`} role="status">
              {tooMany ? `Choose at most ${MAX_CROPS} crops at a time.` : `${farmerLine(cropCount, farmerCount)}${totalCount ? ` · ${totalCount} total loss` : ''}`}
            </p>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <button type="button" onClick={handleSubmitClick} disabled={isSubmitting}
              className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-60">
              {isSubmitting ? 'Saving…' : `Report Disaster${cropCount > 1 ? ` (${cropCount} crops)` : ''}`}
            </button>
          </>
        )}
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Type of disaster *</label>
              <ComboboxWithOther options={DISASTER_TYPES} value={disasterType} otherValue={other}
                onChange={setDisasterType} onOtherChange={setOther} placeholder="Select type" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Date of occurrence *</label>
              <input type="date" className={`${baseInputClasses} ${showErrors && dateError ? 'border-rose-400' : ''}`} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              {showErrors && dateError && <p className="mt-1 text-xs text-rose-600">{dateError}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Damage description (optional)</label>
              <textarea rows={3} className={`${baseInputClasses} h-auto resize-none py-2`} value={damage} onChange={(e) => setDamage(e.target.value)}
                placeholder="Describe the damage observed (crops, infrastructure, etc.)" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Estimated production loss (optional)</label>
              <textarea rows={3} className={`${baseInputClasses} h-auto resize-none py-2`} value={loss} onChange={(e) => setLoss(e.target.value)}
                placeholder="Describe or estimate production loss" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Affected farmers, parcels and crops</h3>
              {everyRecord.length > 0 && (
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-[12.5px] font-medium text-[#1A2B1A]">
                    <input type="checkbox" className={CHECK} checked={allSelected(selection, everyRecord)} onChange={(e) => selectAll(everyRecord, e.target.checked)} />
                    Select all crops ({everyRecord.length})
                  </label>
                  <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-[12.5px] font-medium text-rose-800">
                    <input type="checkbox" className={TOTAL_CHECK} checked={allTotal(selection, everyRecord)} onChange={(e) => totalAll(everyRecord, e.target.checked)} />
                    Select all total loss
                  </label>
                </div>
              )}
            </div>

            <FarmerSearch chosenIds={farmers.map((f) => f.id)} onAdd={addFarmer} />

            {farmers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#C8D5C8] px-4 py-6 text-center text-[13px] text-[#7A8E7A]">
                Search and add every farmer affected by this disaster. Each one&apos;s parcels and growing crops appear here.
              </p>
            ) : (
              <div className="space-y-3">
                {farmers.map((farmer) => (
                  <FarmerCard key={farmer.id} farmer={farmer} groups={cropsByFarmer[farmer.id]} selection={selection} showErrors={showErrors}
                    onRemove={removeFarmer} onToggleCrop={toggleCrop} onSelectAll={selectAll} onTotalAll={totalAll} onChange={changeRow} />
                ))}
              </div>
            )}
          </div>

          {totalCount > 0 && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {totalCount === 1 ? '1 crop is' : `${totalCount} crops are`} marked as a total loss: that ends {totalCount === 1 ? 'its' : 'their'} production cycle and no harvest can be recorded.
            </p>
          )}

          <PhotoListField photosState={photosState} title="Photos (optional)"
            hint="Up to 10 photos showing the damage. Each crop's report keeps a copy." altPrefix="Damage photo" />
        </div>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog variant="primary"
          title="Confirm Disaster Report"
          message={`Log this disaster event on ${cropCount} crop${cropCount === 1 ? '' : 's'} of ${farmerCount} farmer${farmerCount === 1 ? '' : 's'}? A separate report is recorded for each crop.`}
          confirmLabel="Yes, Report"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
