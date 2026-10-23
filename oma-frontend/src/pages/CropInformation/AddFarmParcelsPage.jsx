import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Plus, Trash2, Upload } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import FarmerSearchInput from '../../components/FarmerSearchInput.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BARANGAYS from '../../constants/barangays.js'
import Button from '../../components/UI/Button.jsx'
import { bulkCellInputClasses, bulkThCenterClasses, bulkThClasses } from '../../components/UI/bulkEntryStyles.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import IdNumberInput from '../../components/UI/IdNumberInput.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PcicInsuranceField from '../../components/UI/PcicInsuranceField.jsx'
import SegmentedIdInput from '../../components/UI/SegmentedIdInput.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { RSBSA_GROUPS } from '../../utils/idNumbers.js'
import { uploadPcicForm } from '../../utils/pcic.js'
import ParcelCropsImportModal from '../Farmers/ParcelCropsImportModal.jsx'
import {
  CROP_OPTIONS, CROPPING_SCHEDULE_OPTIONS, FARM_TYPE_OPTIONS, LAND_OWNERSHIP_OPTIONS, MACHINERY_OPTIONS, MAX_PARCELS, OWNERSHIP_OPTIONS,
  PERENNIAL_CROPS, SEED_SOURCE_OPTIONS, SEEDS_UNIT_OPTIONS, addImportedCrops, buildPayload, canSkipSchedule, cropAreaProblems, cropCapacity,
  cropLabel, cropsAreaUsed, fmtHa, isTenure, makeCropRow, makeMachineryRow, makeParcelRow, machineryLabel, pcicUploads, serverErrorsToMessages, toggleClassification, validateRows,
} from '../Farmers/parcelRows.js'
import useParcelClassifications from '../Farmers/useParcelClassifications.js'

// Add Farm Parcels (Crop Records > Add Farm Parcel, and the farmer profile's Add Farm Parcel button): pick a farmer, then add as many
// parcels as needed in a table, one row per parcel, with each parcel's crops and machinery in small tables under it. Everything is
// saved together or not at all (POST /farmers/<id>/parcels/bulk/), like the Add Crop Records page.

// Fixed pixel width per column, shared by every <th>/<td> of that column so header and body cannot drift apart.
const COL_WIDTH = { index: 44, number: 410, barangay: 160, area: 110, ownership: 130, taxDec: 230, farmType: 170, schedule: 170, remove: 56 }
const COLUMN_COUNT = 9

// Phone: every row becomes a card whose cells are labelled (the label comes from the cell's data-label).
const CELL = 'px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]'
const SUB_CELL = 'px-2 py-2 align-top max-md:block max-md:w-full! max-md:px-0 max-md:py-1 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]'
const SUB_TH = 'px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A] whitespace-nowrap'
const REMOVE_BTN = 'inline-flex items-center gap-1.5 rounded-md p-1.5 text-rose-500 hover:bg-rose-50 transition-colors max-md:min-h-[40px] max-md:px-3 max-md:text-[13px] max-md:font-medium'

// Region-Province-Municipality is fixed for every parcel in this LGU-only system (01-33-02 = Region I / La Union / Aringay);
// barangay code, section, block and lot are the only parts that vary per parcel.
const PARCEL_NUMBER_PARTS = [
  { type: 'text', value: '01-33-02-' },
  { type: 'input', key: 'barangay', length: 3, placeholder: '000' },
  { type: 'text', value: '-' },
  { type: 'input', key: 'section', length: 3, placeholder: '000' },
  { type: 'text', value: '-' },
  { type: 'input', key: 'block', length: 2, placeholder: '00' },
  { type: 'text', value: '-' },
  { type: 'input', key: 'lot', length: 3, placeholder: '000' },
]
// Tax Declaration Number: typed as digits with the dashes added for you, stopped at 18 digits (RR-MMM-BBBBB-YYYY-NNNN).
const TAX_DECLARATION_GROUPS = [2, 3, 5, 4]
const TAX_DECLARATION_DIGITS = 18

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

function CropsTable({ parcel, crops, onChange, onImport }) {
  const nextUid = useRef(1)
  const tooBig = cropAreaProblems(parcel)
  const parcelArea = Number(parcel.area_hectares) || 0
  const used = cropsAreaUsed(parcel)
  const over = parcelArea > 0 && used > cropCapacity(parcel)
  const update = (uid, patch) => onChange(crops.map((c) => (c._uid === uid ? { ...c, ...patch } : c)))
  const setMain = (uid, on) => onChange(crops.map((c) => ({ ...c, is_main_crop: c._uid === uid ? on : (on ? false : c.is_main_crop) })))
  const add = () => onChange([...crops, makeCropRow(Date.now() + nextUid.current++)])
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Crops grown <span className="font-normal normal-case text-[#7A8E7A]">(optional) — what grows on this land; a season's planting is recorded in Crop Monitoring</span></p>
        <div className="flex flex-wrap items-center gap-2">
          {parcelArea > 0 && crops.length > 0 && (
            <p role="status" className={`mr-1 text-[12px] font-semibold ${over ? 'text-rose-600' : 'text-[#4A5E4A]'}`}>
              {fmtHa(used)} of {fmtHa(cropCapacity(parcel))} ha used
              {cropCapacity(parcel) > parcelArea && <span className="font-normal text-[#7A8E7A]"> ({parcel.cropping_schedule.toLowerCase()})</span>}
              {over && ' — too much for this parcel'}
            </p>
          )}
          <button type="button" onClick={onImport} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#1B4D2E]/30 bg-[#EBF5EE]/50 px-3 text-[12px] font-semibold text-[#1B4D2E] hover:bg-[#EBF5EE]">
            <Upload size={13} aria-hidden="true" /> Import crops
          </button>
          <button type="button" onClick={add} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3 text-[12px] font-semibold text-white hover:bg-[#235E38]">
            <Plus size={13} aria-hidden="true" /> Add crop
          </button>
        </div>
      </div>
      {crops.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[#E2E8E2] bg-white max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <table className="min-w-full table-fixed text-sm max-md:block">
            <thead className="bg-[#EBF5EE] max-md:hidden">
              <tr>
                <th className={SUB_TH} style={{ width: 210 }}>Crop <span className="text-rose-500">*</span></th>
                <th className={SUB_TH} style={{ width: 110 }}>Area (ha) <span className="text-rose-500">*</span></th>
                <th className={SUB_TH} style={{ width: 160 }}>Variety</th>
                <th className={SUB_TH} style={{ width: 160 }}>Seed source</th>
                <th className={SUB_TH} style={{ width: 100 }}>Qty of seeds</th>
                <th className={SUB_TH} style={{ width: 90 }}>Unit</th>
                <th className={SUB_TH} style={{ width: 90 }}>Trees</th>
                <th className={SUB_TH} style={{ width: 70 }}>Main</th>
                <th style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody className="max-md:block">
              {crops.map((c, i) => (
                <CropRow key={c._uid} crop={c} index={i} areaProblem={tooBig[i]} onUpdate={update} onMain={setMain} onRemove={(uid) => onChange(crops.filter((x) => x._uid !== uid))} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CropRow({ crop, index, areaProblem, onUpdate, onMain, onRemove }) {
  const set = (patch) => onUpdate(crop._uid, patch)
  const tree = PERENNIAL_CROPS.includes(crop.crop_name)
  return (
    <>
      <tr className="border-b border-[#F0F4F0] align-top max-md:block max-md:mb-2 max-md:rounded-xl max-md:border max-md:border-[#E2E8E2] max-md:bg-white max-md:p-3">
        <td data-label={`Crop ${index + 1} *`} className={SUB_CELL} style={{ width: 210 }}>
          <ComboboxWithOther options={CROP_OPTIONS.filter((o) => o !== 'Other')} value={crop.crop_name} otherValue={crop.crop_name_other}
            placeholder="Select crop…" inputClassName={bulkCellInputClasses} chevronSize={13}
            onChange={(v) => set({ crop_name: v })} onOtherChange={(v) => set({ crop_name_other: v })} />
        </td>
        <td data-label="Area (ha) *" className={SUB_CELL} style={{ width: 110 }}>
          <DecimalInput decimals={4} className={`${bulkCellInputClasses}${areaProblem ? ' border-rose-500! bg-rose-50!' : ''}`} placeholder="0.00" value={crop.area_hectares}
            title={areaProblem ? areaProblem.charAt(0).toUpperCase() + areaProblem.slice(1) : undefined} aria-invalid={areaProblem ? true : undefined} onChange={(v) => set({ area_hectares: v })} />
        </td>
        <td data-label="Variety" className={SUB_CELL} style={{ width: 160 }}>
          <input className={bulkCellInputClasses} placeholder="e.g. NSIC Rc 222" value={crop.variety_used} onChange={(e) => set({ variety_used: e.target.value })} />
        </td>
        <td data-label="Seed source" className={SUB_CELL} style={{ width: 160 }}>
          <select className={bulkCellInputClasses} value={crop.seed_source} onChange={(e) => set({ seed_source: e.target.value })}>
            {SEED_SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
        <td data-label="Qty of seeds" className={SUB_CELL} style={{ width: 100 }}>
          <DecimalInput decimals={2} className={bulkCellInputClasses} placeholder="0" value={crop.quantity_of_seeds_used} onChange={(v) => set({ quantity_of_seeds_used: v })} />
        </td>
        <td data-label="Unit" className={SUB_CELL} style={{ width: 90 }}>
          <select className={bulkCellInputClasses} value={crop.seeds_unit} onChange={(e) => set({ seeds_unit: e.target.value })}>
            {SEEDS_UNIT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
        <td data-label="Trees" className={SUB_CELL} style={{ width: 90 }}>
          <input type="number" min="0" className={`${bulkCellInputClasses} disabled:bg-[#F5F7F5]`} disabled={!tree} placeholder={tree ? '0' : '—'}
            title={tree ? undefined : 'Only for tree crops'} value={tree ? crop.number_of_trees : ''} onChange={(e) => set({ number_of_trees: e.target.value })} />
        </td>
        <td data-label="Main crop" className={`${SUB_CELL} text-center`} style={{ width: 70 }}>
          <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" aria-label="Main crop" checked={crop.is_main_crop} onChange={(e) => onMain(crop._uid, e.target.checked)} />
        </td>
        <td className="px-2 py-2 text-center max-md:block max-md:w-full! max-md:px-0 max-md:py-1 max-md:text-right" style={{ width: 56 }}>
          <button type="button" onClick={() => onRemove(crop._uid)} title="Remove crop" className={REMOVE_BTN}><Trash2 size={13} /><span className="md:hidden">Remove crop</span></button>
        </td>
      </tr>
      <tr className="border-b border-[#F0F4F0] max-md:block">
        <td colSpan={9} className="px-2 pb-2 max-md:block max-md:px-0">
          <PcicInsuranceField value={crop.pcic} onChange={(pcic) => set({ pcic })} subject="crop" />
        </td>
      </tr>
    </>
  )
}

// ── the machinery of one parcel ───────────────────────────────────────────────

function MachineryTable({ machinery, onChange }) {
  const nextUid = useRef(1)
  const update = (uid, patch) => onChange(machinery.map((m) => (m._uid === uid ? { ...m, ...patch } : m)))
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Agricultural machinery <span className="font-normal normal-case text-[#7A8E7A]">(optional) — equipment used on this parcel</span></p>
        <button type="button" onClick={() => onChange([...machinery, makeMachineryRow(Date.now() + nextUid.current++)])}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#1B4D2E]/30 bg-[#EBF5EE]/50 px-3 text-[12px] font-semibold text-[#1B4D2E] hover:bg-[#EBF5EE]">
          <Plus size={13} aria-hidden="true" /> Add machinery
        </button>
      </div>
      {machinery.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[#E2E8E2] bg-white max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <table className="min-w-full table-fixed text-sm max-md:block">
            <thead className="bg-[#EBF5EE] max-md:hidden">
              <tr>
                <th className={SUB_TH} style={{ width: 230 }}>Machinery <span className="text-rose-500">*</span></th>
                <th className={SUB_TH} style={{ width: 100 }}>Quantity <span className="text-rose-500">*</span></th>
                <th className={SUB_TH} style={{ width: 190 }}>Equipment ownership</th>
                <th style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody className="max-md:block">
              {machinery.map((m, i) => (
                <tr key={m._uid} className="border-b border-[#F0F4F0] align-top max-md:block max-md:mb-2 max-md:rounded-xl max-md:border max-md:border-[#E2E8E2] max-md:bg-white max-md:p-3">
                  <td data-label={`Machinery ${i + 1} *`} className={SUB_CELL} style={{ width: 230 }}>
                    <ComboboxWithOther options={MACHINERY_OPTIONS.filter((o) => o !== 'Other')} value={m.machinery_type} otherValue={m.machinery_type_other}
                      placeholder="Select machinery…" inputClassName={bulkCellInputClasses} chevronSize={13}
                      onChange={(v) => update(m._uid, { machinery_type: v })} onOtherChange={(v) => update(m._uid, { machinery_type_other: v })} />
                  </td>
                  <td data-label="Quantity *" className={SUB_CELL} style={{ width: 100 }}>
                    <input type="number" min="1" className={bulkCellInputClasses} value={m.quantity} onChange={(e) => update(m._uid, { quantity: e.target.value })} />
                  </td>
                  <td data-label="Equipment ownership (who owns it, not the land)" className={SUB_CELL} style={{ width: 190 }}>
                    <select className={bulkCellInputClasses} value={m.ownership} onChange={(e) => update(m._uid, { ownership: e.target.value })}>
                      {OWNERSHIP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-center max-md:block max-md:w-full! max-md:px-0 max-md:py-1 max-md:text-right" style={{ width: 56 }}>
                    <button type="button" onClick={() => onChange(machinery.filter((x) => x._uid !== m._uid))} title="Remove machinery" className={REMOVE_BTN}>
                      <Trash2 size={13} /><span className="md:hidden">Remove machinery</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── one parcel: its table row, then a row with its classifications, crops and machinery ───────────────────────────────

function ParcelRow({ row, index, total, offered, panelWidth, error, onUpdate, onRemove, onImportCrops }) {
  const set = (field, value) => onUpdate(row._id, { [field]: value })
  const taxDecFilled = Boolean((row.tax_declaration_number || '').trim())
  const skipSchedule = canSkipSchedule(row)
  return (
    <>
      <tr className={`border-b border-[#F0F4F0] align-top max-md:block max-md:mb-3 max-md:rounded-xl max-md:border max-md:border-[#E2E8E2] max-md:p-3 ${error ? 'bg-rose-50/40' : 'max-md:bg-white'}`}>
        <td data-label="Parcel" className={`${CELL} text-center text-[13px] text-[#7A8E7A] max-md:text-left`} style={{ width: COL_WIDTH.index }}>{index + 1}</td>
        <td data-label={`Parcel number${taxDecFilled ? ' *' : ''}`} className={`${CELL} overflow-visible`} style={{ width: COL_WIDTH.number }}>
          <SegmentedIdInput parts={PARCEL_NUMBER_PARTS} value={row.parcel_number} onChange={(v) => set('parcel_number', v)} />
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
        <td data-label="Land ownership" className={CELL} style={{ width: COL_WIDTH.ownership }}>
          <select className={bulkCellInputClasses} value={row.land_ownership}
            onChange={(e) => {
              const next = e.target.value
              onUpdate(row._id, isTenure(next) ? { land_ownership: next } : { land_ownership: next, land_owner_name: '', land_owner_rsbsa_number: '' })
            }}>
            {LAND_OWNERSHIP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
        <td data-label="Tax Dec number" className={`${CELL} overflow-visible`} style={{ width: COL_WIDTH.taxDec }}>
          <IdNumberInput groups={TAX_DECLARATION_GROUPS} maxDigits={TAX_DECLARATION_DIGITS} value={row.tax_declaration_number}
            placeholder="01-002-00005-2023-0142" onChange={(v) => set('tax_declaration_number', v)} />
        </td>
        <td data-label="Farm type" className={CELL} style={{ width: COL_WIDTH.farmType }}>
          <select className={bulkCellInputClasses} value={row.farm_type} onChange={(e) => set('farm_type', e.target.value)}>
            <option value="">Select type…</option>
            {FARM_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
        <td data-label="Cropping schedule" className={CELL} style={{ width: COL_WIDTH.schedule }}>
          <select className={`${bulkCellInputClasses} disabled:bg-[#F5F7F5]`} value={skipSchedule ? '' : row.cropping_schedule} disabled={skipSchedule}
            title={skipSchedule ? 'Not applicable: the main crop is a perennial (tree) crop' : undefined}
            onChange={(e) => set('cropping_schedule', e.target.value)}>
            <option value="">{skipSchedule ? 'Not applicable' : 'Select schedule…'}</option>
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
            <CropsTable parcel={row} crops={row.crops} onChange={(crops) => set('crops', crops)} onImport={() => onImportCrops(row._id)} />
            <MachineryTable machinery={row.machinery} onChange={(machinery) => set('machinery', machinery)} />
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

function ConfirmModal({ rows, farmerName, isSubmitting, onConfirm, onCancel }) {
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
                      row.crops.length ? row.crops.map(cropLabel).join(', ') : 'No crops',
                      row.machinery.length ? row.machinery.map(machineryLabel).join(', ') : 'No machinery',
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
  const startFarmerId = searchParams.get('farmer')
  const classifications = useParcelClassifications()
  const offered = (classifications || []).map((c) => c.name)

  const [farmerInfo, setFarmerInfo] = useState(NO_FARMER)
  const [existing, setExisting] = useState(null)               // the farmer's parcels already on file
  const nextIdRef = useRef(2)
  const [rows, setRows] = useState([makeParcelRow(1)])
  const [importingFor, setImportingFor] = useState(null)
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
  }, [startFarmerId, showToast])

  // The parcels the farmer already has, so the page can say so (the server refuses a repeated parcel number).
  useEffect(() => {
    if (!farmerInfo.farmer_id) return undefined
    let alive = true
    api.get(`/farmers/${farmerInfo.farmer_id}/parcels/`)
      .then((r) => { if (alive) setExisting({ farmerId: farmerInfo.farmer_id, list: Array.isArray(r.data) ? r.data : (r.data.results || []) }) })
      .catch(() => { if (alive) setExisting(null) })
    return () => { alive = false }
  }, [farmerInfo.farmer_id])
  const existingList = existing && existing.farmerId === farmerInfo.farmer_id ? existing.list : null

  const goBack = () => navigate(farmerInfo.farmer_id && startFarmerId ? `/farmers/${farmerInfo.farmer_id}` : '/crop-records')

  const addRow = () => {
    if (rows.length >= MAX_PARCELS) { setError(`You can add at most ${MAX_PARCELS} parcels at a time.`); return }
    setRows((rs) => [...rs, makeParcelRow(nextIdRef.current++)])
  }
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r._id !== id))
  const updateRow = (id, patch) => setRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...patch } : r)))

  const importCrops = (crops) => {
    setRows((rs) => rs.map((r) => (r._id === importingFor ? { ...r, crops: addImportedCrops(r.crops, crops, Date.now()) } : r)))
    setImportingFor(null)
  }

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
      const { data: created } = await api.post(`/farmers/${farmerInfo.farmer_id}/parcels/bulk/`, buildPayload(rows))
      const photoFailures = []
      for (const upload of pcicUploads(rows, created)) {
        try {
          await uploadPcicForm(api, 'crop', upload.cropId, upload.pcic)
        } catch {
          photoFailures.push(upload.label)
        }
      }
      setShowConfirm(false)
      if (photoFailures.length) showToast(`Saved, but the PCIC form photo could not be uploaded for: ${photoFailures.join(', ')}. Add it later from the farmer's profile.`, 'error')
      showToast(`${rows.length} farm parcel${rows.length > 1 ? 's' : ''} added.`, 'success')
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
    <PageLayout title="Add Farm Parcels" subtitle="Each row is one farm parcel. Add as many as the farmer has, with the crops and machinery on each.">
      <button type="button" onClick={goBack} className="mb-4 inline-flex items-center gap-1 text-[13px] text-[#1B4D2E] hover:underline max-md:min-h-[40px]">
        <ArrowLeft size={14} /> {farmerInfo.farmer_id && startFarmerId ? 'Back to the farmer’s profile' : 'Back to Crop Records'}
      </button>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Legend />

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-3">Farmer Information</p>
          <div className="max-w-xl">
            <FarmerSearchInput onSelect={setFarmerInfo} selected={farmerInfo} />
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
            parcel prevents all of them from saving. Have many parcels in a file? Use <span className="font-semibold">Import Farm Parcels</span> on the farmer’s profile.
          </p>
        </div>

        <div ref={tableRef} className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <table className="table-fixed text-sm max-md:block max-md:w-full">
            <thead className="bg-[#1B4D2E] text-white max-md:hidden">
              <tr>
                <th className={`${bulkThCenterClasses} overflow-hidden`} style={{ width: COL_WIDTH.index }}>#</th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.number }}>Parcel Number<Opt /></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.barangay }}>Barangay <span className="text-white/70">*</span></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.area }}>Area (ha) <span className="text-white/70">*</span></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.ownership }}>Land Ownership</th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.taxDec }}>Tax Dec No.<Opt /></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.farmType }}>Farm Type<Opt /></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.schedule }}>Cropping Schedule<Opt /></th>
                <th className={bulkThCenterClasses} style={{ width: COL_WIDTH.remove }} />
              </tr>
            </thead>
            <tbody className="max-md:block">
              {rows.map((row, i) => (
                <ParcelRow key={row._id} row={row} index={i} total={rows.length} offered={offered} panelWidth={panelWidth} error={rowErrors[row._id]}
                  onUpdate={updateRow} onRemove={removeRow} onImportCrops={setImportingFor} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors">
            <Plus size={14} /> Add Row
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

      {importingFor !== null && <ParcelCropsImportModal onClose={() => setImportingFor(null)} onCrops={importCrops} />}

      {showConfirm && (
        <ConfirmModal rows={rows} farmerName={farmerInfo.farmer_full_name} isSubmitting={isSubmitting} onConfirm={handleConfirmed} onCancel={() => setShowConfirm(false)} />
      )}
    </PageLayout>
  )
}
