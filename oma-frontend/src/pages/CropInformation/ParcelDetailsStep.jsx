import { Plus, Trash2, Upload } from 'lucide-react'
import FarmerSearchInput from '../../components/FarmerSearchInput.jsx'
import BARANGAYS from '../../constants/barangays.js'
import Button from '../../components/UI/Button.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection, FormValue } from '../../components/UI/FormTable.jsx'
import IdNumberInput from '../../components/UI/IdNumberInput.jsx'
import { RSBSA_GROUPS } from '../../utils/idNumbers.js'
import {
  CROPPING_SCHEDULE_OPTIONS, FARM_TYPE_OPTIONS, LAND_OWNERSHIP_OPTIONS, PARCEL_NUMBER_DIGITS, PARCEL_NUMBER_GROUPS, PARCEL_NUMBER_PLACEHOLDER,
  TAX_DECLARATION_DIGITS, TAX_DECLARATION_GROUPS, isTenure, toggleClassification,
} from '../Farmers/parcelRows.js'
import { parcelHeading } from './parcelWizard.js'

// Step 1 of Add Farm Parcels: the farmer, then one table form per parcel (the same layout as the Edit Farm Parcel window).

function ParcelForm({ row, index, total, offered, error, onUpdate, onRemove }) {
  const set = (field, value) => onUpdate(row._id, { [field]: value })
  const tenure = isTenure(row.land_ownership)
  const name = `Parcel ${index + 1}`
  return (
    <div data-has-error={error ? 'true' : undefined} data-testid="parcel-form">
      <FormSection title={parcelHeading(row, index)}>
        {error && <p role="alert" className="border-b border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>}
        <FormRows label={`${name} details`}>
          <FormRow>
            <FormCell label="Parcel Number" required>
              <IdNumberInput groups={PARCEL_NUMBER_GROUPS} maxDigits={PARCEL_NUMBER_DIGITS} value={row.parcel_number}
                placeholder={PARCEL_NUMBER_PLACEHOLDER} onChange={(v) => set('parcel_number', v)} />
            </FormCell>
            <FormCell label="Barangay" required>
              <select className={baseInputClasses} value={row.barangay} aria-label={`${name} barangay`} onChange={(e) => set('barangay', e.target.value)}>
                <option value="" disabled>Select…</option>
                {BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Area (ha)" required>
              <DecimalInput decimals={2} className={baseInputClasses} placeholder="0.00" value={row.area_hectares} aria-label={`${name} area in hectares`}
                onChange={(v) => set('area_hectares', v)} />
            </FormCell>
            <FormCell label="Land Ownership" required>
              <select className={baseInputClasses} value={row.land_ownership} aria-label={`${name} land ownership`}
                onChange={(e) => {
                  const next = e.target.value
                  onUpdate(row._id, isTenure(next) ? { land_ownership: next } : { land_ownership: next, land_owner_name: '', land_owner_rsbsa_number: '' })
                }}>
                <option value="" disabled>Select…</option>
                {LAND_OWNERSHIP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormCell>
          </FormRow>
          {tenure && (
            <FormRow>
              <FormCell label="Land Owner Name" required>
                <input className={baseInputClasses} value={row.land_owner_name} placeholder="Full name of the land owner" aria-label={`${name} land owner name`}
                  onChange={(e) => set('land_owner_name', e.target.value)} />
              </FormCell>
              <FormCell label="Land Owner RSBSA Number">
                <IdNumberInput groups={RSBSA_GROUPS} value={row.land_owner_rsbsa_number} placeholder="01-33-02-014-058212"
                  onChange={(v) => set('land_owner_rsbsa_number', v)} />
              </FormCell>
            </FormRow>
          )}
          <FormRow>
            <FormCell label="Farm Type" required>
              <select className={baseInputClasses} value={row.farm_type} aria-label={`${name} farm type`} onChange={(e) => set('farm_type', e.target.value)}>
                <option value="">Select type…</option>
                {FARM_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormCell>
            <FormCell label="Cropping Schedule" required>
              <select className={baseInputClasses} value={row.cropping_schedule} aria-label={`${name} cropping schedule`}
                onChange={(e) => set('cropping_schedule', e.target.value)}>
                <option value="">Select schedule…</option>
                {CROPPING_SCHEDULE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormCell>
          </FormRow>
          {!tenure && (
            <FormRow>
              <FormCell label="Tax Dec No." wide>
                <div className="md:max-w-[26rem]">
                  <IdNumberInput groups={TAX_DECLARATION_GROUPS} maxDigits={TAX_DECLARATION_DIGITS} value={row.tax_declaration_number}
                    placeholder="01-002-00005-2023-0142" onChange={(v) => set('tax_declaration_number', v)} />
                </div>
              </FormCell>
            </FormRow>
          )}
          <FormRow>
            <FormCell label="Classifications" wide>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {offered.map((option) => (
                  <label key={option} className="flex min-h-[36px] cursor-pointer items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={row.classifications.includes(option)}
                      onChange={(e) => set('classifications', toggleClassification(row.classifications, option, e.target.checked))} />
                    <span className="text-[13px] text-[#1A2B1A]">{option}</span>
                  </label>
                ))}
                {offered.length === 0 && <p className="py-1 text-[12px] text-[#7A8E7A]">None set up. An Admin can add them in Classification Settings.</p>}
              </div>
            </FormCell>
          </FormRow>
        </FormRows>
        {total > 1 && (
          <div className="flex justify-end border-t border-[#F0F4F0] px-3 py-2">
            <button type="button" onClick={() => onRemove(row._id)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-rose-600 transition-colors hover:bg-rose-50">
              <Trash2 size={13} aria-hidden="true" /> Remove parcel {index + 1}
            </button>
          </div>
        )}
      </FormSection>
    </div>
  )
}

export default function ParcelDetailsStep({
  farmerInfo, farmerLocked, onSelectFarmer, existingList, onImportParcels, rows, offered, rowErrors, onUpdate, onRemove, onAdd,
}) {
  return (
    <div className="space-y-3">
      <FormSection title="Farmer">
        <div className="space-y-3 p-3">
          {farmerLocked ? (
            <FormValue>{farmerInfo.farmer_full_name}</FormValue>
          ) : (
            <div className="max-w-xl">
              <FarmerSearchInput onSelect={onSelectFarmer} selected={farmerInfo} />
            </div>
          )}
          {farmerInfo.farmer_id && (
            <p className="text-[12.5px] text-[#4A5E4A]">
              Home barangay: <span className="font-medium text-[#1A2B1A]">{farmerInfo.farmer_home_barangay || '—'}</span>
              <span className="mx-2 text-[#C8D5C8]" aria-hidden="true">|</span>
              Parcels on file: <span className="font-medium text-[#1A2B1A]">
                {existingList === null ? '…' : existingList.length === 0 ? 'None yet' : `${existingList.length} (${existingList.map((p) => p.parcel_number || 'no number').join(', ')})`}
              </span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button type="button" onClick={onImportParcels} disabled={!farmerInfo.farmer_id} title={farmerInfo.farmer_id ? undefined : 'Choose the farmer first'} variant="outline" size="sm">
              <Upload size={13} aria-hidden="true" /> Import Farm Parcels
            </Button>
            <p className="text-[11.5px] text-[#7A8E7A]">
              {farmerInfo.farmer_id ? 'Many parcels in a spreadsheet? Import checks the file first and saves them straight to this farmer.' : 'Choose the farmer first, then you can also import their parcels from a spreadsheet.'}
            </p>
          </div>
        </div>
      </FormSection>

      {rows.map((row, i) => (
        <ParcelForm key={row._id} row={row} index={i} total={rows.length} offered={offered} error={rowErrors[row._id]} onUpdate={onUpdate} onRemove={onRemove} />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onAdd} variant="outline">
          <Plus size={14} aria-hidden="true" /> Add another parcel
        </Button>
        <span className="text-[12.5px] text-[#7A8E7A]">{rows.length} parcel{rows.length === 1 ? '' : 's'}</span>
      </div>
    </div>
  )
}
