// The crop record table: one table of crop rows, with every field of a crop (status and owner, type, date planted, area, season,
// variety, seed source, quantity of seeds or trees, PCIC insurance). The Add Crop Records page and the Add Farm Parcels form both
// use it (with the rules in cropRecordForm.js), so a crop added in either place has the same fields and rules - they are one form. The page around it differs:
// the Add Crop page picks a farmer's existing parcel for each row, the parcel form adds the crops of a parcel that is being added.
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import BARANGAYS from '../../constants/barangays.js'
import { bulkCellInputClasses, bulkThClasses, bulkThCenterClasses } from '../../components/UI/bulkEntryStyles.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import PcicInsuranceField from '../../components/UI/PcicInsuranceField.jsx'
import {
  CROP_OWNERSHIP_OPTIONS, PLANTING_MATERIALS, canChoosePlanting, chooseCropOwnership, defaultPlantingMaterial, materialFor, needsLandOwner,
  quantityHeader, quantityLabel, statusFixedByParcels,
} from '../CropInformation/cropEntry.js'
import { detectSeason } from './cropRecordForm.js'

// Fixed pixel width per column, shared by every <th>/<td> in that column so
// header and body can never drift out of alignment (table-fixed sizes every
// column from these, not from cell content — an input can no longer force
// its column, or its neighbor's, to grow past what's declared here).
const COL_WIDTH = {
  index: 44,
  barangay: 150,
  landStatus: 170,
  cropOwner: 230,
  cropType: 190,
  datePlanted: 160,
  area: 110,
  season: 110,
  variety: 170,
  seedSource: 160,
  qtySeeds: 150,
  farmParcel: 170,
  remove: 56,
}

function OptBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-white/20 text-white align-middle">
      opt
    </span>
  )
}

// ── Crop Duplicate Check ──────────────────────────────────────────────────────

// Same rule the server enforces on save (production/duplicates.py): same farmer, crop and variety, an active record,
// and the same parcel (or the same barangay when no parcel is chosen). The warning is advice; the server refuses.
function useCropDuplicateCheck(farmerId, rec) {
  const [duplicates,  setDuplicates]  = useState([])
  const [isChecking,  setIsChecking]  = useState(false)
  const timerRef = useRef(null)
  const cropTypeId = rec.crop_type
  const variety = rec.variety_used || ''
  const parcel = rec.farm_parcel || ''
  const barangay = rec.farm_location_barangay || ''

  useEffect(() => {
    if (!farmerId || !cropTypeId) { setDuplicates([]); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setIsChecking(true)
      try {
        const r = await api.get('/production/monitoring/check-duplicate/', {
          params: { farmer: farmerId, crop_type: cropTypeId, variety, parcel, barangay },
        })
        setDuplicates(r.data?.duplicates || [])
      } catch { setDuplicates([]) }
      finally { setIsChecking(false) }
    }, 500)
    return () => clearTimeout(timerRef.current)
  }, [farmerId, cropTypeId, variety, parcel, barangay])

  return { duplicates, isChecking }
}

// ── Crop Record Row (tabular, every field flat — no expand/collapse) ─────────

// Column heading of the quantity column. When a crop in the table can be planted as seed or as trees it gets an expand button: the
// menu picks which one, and the heading follows (Qty of Seeds (kg) / Qty of Trees).
function QuantityHeader({ title, canSwitch, choice, onPick }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey) }
  }, [open])
  if (!canSwitch) return title
  return (
    <div ref={rootRef} className="relative inline-block normal-case">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white">
        {title}
        <ChevronDown size={13} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul role="listbox" aria-label="Quantity of seeds or trees" className="absolute left-0 top-full z-30 mt-1 w-40 rounded-lg border border-[#E2E8E2] bg-white py-1 text-[13px] font-normal text-[#1A2B1A] shadow-lg">
          {PLANTING_MATERIALS.map(m => (
            <li key={m} role="option" aria-selected={choice === m} tabIndex={0}
              onClick={() => { onPick(m); setOpen(false) }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(m); setOpen(false) } }}
              className={`cursor-pointer px-3 py-2 hover:bg-[#F5F7F5] ${choice === m ? 'bg-[#EBF5EE] font-semibold text-[#1B4D2E]' : ''}`}>
              {quantityLabel(m)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CropRecordRow({ rec, index, total, cropTypes, seedSources, varieties, farmerId, showParcelColumn, showOwnerColumn, statusFixed, farmerParcels, parcelLocked, error, areaError, onUpdate, onRemove }) {
  const set = (field, value) => onUpdate(rec._id, field, value)
  const { duplicates, isChecking } = useCropDuplicateCheck(farmerId, rec)
  const ownerInputRef = useRef(null)

  const relevantVarieties = varieties.filter(
    v => v.is_active && (!v.crop_type || String(v.crop_type) === String(rec.crop_type))
  )

  const selectedCropType = cropTypes.find(c => String(c.id) === String(rec.crop_type))
  const material = materialFor(selectedCropType, rec.planting_material)
  const hasDuplicates = !isChecking && duplicates.length > 0
  const duplicateTitle = hasDuplicates
    ? `An active ${duplicates[0].crop_type}${duplicates[0].variety_used ? ` (${duplicates[0].variety_used})` : ''} record already exists here: ${duplicates.map(d => `${d.date_planted || '—'} (${d.area_planted_ha} ha)`).join(', ')}`
    : undefined

  const colCount = 11 + (showParcelColumn ? 1 : 0) + (showOwnerColumn ? 1 : 0) - (parcelLocked ? 1 : 0) - (statusFixed ? 1 : 0)
  const rowParcel = farmerParcels.find(p => String(p.id) === String(rec.farm_parcel))
  // The parcel's own owner is offered for a Tenant / Lessee crop on it.
  const parcelOwnerName = rowParcel && needsLandOwner(rowParcel.land_ownership) ? (rowParcel.land_owner_name || '') : ''

  return (
    <>
      <tr className={`border-b border-[#F0F4F0] align-top max-md:block max-md:mb-3 max-md:rounded-xl max-md:border max-md:border-[#E2E8E2] max-md:p-3 ${error ? 'bg-rose-50/40' : 'max-md:bg-white'}`}>
        <td data-label="Crop record" className="px-3 py-3 text-center text-[13px] text-[#7A8E7A] max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.index }}>{index + 1}</td>
        {/* Inside a parcel the crop's barangay is the parcel's, so it is not asked for. */}
        {!parcelLocked && (
          <td data-label="Barangay *" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.barangay }}>
            <select
              className={`${bulkCellInputClasses} w-full`}
              value={rec.farm_location_barangay}
              onChange={e => set('farm_location_barangay', e.target.value)}
            >
              <option value="" disabled>Select…</option>
              {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </td>
        )}
        {/* On a parcel the farmer owns every crop is the owner's own, so there is no status to choose. */}
        {!statusFixed && (
          <td data-label="Crop status *" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.landStatus }}>
            <ComboboxWithOther
              options={CROP_OWNERSHIP_OPTIONS}
              value={rec.land_status}
              otherValue={rec.land_status_other_specify}
              onChange={(v) => {
                const next = chooseCropOwnership(rec, v, parcelOwnerName)
                Object.entries(next).forEach(([field, value]) => set(field, value))
                // Tenant / Lessee: the Crop Owner box opens beside - go straight to it when its name is still empty
                if (needsLandOwner(v) && !next.land_owner_name) setTimeout(() => ownerInputRef.current?.focus(), 50)
              }}
              onOtherChange={(v) => set('land_status_other_specify', v)}
              placeholder="Select…"
              inputClassName={bulkCellInputClasses}
              chevronSize={13}
            />
          </td>
        )}
        {/* The owner's name: a column that appears once a row is a Tenant / Lessee crop (other rows leave it empty). */}
        {showOwnerColumn && (
          <td data-label="Crop owner *" className={`px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)] ${needsLandOwner(rec.land_status) ? '' : 'max-md:hidden'}`} style={{ width: COL_WIDTH.cropOwner }}>
            {needsLandOwner(rec.land_status) && (
              <input ref={ownerInputRef} type="text" maxLength={200} className={`${bulkCellInputClasses} w-full`} aria-label="Crop owner's full name"
                placeholder="Owner's full name" title={rec.land_owner_name || undefined} value={rec.land_owner_name}
                onChange={e => set('land_owner_name', e.target.value)} />
            )}
          </td>
        )}
        <td data-label="Crop type *" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.cropType }}>
          <select className={`${bulkCellInputClasses} w-full`} value={rec.crop_type}
            onChange={e => {
              const next = e.target.value
              set('crop_type', next)
              // The variety belongs to the crop it was picked for: another crop starts with none.
              set('variety_used', '')
              set('variety_used_is_other', false)
              // How the crop is planted follows its crop type (Crop Settings): seed, trees, or either (then it starts as seed).
              set('planting_material', defaultPlantingMaterial(cropTypes.find(c => String(c.id) === next)))
            }}>
            <option value="">Select crop…</option>
            {cropTypes.map(ct => (
              <option key={ct.id} value={ct.id}>{ct.name} ({ct.days_to_harvest}d)</option>
            ))}
          </select>
          {hasDuplicates && (
            <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-amber-700" title={duplicateTitle}>
              <AlertTriangle size={11} className="shrink-0" /> Active record exists
            </p>
          )}
        </td>
        <td data-label="Date planted *" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.datePlanted }}>
          <input type="date" className={`${bulkCellInputClasses} w-full`} value={rec.date_planted}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => {
              set('date_planted', e.target.value)
              set('season', detectSeason(e.target.value))
            }} />
          {selectedCropType && rec.date_planted && (
            <p className="mt-1.5 truncate text-[11px] text-[#7A8E7A]">
              Harvest ~{(() => {
                const d = new Date(rec.date_planted + 'T00:00:00')
                d.setDate(d.getDate() + selectedCropType.days_to_harvest)
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              })()}
            </p>
          )}
        </td>
        <td data-label="Area (ha) *" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.area }}>
          <DecimalInput decimals={2} className={`${bulkCellInputClasses} w-full ${areaError ? 'border-rose-400' : ''}`}
            placeholder="0.00" aria-invalid={Boolean(areaError)}
            value={rec.area_planted_ha}
            onChange={v => set('area_planted_ha', v)} />
          {areaError && <p className="mt-1.5 text-[11px] leading-snug text-rose-600" role="alert">{areaError}</p>}
        </td>
        <td data-label="Season" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.season }}>
          <select className={`${bulkCellInputClasses} w-full`} value={rec.season}
            onChange={e => set('season', e.target.value)}>
            <option value="Wet">Wet</option>
            <option value="Dry">Dry</option>
          </select>
        </td>
        <td data-label="Variety" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.variety }}>
          <ComboboxWithOther
            options={relevantVarieties.map(v => v.name)}
            value={rec.variety_used_is_other ? 'Other' : rec.variety_used}
            otherValue={rec.variety_used}
            onChange={(v) => {
              if (v === 'Other') { set('variety_used_is_other', true); set('variety_used', '') }
              else { set('variety_used_is_other', false); set('variety_used', v) }
            }}
            onOtherChange={(v) => set('variety_used', v)}
            required
            placeholder="e.g. NSIC Rc222"
            inputClassName={bulkCellInputClasses}
            chevronSize={13}
          />
        </td>
        <td data-label="Seed source" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.seedSource }}>
          <ComboboxWithOther
            options={seedSources.filter(s => s.is_active).map(s => s.name)}
            value={rec.seed_source}
            otherValue={rec.seed_source_other_specify}
            onChange={(v) => set('seed_source', v)}
            onOtherChange={(v) => set('seed_source_other_specify', v)}
            placeholder="Select source"
            inputClassName={bulkCellInputClasses}
            chevronSize={13}
          />
        </td>
        <td data-label={quantityLabel(material)} className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.qtySeeds }}>
          {canChoosePlanting(selectedCropType) && (
            <div className="mb-1.5 inline-flex rounded-md border border-[#C8D5C8] p-0.5 md:hidden" role="group" aria-label="Quantity of seeds or trees">
              {PLANTING_MATERIALS.map(m => (
                <button key={m} type="button" aria-pressed={material === m} onClick={() => set('planting_material', m)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${material === m ? 'bg-[#1B4D2E] text-white' : 'text-[#4A5E4A] hover:bg-[#F0F4F0]'}`}>
                  {m === 'Tree' ? 'Trees' : 'Seeds'}
                </button>
              ))}
            </div>
          )}
          {material === 'Tree' ? (
            <input type="number" step="1" min="0" inputMode="numeric" className={`${bulkCellInputClasses} w-full`} aria-label="Qty of trees"
              placeholder="0" value={rec.quantity_of_trees}
              onChange={e => set('quantity_of_trees', e.target.value.replace(/[^0-9]/g, ''))} />
          ) : (
            <input type="number" step="0.01" min="0" className={`${bulkCellInputClasses} w-full`} aria-label="Qty of seeds (kg)"
              placeholder="0"
              value={rec.quantity_of_seeds}
              onChange={e => set('quantity_of_seeds', e.target.value)} />
          )}
        </td>
        {showParcelColumn && (
          <td data-label="Farm parcel" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.farmParcel }}>
            <select className={`${bulkCellInputClasses} w-full disabled:bg-[#F5F7F5]`} value={rec.farm_parcel} disabled={parcelLocked}
              title={parcelLocked ? 'Every crop on this page is added to this parcel' : undefined}
              onChange={e => {
                const value = e.target.value
                set('farm_parcel', value)
                // The parcel knows its barangay and the farmer's tenure there; fill them in only where still blank.
                const parcel = farmerParcels.find(p => String(p.id) === value)
                if (parcel) {
                  if (!rec.farm_location_barangay) set('farm_location_barangay', parcel.barangay || '')
                  if (!rec.land_status && ['Owner', 'Tenant', 'Lessee'].includes(parcel.land_ownership)) {
                    set('land_status', parcel.land_ownership)
                    if (needsLandOwner(parcel.land_ownership) && !rec.land_owner_name) set('land_owner_name', parcel.land_owner_name || '')
                  }
                }
              }}>
              <option value="">Choose parcel</option>
              {farmerParcels.map(p => (
                <option key={p.id} value={p.id}>
                  {p.parcel_number ? `Parcel ${p.parcel_number}` : `Parcel #${p.id}`} — {p.barangay}
                </option>
              ))}
            </select>
          </td>
        )}
        <td className="px-3 py-3 text-center max-md:block max-md:w-full! max-md:px-0 max-md:py-1 max-md:text-right" style={{ width: COL_WIDTH.remove }}>
          {total > 1 && (
            <button type="button" onClick={() => onRemove(rec._id)} title="Remove row"
              className="inline-flex items-center gap-1.5 rounded-md p-1.5 text-rose-500 hover:bg-rose-50 transition-colors max-md:min-h-[40px] max-md:px-3 max-md:text-[13px] max-md:font-medium">
              <Trash2 size={13} /> <span className="md:hidden">Remove record</span>
            </button>
          )}
        </td>
      </tr>
      <tr className="border-b border-[#F0F4F0] max-md:block">
        <td colSpan={colCount} className="px-3 pb-3 max-md:block max-md:px-0">
          <PcicInsuranceField value={rec.pcic} onChange={(next) => set('pcic', next)} subject="planting" />
        </td>
      </tr>
      {error && (
        <tr className="border-b border-[#F0F4F0] bg-rose-50/40 max-md:block max-md:-mt-2 max-md:mb-3 max-md:rounded-b-xl max-md:px-3 max-md:pb-2">
          <td className="max-md:hidden" />
          <td colSpan={colCount - 1} className="px-3 pb-2.5 -mt-1 text-[12px] text-rose-600 max-md:block max-md:px-0">{error}</td>
        </tr>
      )}
    </>
  )
}


// The table: header, rows and the sideways scroll. The page owns the records and says what a change or a removal does.
//   records, onUpdate(id, field, value), onRemove(id)
//   farmerId, farmerParcels, showParcelColumn, parcelLocked  (parcelLocked: every row is on one parcel, so there is no barangay column and the parcel cannot change)
//   areaErrors { [row._id]: message }, rowErrors { [row._id]: message }
export default function CropRecordsTable({
  records, cropTypes, seedSources, varieties, farmerId, farmerParcels = [], showParcelColumn = false, parcelLocked = false,
  areaErrors = {}, rowErrors = {}, onUpdate, onRemove,
}) {
  // A page locked to a parcel the farmer owns has no Crop Status (or Crop Owner) column: every crop there is the owner's own.
  const statusFixed = parcelLocked && statusFixedByParcels(farmerParcels)
  const showOwnerColumn = !statusFixed && records.some(r => needsLandOwner(r.land_status))
  const tableMinWidth = Object.entries(COL_WIDTH).reduce(
    (sum, [key, width]) => sum + (key === 'barangay' && parcelLocked ? 0 : key === 'landStatus' && statusFixed ? 0 : key === 'farmParcel' && !showParcelColumn ? 0 : key === 'cropOwner' && !showOwnerColumn ? 0 : width),
    0,
  )
  // The quantity heading's menu: every crop that can be planted either way follows the choice.
  const cropTypeOf = (rec) => cropTypes.find(c => String(c.id) === String(rec.crop_type))
  const switchableRecords = records.filter(r => canChoosePlanting(cropTypeOf(r)))
  const switchChoices = new Set(switchableRecords.map(r => materialFor(cropTypeOf(r), r.planting_material)))
  const switchChoice = switchChoices.size === 1 ? [...switchChoices][0] : ''
  const pickQuantityMaterial = (material) => switchableRecords.forEach(r => onUpdate(r._id, 'planting_material', material))

  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
      {/* min-width = the declared column widths: on a narrow screen the table scrolls sideways instead of squeezing every column
          (a squeezed column cut text off) */}
      <table className="table-fixed text-sm md:min-w-(--table-min) max-md:block max-md:w-full" style={{ '--table-min': `${tableMinWidth}px` }}>
        <thead className="bg-[#1B4D2E] text-white max-md:hidden">
          <tr>
            <th className={`${bulkThCenterClasses} overflow-hidden`} style={{ width: COL_WIDTH.index }}>#</th>
            {!parcelLocked && <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.barangay }}>Barangay <span className="text-white/70">*</span></th>}
            {!statusFixed && <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.landStatus }}>Crop Status <span className="text-white/70">*</span></th>}
            {showOwnerColumn && <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.cropOwner }}>Crop Owner <span className="text-white/70">*</span></th>}
            <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.cropType }}>Crop Type <span className="text-white/70">*</span></th>
            <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.datePlanted }}>Date Planted <span className="text-white/70">*</span></th>
            <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.area }}>Area (ha) <span className="text-white/70">*</span></th>
            <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.season }}>Season<OptBadge /></th>
            <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.variety }}>Variety <span className="text-white/70">*</span></th>
            <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.seedSource }}>Seed Source<OptBadge /></th>
            <th className={bulkThClasses} style={{ width: COL_WIDTH.qtySeeds }}>
              <QuantityHeader
                title={quantityHeader(records.map(r => ({ planting_material: materialFor(cropTypeOf(r), r.planting_material) })))}
                canSwitch={switchableRecords.length > 0} choice={switchChoice} onPick={pickQuantityMaterial} />
              <OptBadge />
            </th>
            {showParcelColumn && <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.farmParcel }}>Farm Parcel <span className="text-white/70">*</span></th>}
            <th className={bulkThCenterClasses} style={{ width: COL_WIDTH.remove }}></th>
          </tr>
        </thead>
        <tbody className="max-md:block">
          {records.map((rec, i) => (
            <CropRecordRow
              key={rec._id}
              rec={rec}
              index={i}
              total={records.length}
              cropTypes={cropTypes}
              seedSources={seedSources}
              varieties={varieties}
              farmerId={farmerId}
              showParcelColumn={showParcelColumn}
              showOwnerColumn={showOwnerColumn}
              statusFixed={statusFixed}
              farmerParcels={farmerParcels}
              parcelLocked={parcelLocked}
              error={rowErrors[rec._id]}
              areaError={areaErrors[rec._id]}
              onUpdate={onUpdate}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
