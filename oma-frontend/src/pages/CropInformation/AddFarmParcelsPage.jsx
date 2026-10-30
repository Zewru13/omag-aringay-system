import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Plus, Trash2, Upload } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import FarmerSearchInput from '../../components/FarmerSearchInput.jsx'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BARANGAYS from '../../constants/barangays.js'
import Button from '../../components/UI/Button.jsx'
import { bulkCellInputClasses, bulkThCenterClasses, bulkThClasses } from '../../components/UI/bulkEntryStyles.js'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import IdNumberInput from '../../components/UI/IdNumberInput.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftState from '../../hooks/useDraftState.js'
import { RSBSA_GROUPS } from '../../utils/idNumbers.js'
import { uploadPcicForm } from '../../utils/pcic.js'
import { cropRecordsFromImport } from '../Farmers/importedCropRecords.js'
import ParcelCropsImportModal from '../Farmers/ParcelCropsImportModal.jsx'
import CropRecordsTable from '../Monitoring/CropRecordsTable.jsx'
import { makeCropRecord } from '../Monitoring/cropRecordForm.js'
import { useCropFormLookups } from '../Monitoring/useCropFormLookups.js'
import { areaProblem } from './cropEntry.js'
import { ownerParcelFill } from './parcelRecords.js'
import {
  CROPPING_SCHEDULE_OPTIONS, PARCEL_NUMBER_DIGITS, PARCEL_NUMBER_GROUPS, PARCEL_NUMBER_PLACEHOLDER, TAX_DECLARATION_DIGITS, TAX_DECLARATION_GROUPS, FARM_TYPE_OPTIONS, LAND_OWNERSHIP_OPTIONS, MAX_PARCELS,
  buildPayload, isTenure, makeParcelRow, pcicUploads, serverErrorsToMessages, toggleClassification, validateRows,
} from '../Farmers/parcelRows.js'
import useParcelClassifications from '../Farmers/useParcelClassifications.js'

// Add Farm Parcels (Crop Records > Add Farm Parcel, and the farmer profile's Add Farm Parcel button): pick a farmer, then add as many
// parcels as needed in a table, one row per parcel, with each parcel's crops (the Add Crop Records form, recorded on the parcel) in a
// table under it (typed in, or read from a crops file). The parcel number, land ownership, farm type and cropping schedule are required. Everything is
// saved together or not at all (POST /farmers/<id>/parcels/bulk/), like the Add Crop Records page.

// Fixed pixel width per column, shared by every <th>/<td> of that column so header and body cannot drift apart.
const COL_WIDTH = { index: 44, number: 410, barangay: 160, area: 110, ownership: 130, taxDec: 230, farmType: 170, schedule: 170, remove: 56 }
const COLUMN_COUNT = 9

// Phone: every row becomes a card whose cells are labelled (the label comes from the cell's data-label).
const CELL = 'px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]'
const REMOVE_BTN = 'inline-flex items-center gap-1.5 rounded-md p-1.5 text-rose-500 hover:bg-rose-50 transition-colors max-md:min-h-[40px] max-md:px-3 max-md:text-[13px] max-md:font-medium'

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#4A5E4A]">
      <span className="flex items-center gap-1"><span className="text-rose-500">*</span> Required field</span>
      <span className="flex items-center gap-1.5">
        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-[#4A5E4A] text-white">opt</span>
        Optional — leave blank if not applicable
      </span>
    </div>
  )
}

const Opt = () => <span className="ml-1.5 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-white/20 text-white align-middle">opt</span>

// ── the crops of one parcel ───────────────────────────────────────────────────

// The crops grown on one parcel: the Add Crop Records form itself (same fields, same rules), with this parcel as the place. Each crop
// is saved as a crop record on the parcel when the parcel is saved.
function ParcelCrops({ row, lookups, onAdd, onImport, onUpdate, onRemove }) {
  const records = (row.crop_records || []).map((r) => ({ ...r, farm_parcel: String(row._id), farm_location_barangay: row.barangay }))
  const parcelArea = Number(row.area_hectares) || 0
  const parcels = [{ id: row._id, area_hectares: row.area_hectares, growing_area_ha: 0 }]
  const areaErrors = Object.fromEntries(records.map((r, i) => [r._id, areaProblem(records, i, parcels)]))
  const used = Math.round(records.reduce((sum, r) => sum + (Number(r.area_planted_ha) || 0), 0) * 100) / 100
  const over = parcelArea > 0 && used > parcelArea
  const knownParcel = { id: row._id, land_ownership: row.land_ownership, land_owner_name: row.land_owner_name, barangay: row.barangay }
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Crops <span className="font-normal normal-case text-[#7A8E7A]">(optional) — what is planted on this parcel. Each crop is recorded for monitoring, with the same fields and rules as Add Crop Records.</span></p>
        <div className="flex flex-wrap items-center gap-2">
          {parcelArea > 0 && records.length > 0 && (
            <p role="status" className={`mr-1 text-[12px] font-semibold ${over ? 'text-rose-600' : 'text-[#4A5E4A]'}`}>
              {used} of {parcelArea} ha planted{over && ' — too much for this parcel'}
            </p>
          )}
          <button type="button" onClick={onImport} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#1B4D2E]/30 bg-[#EBF5EE]/50 px-3 text-[12px] font-semibold text-[#1B4D2E] hover:bg-[#EBF5EE]">
            <Upload size={13} aria-hidden="true" /> Import crops
          </button>
          <button type="button" onClick={() => onAdd(knownParcel)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3 text-[12px] font-semibold text-white hover:bg-[#235E38]">
            <Plus size={13} aria-hidden="true" /> Add crop
          </button>
        </div>
      </div>
      {records.length > 0 && (
        <CropRecordsTable
          records={records}
          cropTypes={lookups.cropTypes}
          seedSources={lookups.seedSources}
          varieties={lookups.varieties}
          farmerId={null}   // the parcel is not saved yet, so there is nothing to compare for the "already has this crop" warning; the server still refuses a repeat
          farmerParcels={[knownParcel]}
          parcelLocked
          areaErrors={areaErrors}
          onUpdate={(recordId, field, value) => onUpdate(row._id, recordId, field, value)}
          onRemove={(recordId) => onRemove(row._id, recordId)}
        />
      )}
    </div>
  )
}

// ── one parcel: its table row, then a row with its classifications and crops ───────────────────────────────

function ParcelRow({ row, index, total, offered, panelWidth, error, lookups, onUpdate, onRemove, onAddCrop, onImportCrops, onUpdateCrop, onRemoveCrop }) {
  const set = (field, value) => onUpdate(row._id, { [field]: value })
  return (
    <>
      <tr className={`border-b border-[#F0F4F0] align-top max-md:block max-md:mb-3 max-md:rounded-xl max-md:border max-md:border-[#E2E8E2] max-md:p-3 ${error ? 'bg-rose-50/40' : 'max-md:bg-white'}`}>
        <td data-label="Parcel" className={`${CELL} text-center text-[13px] text-[#7A8E7A] max-md:text-left`} style={{ width: COL_WIDTH.index }}>{index + 1}</td>
        <td data-label="Parcel number *" className={`${CELL} overflow-visible`} style={{ width: COL_WIDTH.number }}>
          <IdNumberInput groups={PARCEL_NUMBER_GROUPS} maxDigits={PARCEL_NUMBER_DIGITS} value={row.parcel_number}
            placeholder={PARCEL_NUMBER_PLACEHOLDER} onChange={(v) => set('parcel_number', v)} />
        </td>
        <td data-label="Barangay *" className={CELL} style={{ width: COL_WIDTH.barangay }}>
          <select className={bulkCellInputClasses} value={row.barangay} onChange={(e) => set('barangay', e.target.value)}>
            <option value="" disabled>Select…</option>
            {BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </td>
        <td data-label="Area (ha) *" className={CELL} style={{ width: COL_WIDTH.area }}>
          <DecimalInput decimals={2} className={bulkCellInputClasses} placeholder="0.00" value={row.area_hectares} onChange={(v) => set('area_hectares', v)} />
        </td>
        <td data-label="Land ownership *" className={CELL} style={{ width: COL_WIDTH.ownership }}>
          <select className={bulkCellInputClasses} value={row.land_ownership}
            onChange={(e) => {
              const next = e.target.value
              onUpdate(row._id, isTenure(next) ? { land_ownership: next } : { land_ownership: next, land_owner_name: '', land_owner_rsbsa_number: '' })
            }}>
            <option value="" disabled>Select…</option>
            {LAND_OWNERSHIP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
        <td data-label="Tax Dec number" className={`${CELL} overflow-visible`} style={{ width: COL_WIDTH.taxDec }}>
          <IdNumberInput groups={TAX_DECLARATION_GROUPS} maxDigits={TAX_DECLARATION_DIGITS} value={row.tax_declaration_number}
            placeholder="01-002-00005-2023-0142" onChange={(v) => set('tax_declaration_number', v)} />
        </td>
        <td data-label="Farm type *" className={CELL} style={{ width: COL_WIDTH.farmType }}>
          <select className={bulkCellInputClasses} value={row.farm_type} onChange={(e) => set('farm_type', e.target.value)}>
            <option value="">Select type…</option>
            {FARM_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
        <td data-label="Cropping schedule *" className={CELL} style={{ width: COL_WIDTH.schedule }}>
          <select className={bulkCellInputClasses} value={row.cropping_schedule} onChange={(e) => set('cropping_schedule', e.target.value)}>
            <option value="">Select schedule…</option>
            {CROPPING_SCHEDULE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
        <td className="px-3 py-3 text-center max-md:block max-md:w-full! max-md:px-0 max-md:py-1 max-md:text-right" style={{ width: COL_WIDTH.remove }}>
          {total > 1 && (
            <button type="button" onClick={() => onRemove(row._id)} title="Remove parcel" className={REMOVE_BTN}>
              <Trash2 size={13} /> <span className="md:hidden">Remove parcel</span>
            </button>
          )}
        </td>
      </tr>
      <tr className={`border-b border-[#E2E8E2] max-md:block max-md:mb-3 ${error ? 'bg-rose-50/40' : ''}`}>
        <td colSpan={COLUMN_COUNT} className="px-3 pb-4 max-md:block max-md:px-0">
          {/* The table scrolls sideways; this panel stays as wide as the page and in view while it does. */}
          <div className="space-y-4 rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3 md:sticky md:left-3" style={panelWidth ? { maxWidth: panelWidth } : undefined}>
            {isTenure(row.land_ownership) && (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[#4A5E4A]">Land owner name <span className="text-rose-500">*</span></label>
                  <input className={bulkCellInputClasses} value={row.land_owner_name} placeholder="Full name of the land owner" onChange={(e) => set('land_owner_name', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[#4A5E4A]">Land owner RSBSA number <span className="text-[11px] font-normal text-[#7A8E7A]">(optional)</span></label>
                  <IdNumberInput groups={RSBSA_GROUPS} value={row.land_owner_rsbsa_number} placeholder="01-33-02-014-058212" onChange={(v) => set('land_owner_rsbsa_number', v)} />
                </div>
              </div>
            )}
            <div>
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Classifications <span className="font-normal normal-case text-[#7A8E7A]">(optional) — check all that apply to this parcel</span></p>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {offered.map((name) => (
                  <label key={name} className="flex min-h-[36px] cursor-pointer items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={row.classifications.includes(name)}
                      onChange={(e) => set('classifications', toggleClassification(row.classifications, name, e.target.checked))} />
                    <span className="text-[13px] text-[#1A2B1A]">{name}</span>
                  </label>
                ))}
                {offered.length === 0 && <p className="text-[12px] text-[#7A8E7A]">None set up. An Admin can add them in Classification Settings.</p>}
              </div>
            </div>
            <ParcelCrops row={row} lookups={lookups} onAdd={onAddCrop} onImport={() => onImportCrops(row._id)} onUpdate={onUpdateCrop} onRemove={onRemoveCrop} />
          </div>
        </td>
      </tr>
      {error && (
        <tr className="border-b border-[#F0F4F0] bg-rose-50/40 max-md:block max-md:-mt-2 max-md:mb-3 max-md:rounded-b-xl max-md:px-3 max-md:pb-2">
          <td colSpan={COLUMN_COUNT} className="px-3 pb-2.5 text-[12px] text-rose-600 max-md:block max-md:px-0">{error}</td>
        </tr>
      )}
    </>
  )
}

// ── Confirm Submission — review step before the actual save ────────────────────

function ConfirmModal({ rows, cropTypes, farmerName, isSubmitting, onConfirm, onCancel }) {
  const cropName = (id) => cropTypes.find((c) => String(c.id) === String(id))?.name || 'crop'
  return (
    <ModalShell
      title="Confirm Submission"
      subtitle="Farm parcels"
      icon={CheckCircle2}
      iconBg="bg-emerald-100"
      iconColor="text-emerald-700"
      onClose={onCancel}
      maxWidth="max-w-lg"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onCancel}>Go Back &amp; Review</Button>
          <Button type="button" isLoading={isSubmitting} onClick={onConfirm}>Confirm &amp; Submit</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-800" aria-hidden="true" />
          <div>
            <p className="text-[13px] font-semibold text-emerald-800">{rows.length} parcel{rows.length === 1 ? '' : 's'} will be added</p>
            <p className="mt-0.5 text-[13px] text-emerald-700">Farm parcels · for {farmerName}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-[13px] text-amber-800">
            <span className="font-semibold">All-or-nothing:</span> if any parcel fails server-side validation, none of the {rows.length} will be saved.
          </p>
        </div>
        <div className="rounded-2xl border border-[#E2E8E2] bg-white">
          <p className="border-b border-[#E2E8E2] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#7A8E7A]">Parcel Summary</p>
          <div className="max-h-64 divide-y divide-[#F0F4F0] overflow-y-auto">
            {rows.map((row, i) => (
              <div key={row._id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[#1A2B1A]">#{i + 1} {row.parcel_number || 'No parcel number'} · {row.barangay}</p>
                  <p className="truncate text-[12px] text-[#7A8E7A]">
                    {[
                      row.crop_records.length ? row.crop_records.map((r) => cropName(r.crop_type)).join(', ') : 'No crops',
                      row.classifications.length ? row.classifications.join(', ') : '',
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <p className="shrink-0 text-[13px] text-[#4A5A4C]">{row.area_hectares} ha</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const NO_FARMER = { farmer_id: null, farmer_full_name: '', farmer_home_barangay: '', farmer_assoc_id: null, farmer_assoc_name: '' }

export default function AddFarmParcelsPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()
  // The farmer comes from the address: /farmers/<id>/add-parcels (from Register Farmer or the profile), or ?farmer=<id> (Crop Records).
  const startFarmerId = useParams().id || searchParams.get('farmer')
  const classifications = useParcelClassifications()
  const offered = (classifications || []).map((c) => c.name)

  // What is being filled in is a draft: it is still here when the person comes back from another page (see hooks/useDraftState.js).
  const [work, setWork, draft] = useDraftState(`add-farm-parcels:${startFarmerId || ''}`, () => ({ farmerInfo: NO_FARMER, rows: [makeParcelRow(1)] }))
  const { farmerInfo, rows } = work
  const setFarmerInfo = useCallback((next) => setWork((w) => ({ ...w, farmerInfo: typeof next === 'function' ? next(w.farmerInfo) : next })), [setWork])
  const setRows = useCallback((next) => setWork((w) => ({ ...w, rows: typeof next === 'function' ? next(w.rows) : next })), [setWork])
  const [existing, setExisting] = useState(null)               // the farmer's parcels already on file
  // The next ids start after the ones of a restored draft.
  const nextIdRef = useRef(Math.max(1, ...rows.map((r) => r._id)) + 1)
  const nextCropIdRef = useRef(Math.max(0, ...rows.flatMap((r) => (r.crop_records || []).map((c) => c._id))) + 1)
  const lookups = useCropFormLookups()
  const [importingCropsFor, setImportingCropsFor] = useState(null)   // the id of the parcel whose crops file is being read
  const [isImportingParcels, setIsImportingParcels] = useState(false)   // the Import Farm Parcels file dialog (parcels of the chosen farmer)
  const [parcelsTick, setParcelsTick] = useState(0)                      // bumped after an import so the parcels on file are read again
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [rowErrors, setRowErrors] = useState({})

  // The width of the scrolling table area, so each parcel's panel can stay as wide as the page instead of as wide as the table.
  const tableRef = useRef(null)
  const [panelWidth, setPanelWidth] = useState(0)
  useEffect(() => {
    const el = tableRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => setPanelWidth(el.clientWidth - 24))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Arriving from a farmer's profile (?farmer=<id>) starts with that farmer chosen.
  useEffect(() => {
    if (!startFarmerId) return undefined
    let alive = true
    api.get(`/farmers/${startFarmerId}/`).then((r) => {
      if (!alive) return
      const f = r.data
      setFarmerInfo({ farmer_id: f.id, farmer_full_name: f.full_name, farmer_home_barangay: f.barangay || '', farmer_assoc_id: null, farmer_assoc_name: '' })
    }).catch(() => { if (alive) showToast('Could not load that farmer. Search for them instead.', 'error') })
    return () => { alive = false }
  }, [startFarmerId, showToast, setFarmerInfo])

  // The parcels the farmer already has, so the page can say so (the server refuses a repeated parcel number).
  useEffect(() => {
    if (!farmerInfo.farmer_id) return undefined
    let alive = true
    api.get(`/farmers/${farmerInfo.farmer_id}/parcels/`)
      .then((r) => { if (alive) setExisting({ farmerId: farmerInfo.farmer_id, list: Array.isArray(r.data) ? r.data : (r.data.results || []) }) })
      .catch(() => { if (alive) setExisting(null) })
    return () => { alive = false }
  }, [farmerInfo.farmer_id, parcelsTick])
  const existingList = existing && existing.farmerId === farmerInfo.farmer_id ? existing.list : null

  const goBack = () => navigate(farmerInfo.farmer_id && startFarmerId ? `/farmers/${farmerInfo.farmer_id}` : '/crop-records')

  const addRow = () => {
    if (rows.length >= MAX_PARCELS) { setError(`You can add at most ${MAX_PARCELS} parcels at a time.`); return }
    setRows((rs) => [...rs, makeParcelRow(nextIdRef.current++)])
  }
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r._id !== id))
  const updateRow = (id, patch) => setRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...patch } : r)))

  // The crops of a crops file are added to the parcel's own list (to check and correct there), the same rows as Add crop makes.
  const importCrops = (imported) => {
    const firstId = nextCropIdRef.current
    nextCropIdRef.current += imported.length
    setRows((rs) => rs.map((r) => (r._id === importingCropsFor
      ? { ...r, crop_records: [...r.crop_records, ...cropRecordsFromImport(imported, { parcel: r, cropTypes: lookups.cropTypes, varieties: lookups.varieties, firstId })] }
      : r)))
    showToast(`${imported.length} crop${imported.length === 1 ? '' : 's'} added.`, 'success')
    setImportingCropsFor(null)
  }
  // The crops of a parcel (functional updates: one change of a crop type sets several fields in a row).
  const addCrop = (rowId, parcelInfo) => {
    const blank = makeCropRecord(nextCropIdRef.current++)
    const record = { ...blank, ...ownerParcelFill([parcelInfo], blank) }
    setRows((rs) => rs.map((r) => (r._id === rowId ? { ...r, crop_records: [...r.crop_records, record] } : r)))
  }
  const updateCrop = (rowId, recordId, field, value) =>
    setRows((rs) => rs.map((r) => (r._id === rowId ? { ...r, crop_records: r.crop_records.map((c) => (c._id === recordId ? { ...c, [field]: value } : c)) } : r)))
  const removeCrop = (rowId, recordId) =>
    setRows((rs) => rs.map((r) => (r._id === rowId ? { ...r, crop_records: r.crop_records.filter((c) => c._id !== recordId) } : r)))

  const validate = () => {
    if (!farmerInfo.farmer_id) { setError('Please select a farmer.'); return false }
    const taken = new Set((existingList || []).map((p) => p.parcel_number).filter(Boolean))
    const problems = validateRows(rows)
    rows.forEach((row, i) => {
      if (!problems[row._id] && row.parcel_number && taken.has(row.parcel_number)) problems[row._id] = `Parcel ${i + 1}: ${farmerInfo.farmer_full_name} already has parcel ${row.parcel_number}.`
    })
    if (Object.keys(problems).length) {
      setRowErrors(problems)
      setError('Please fix the highlighted parcels.')
      return false
    }
    setRowErrors({})
    return true
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (validate()) setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setIsSubmitting(true)
    try {
      const { data: created } = await api.post(`/farmers/${farmerInfo.farmer_id}/parcels/bulk/`, buildPayload(rows, { farmerInfo, cropTypes: lookups.cropTypes }))
      const photoFailures = []
      for (const upload of pcicUploads(rows, created, (r) => lookups.cropTypes.find((c) => String(c.id) === String(r.crop_type))?.name || 'a crop')) {
        try {
          await uploadPcicForm(api, 'planting', upload.recordId, upload.pcic)
        } catch {
          photoFailures.push(upload.label)
        }
      }
      setShowConfirm(false)
      if (photoFailures.length) showToast(`Saved, but the PCIC form photo could not be uploaded for: ${photoFailures.join(', ')}. Add it later from the farmer's profile.`, 'error')
      showToast(`${rows.length} farm parcel${rows.length > 1 ? 's' : ''} added.`, 'success')
      draft.clear()
      goBack()
    } catch (err) {
      setShowConfirm(false)
      const data = err?.response?.data
      if (data?.errors && Array.isArray(data.errors)) {
        setRowErrors(serverErrorsToMessages(data.errors, rows))
        setError('Nothing was saved — fix the highlighted parcel(s) and try again.')
      } else {
        setError(data?.detail || 'Nothing was saved — failed to add these parcels.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageLayout title="Add Farm Parcels" subtitle="Each row is one farm parcel. Add as many as the farmer has, with the crops planted on each.">
      <button type="button" onClick={goBack} className="mb-4 inline-flex items-center gap-1 text-[13px] text-[#1B4D2E] hover:underline max-md:min-h-[40px]">
        <ArrowLeft size={14} /> {farmerInfo.farmer_id && startFarmerId ? 'Back to the farmer’s profile' : 'Back to Crop Records'}
      </button>

      <form onSubmit={handleSubmit} className="space-y-5">
        <DraftBanner draft={draft} />
        <Legend />

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-3">Farmer Information</p>
          <div className="max-w-xl">
            <FarmerSearchInput onSelect={setFarmerInfo} selected={farmerInfo} />
          </div>
          <div className="mt-3">
            <button type="button" onClick={() => setIsImportingParcels(true)} disabled={!farmerInfo.farmer_id}
              title={farmerInfo.farmer_id ? undefined : 'Choose the farmer first'}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#1B4D2E]/30 bg-[#EBF5EE]/50 px-3 text-[12px] font-semibold text-[#1B4D2E] hover:bg-[#EBF5EE] disabled:cursor-not-allowed disabled:opacity-50">
              <Upload size={13} aria-hidden="true" /> Import Farm Parcels
            </button>
            <p className="mt-1 text-[11px] text-[#7A8E7A]">
              {farmerInfo.farmer_id ? `Add many parcels of ${farmerInfo.farmer_full_name} at once from a spreadsheet.` : 'Choose the farmer first, then import their parcels from a spreadsheet.'}
            </p>
          </div>
          {farmerInfo.farmer_id && (
            <div className="mt-3 grid max-w-xl grid-cols-2 gap-3">
              <div>
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#A8BCA8]">Home Barangay</p>
                <p className="text-xs font-medium text-[#1A2B1A]">{farmerInfo.farmer_home_barangay || '—'}</p>
              </div>
              <div>
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#A8BCA8]">Parcels on file</p>
                <p className="text-xs font-medium text-[#1A2B1A]">
                  {existingList === null ? '…' : existingList.length === 0 ? 'None yet' : `${existingList.length} (${existingList.map((p) => p.parcel_number || 'no number').join(', ')})`}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <Info size={16} className="mt-0.5 shrink-0 text-sky-800" aria-hidden="true" />
          <p className="text-[13px] text-sky-800">
            <span className="font-semibold">All-or-nothing submission:</span> every parcel must pass validation before any is saved. An error in one
            parcel prevents all of them from saving. Have many parcels in a file? Choose the farmer, then use <span className="font-semibold">Import Farm Parcels</span> above: it checks the file first and saves the parcels straight to that farmer.
          </p>
        </div>

        <div ref={tableRef} className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <table className="table-fixed text-sm max-md:block max-md:w-full">
            <thead className="bg-[#1B4D2E] text-white max-md:hidden">
              <tr>
                <th className={`${bulkThCenterClasses} overflow-hidden`} style={{ width: COL_WIDTH.index }}>#</th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.number }}>Parcel Number <span className="text-white/70">*</span></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.barangay }}>Barangay <span className="text-white/70">*</span></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.area }}>Area (ha) <span className="text-white/70">*</span></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.ownership }}>Land Ownership <span className="text-white/70">*</span></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.taxDec }}>Tax Dec No.<Opt /></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.farmType }}>Farm Type <span className="text-white/70">*</span></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.schedule }}>Cropping Schedule <span className="text-white/70">*</span></th>
                <th className={bulkThCenterClasses} style={{ width: COL_WIDTH.remove }} />
              </tr>
            </thead>
            <tbody className="max-md:block">
              {rows.map((row, i) => (
                <ParcelRow key={row._id} row={row} index={i} total={rows.length} offered={offered} panelWidth={panelWidth} error={rowErrors[row._id]}
                  lookups={lookups}
                  onUpdate={updateRow} onRemove={removeRow} onImportCrops={setImportingCropsFor}
                  onAddCrop={(parcelInfo) => addCrop(row._id, parcelInfo)} onUpdateCrop={updateCrop} onRemoveCrop={removeCrop} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors">
            <Plus size={14} /> Add Parcel
          </button>
          <span className="text-[12.5px] text-[#7A8E7A]">{rows.length} parcel{rows.length === 1 ? '' : 's'}</span>
        </div>

        {error && <p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-[#F0F4F0] pt-4">
          <button type="button" onClick={goBack} className="rounded-lg border border-[#C8D5C8] px-5 py-2 text-sm font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="rounded-lg bg-[#1B4D2E] px-5 py-2 text-sm font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-60">
            {isSubmitting ? 'Submitting…' : `Submit ${rows.length > 1 ? `${rows.length} Parcels` : 'Parcel'}`}
          </button>
        </div>
      </form>

      {isImportingParcels && farmerInfo.farmer_id && (
        <ImportFileModal
          title="Import Farm Parcels"
          subtitle={`Add farm parcels, with the crops grown on them, to ${farmerInfo.farmer_full_name} from a spreadsheet.`}
          helpText="One row per crop, with the parcel columns repeated. Rows with the same Parcel Number become one parcel; a parcel without crops is one row with the crop columns left blank."
          importUrl={`/farmers/${farmerInfo.farmer_id}/parcels/import/`}
          templateUrl="/farmers/parcels/import/template/"
          templateFilename="farm_parcels_import_template.xlsx"
          undoType="farm_parcels"
          onClose={() => setIsImportingParcels(false)}
          onImported={() => setParcelsTick((t) => t + 1)}
        />
      )}
      {importingCropsFor !== null && <ParcelCropsImportModal kind="crops" onClose={() => setImportingCropsFor(null)} onRows={importCrops} />}

      {showConfirm && (
        <ConfirmModal rows={rows} cropTypes={lookups.cropTypes} farmerName={farmerInfo.farmer_full_name} isSubmitting={isSubmitting} onConfirm={handleConfirmed} onCancel={() => setShowConfirm(false)} />
      )}
    </PageLayout>
  )
}
