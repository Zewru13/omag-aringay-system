import { Fragment, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ChevronDown, Search } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import PhotoListField from '../../components/UI/PhotoListField.jsx'
import ViewToggle from '../../components/UI/ViewToggle.jsx'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import usePhotoList from '../../hooks/usePhotoList.js'
import { useToast } from '../../context/ToastContext.jsx'
import { todayISO } from '../../utils/localDate.js'
import { allSelected, counts, markTotal, selectMany, updateRow } from './disasterEvent.js'
import {
  PAGE_SIZE, VIEW_MODES, allCrops, barangayOptions, farmerOptions, filterParcels, orderedRows, pageItems, parcelState, prepareParcels, selectedStats,
  sortParcels, summaryLine,
} from './disasterTargets.js'
import { MAX_CROPS, areaProblem, buildRequest, dateProblem, isWholeArea, withArea, withTotal } from './multiCropDisaster.js'

// Log Disaster (Crop Disaster page, staff): a full-page form for ONE disaster event over many parcels. It takes the place of the disaster
// list inside the page, so the sidebar and the top bar stay in view. Fill the event once (type, date,
// description, estimated loss, photos), then tick the parcels it hit in the table of every parcel that has crops in the field - search,
// filter by farmer or barangay, or view it as a list, per farmer or per barangay. Ticking a parcel ticks all its crops; its "Total loss"
// box marks them all as lost; open a parcel to tick single crops, type each one's area affected and mark one as a total loss. Saves one
// disaster record per crop in one go (POST /production/disasters/multi/), all or nothing.

const DISASTER_TYPES = ['Drought', 'Flood', 'Typhoon', 'Strong Winds', 'Pest Outbreak']
const CHECK = 'h-4 w-4 flex-none accent-[#1B4D2E]'
const TOTAL_CHECK = 'h-4 w-4 flex-none rounded border-rose-300 text-rose-600 accent-rose-600 focus:ring-rose-500'
const SELECT = 'h-[38px] rounded-lg border border-[#E2E8E2] bg-white px-3 text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none'
const TH = 'whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em]'
const COLUMNS = 7

function CropLine({ record, row, showErrors, onToggle, onChange }) {
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

function ParcelRows({ parcel, selection, open, showErrors, onToggleOpen, onSelect, onTotal, onToggleCrop, onChange }) {
  const state = parcelState(selection, parcel)
  return (
    <>
      <tr className={`border-b border-[#F0F4F0] transition-colors hover:bg-[#F9FAF9] ${state.picked ? 'bg-[#F6FAF7]' : ''}`}>
        <td className="w-10 px-3 py-2.5">
          <input type="checkbox" className={CHECK} checked={state.all} aria-label={`Select ${parcel.title} of ${parcel.farmer_name}`}
            ref={(el) => { if (el) el.indeterminate = state.picked > 0 && !state.all }}
            onChange={(e) => onSelect(parcel.crops, e.target.checked)} />
        </td>
        <td className="px-3 py-2.5">
          <button type="button" onClick={onToggleOpen} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} the crops on ${parcel.title}`}
            className="flex min-h-[36px] items-center gap-2 text-left text-[13px] font-medium text-[#1A2B1A]">
            <ChevronDown size={15} className={`flex-none text-[#4A5E4A] transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
            {parcel.title}
          </button>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#1A2B1A]">
          <p className="font-medium">{parcel.farmer_name}</p>
          <p className="text-[11.5px] text-[#7A8E7A]">{parcel.rsbsa_number}</p>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{parcel.barangay || '—'}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{parcel.area_hectares ? Number(parcel.area_hectares).toFixed(2) : '—'}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">
          {parcel.crops.length} growing{state.picked > 0 && <span className="text-[#1B4D2E]"> · {state.picked} affected</span>}
        </td>
        <td className="px-3 py-2.5">
          <label className={`inline-flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-[12px] font-medium ${state.total ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-[#E2E8E2] text-[#4A5E4A]'}`}
            title="Every crop on this parcel is lost">
            <input type="checkbox" className={TOTAL_CHECK} checked={state.total} aria-label={`${parcel.title} of ${parcel.farmer_name} is a total loss`}
              onChange={(e) => onTotal(parcel.crops, e.target.checked)} />
            Total loss
          </label>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-[#F0F4F0] bg-[#F9FAF9]">
          <td colSpan={COLUMNS} className="px-3 py-2 sm:pl-12">
            <ul className="overflow-hidden rounded-lg border border-[#E2E8E2] bg-white" aria-label={`Crops on ${parcel.title}`}>
              {parcel.crops.map((record) => (
                <CropLine key={record.id} record={record} row={selection[record.id]} showErrors={showErrors} onToggle={onToggleCrop} onChange={onChange} />
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}

export default function LogCropDisasterScreen({ onClose, onSuccess }) {
  const { showToast } = useToast()
  const today = todayISO()
  const [disasterType, setDisasterType] = useState('')
  const [other, setOther] = useState('')
  const [date, setDate] = useState(today)
  const [damage, setDamage] = useState('')
  const [loss, setLoss] = useState('')
  const photosState = usePhotoList()
  const [targets, setTargets] = useState(null)             // null while loading, false when it failed
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [barangay, setBarangay] = useState('')
  const [farmer, setFarmer] = useState('')
  const [mode, setMode] = useState('list')
  const [page, setPage] = useState(1)
  const [opened, setOpened] = useState([])                 // keys of the parcels shown open
  const [selection, setSelection] = useState({})
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const query = useDebouncedValue(search.trim())

  useEffect(() => {
    let alive = true
    api.get('/production/disasters/targets/')
      .then((r) => alive && setTargets(prepareParcels(r.data?.parcels)))
      .catch(() => alive && setTargets(false))
    return () => { alive = false }
  }, [reload])

  const parcels = useMemo(() => targets || [], [targets])
  const sorted = useMemo(() => sortParcels(filterParcels(parcels, { search: query, barangay, farmer }), mode), [parcels, query, barangay, farmer, mode])
  const items = useMemo(() => pageItems(sorted, mode, page), [sorted, mode, page])
  const shownCrops = useMemo(() => allCrops(sorted), [sorted])
  const barangays = useMemo(() => barangayOptions(parcels), [parcels])
  const farmers = useMemo(() => farmerOptions(parcels), [parcels])

  const { rows, records } = useMemo(() => orderedRows(selection, parcels), [selection, parcels])
  const { crops: cropCount, total: totalCount } = counts(selection)
  const stats = selectedStats(selection, parcels)

  const typeError = !disasterType ? 'Please select a disaster type.' : (disasterType === 'Other' && !other.trim() ? 'Please specify the disaster type.' : '')
  const dateError = dateProblem(date, rows, records, today)
  const tooMany = cropCount > MAX_CROPS
  const rowErrors = rows.some((r) => areaProblem(r))

  const filtered = (setter) => (value) => { setter(value); setPage(1) }
  const toggleOpen = (key) => setOpened((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]))
  const select = (crops, on) => setSelection((s) => selectMany(s, crops, on))
  const toggleCrop = (record, on) => select([record], on)
  const total = (crops, on) => setSelection((s) => markTotal(s, crops, on))
  const changeRow = (id, change) => setSelection((s) => updateRow(s, id, change))

  const handleSubmitClick = () => {
    setShowErrors(true)
    if (!cropCount) { showToast('Tick at least one affected parcel or crop.', 'error'); return }
    if (tooMany) { showToast(`Choose at most ${MAX_CROPS} crops at a time.`, 'error'); return }
    if (typeError) { showToast(typeError, 'error'); return }
    if (dateError || rowErrors) { showToast(dateError || 'Fix the area affected of the highlighted crops.', 'error'); return }
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      const { fields, crops: sent } = buildRequest({ disasterType, other, date, damage, loss }, rows)
      let payload
      if (photosState.photos.length) {
        payload = new FormData()
        Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined) payload.append(k, v) })
        payload.append('crops', JSON.stringify(sent))
        photosState.photos.forEach((p) => payload.append('photos', p.file))
      } else {
        payload = { ...fields, crops: sent }
      }
      await api.post('/production/disasters/multi/', payload)
      showToast(`Disaster recorded on ${cropCount} crop${cropCount === 1 ? '' : 's'} of ${stats.farmers} farmer${stats.farmers === 1 ? '' : 's'}.`, 'success')
      onSuccess?.()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      showToast(data?.photos?.[0] || data?.detail || data?.crops?.[0] || 'Failed to save the disaster report.', 'error')
    } finally { setIsSubmitting(false) }
  }

  const everyShownSelected = allSelected(selection, shownCrops)

  return (
    <>
      <section aria-label="Log Disaster" className="space-y-4">
          <header className="flex items-center gap-3 rounded-xl border border-[#E2E8E2] bg-white px-4 py-3">
            <button type="button" onClick={onClose} aria-label="Back to Crop Disaster"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-md text-[#4A5E4A] hover:bg-[#F0F4F0]">
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-rose-100">
              <AlertTriangle size={18} className="text-rose-600" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold text-[#1A2B1A]">Log Disaster</h2>
              <p className="text-[12px] text-[#7A8E7A] max-sm:line-clamp-1">One disaster event: tick the parcels and crops that were affected</p>
            </div>
          </header>

          <div>
            <div className="space-y-5">
              <section className="rounded-xl border border-[#E2E8E2] bg-white p-4">
                <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Disaster details</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Type of disaster *</label>
                    <ComboboxWithOther options={DISASTER_TYPES} value={disasterType} otherValue={other}
                      onChange={setDisasterType} onOtherChange={setOther} placeholder="Select type" />
                    {showErrors && typeError && <p className="mt-1 text-xs text-rose-600">{typeError}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Date of occurrence *</label>
                    <input type="date" className={`${baseInputClasses} ${showErrors && dateError ? 'border-rose-400' : ''}`} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
                    {showErrors && dateError && <p className="mt-1 text-xs text-rose-600">{dateError}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Damage description (optional)</label>
                    <textarea rows={2} className={`${baseInputClasses} h-auto resize-none py-2`} value={damage} onChange={(e) => setDamage(e.target.value)}
                      placeholder="Describe the damage observed" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Estimated production loss (optional)</label>
                    <textarea rows={2} className={`${baseInputClasses} h-auto resize-none py-2`} value={loss} onChange={(e) => setLoss(e.target.value)}
                      placeholder="Describe or estimate production loss" />
                  </div>
                </div>
                <div className="mt-4">
                  <PhotoListField photosState={photosState} title="Photos (optional)"
                    hint="Up to 10 photos showing the damage. Each crop's report keeps a copy." altPrefix="Damage photo" />
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Affected parcels and crops</h3>
                  <ViewToggle ariaLabel="Show parcels as" options={VIEW_MODES} value={mode} onChange={filtered(setMode)} />
                </div>

                <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[#E2E8E2] bg-white px-3 py-2.5">
                  <div className="relative min-w-[14rem] flex-1">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A8BCA8]" aria-hidden="true" />
                    <input type="search" value={search} onChange={(e) => filtered(setSearch)(e.target.value)} aria-label="Search parcels"
                      placeholder="Search a farmer, RSBSA number, parcel number, barangay or crop…"
                      className="h-[38px] w-full bg-transparent pl-9 pr-3 text-[13px] text-[#1A2B1A] outline-none placeholder:text-[#A8BCA8]" />
                  </div>
                  <select className={SELECT} value={farmer} onChange={(e) => filtered(setFarmer)(e.target.value)} aria-label="Farmer">
                    <option value="">All farmers</option>
                    {farmers.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <select className={SELECT} value={barangay} onChange={(e) => filtered(setBarangay)(e.target.value)} aria-label="Barangay">
                    <option value="">All barangays</option>
                    {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                {targets === null && <p className="rounded-xl border border-[#E2E8E2] bg-white px-4 py-10 text-center text-[13px] text-[#7A8E7A]">Loading the parcels with crops…</p>}
                {targets === false && (
                  <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
                    <span className="flex-1">The parcels could not be loaded.</span>
                    <Button type="button" variant="outline" onClick={() => { setTargets(null); setReload((n) => n + 1) }}>Try again</Button>
                  </div>
                )}
                {targets && parcels.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[#C8D5C8] bg-white px-4 py-10 text-center text-[13px] text-[#7A8E7A]">No parcel has crops growing now, so there is nothing to log a disaster on.</p>
                )}
                {targets && parcels.length > 0 && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12.5px] text-[#4A5E4A]">
                      <label className="flex min-h-[36px] cursor-pointer items-center gap-2 font-medium text-[#1A2B1A]">
                        <input type="checkbox" className={CHECK} checked={everyShownSelected} disabled={shownCrops.length === 0}
                          onChange={(e) => select(shownCrops, e.target.checked)} />
                        Select every parcel shown ({sorted.length} parcel{sorted.length === 1 ? '' : 's'}, {shownCrops.length} crop{shownCrops.length === 1 ? '' : 's'})
                      </label>
                      {cropCount > 0 && (
                        <button type="button" className="font-medium text-[#1B4D2E] hover:underline" onClick={() => setSelection({})}>Clear the selection</button>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white">
                      <table className="w-full min-w-[56rem] text-sm">
                        <thead className="bg-[#F0F4F0] text-[#4A5E4A]">
                          <tr>
                            <th className={`${TH} w-10`}><span className="sr-only">Select</span></th>
                            <th className={TH}>Parcel</th>
                            <th className={TH}>Farmer</th>
                            <th className={TH}>Barangay</th>
                            <th className={TH}>Area (ha)</th>
                            <th className={TH}>Crops</th>
                            <th className={TH}>Total loss</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.length === 0 && (
                            <tr><td colSpan={COLUMNS} className="px-4 py-10 text-center text-[13px] text-[#7A8E7A]">No parcel matches the search and filters.</td></tr>
                          )}
                          {items.map((item) => (item.type === 'group' ? (
                            <tr key={`g-${item.key}-${page}`} className="border-b border-[#E2E8E2] bg-[#EBF5EE]">
                              <td className="w-10 px-3 py-2">
                                <input type="checkbox" className={CHECK} checked={allSelected(selection, allCrops(item.parcels))}
                                  aria-label={`Select every parcel of ${item.label}`} onChange={(e) => select(allCrops(item.parcels), e.target.checked)} />
                              </td>
                              <td colSpan={COLUMNS - 1} className="px-3 py-2 text-[13px] font-semibold text-[#1B4D2E]">
                                {item.label}
                                {item.sub && <span className="ml-2 font-normal text-[#4A5E4A]">{item.sub}</span>}
                                <span className="ml-3 text-[12px] font-normal text-[#4A5E4A]">
                                  {item.parcels.length} parcel{item.parcels.length === 1 ? '' : 's'} · {allCrops(item.parcels).length} crops
                                </span>
                              </td>
                            </tr>
                          ) : (
                            <Fragment key={item.key}>
                              <ParcelRows parcel={item.parcel} selection={selection} open={opened.includes(item.key)} showErrors={showErrors}
                                onToggleOpen={() => toggleOpen(item.key)} onSelect={select} onTotal={total} onToggleCrop={toggleCrop} onChange={changeRow} />
                            </Fragment>
                          )))}
                        </tbody>
                      </table>
                    </div>
                    <PaginationBar page={page} totalCount={sorted.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
                  </>
                )}
              </section>

              {totalCount > 0 && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {totalCount === 1 ? '1 crop is' : `${totalCount} crops are`} marked as a total loss: that ends {totalCount === 1 ? 'its' : 'their'} production cycle and no harvest can be recorded.
                </p>
              )}
            </div>
          </div>

          <footer className="sticky bottom-0 z-10 max-md:bottom-16 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[#E2E8E2] bg-white px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
            <p className={`mr-auto text-[12.5px] ${tooMany ? 'font-medium text-rose-600' : 'text-[#4A5E4A]'}`} role="status">
              {tooMany ? `Choose at most ${MAX_CROPS} crops at a time.` : `${summaryLine(stats)}${totalCount ? ` · ${totalCount} total loss` : ''}`}
            </p>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <button type="button" onClick={handleSubmitClick} disabled={isSubmitting}
              className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-60">
              {isSubmitting ? 'Saving…' : `Report Disaster${cropCount > 1 ? ` (${cropCount} crops)` : ''}`}
            </button>
          </footer>
      </section>

      {showConfirm && (
        <ConfirmDialog variant="primary"
          title="Confirm Disaster Report"
          message={`Log this disaster event on ${cropCount} crop${cropCount === 1 ? '' : 's'} of ${stats.farmers} farmer${stats.farmers === 1 ? '' : 's'}? A separate report is recorded for each crop.`}
          confirmLabel="Yes, Report"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
