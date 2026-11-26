import { Plus, Upload } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import { FormSection } from '../../components/UI/FormTable.jsx'
import CropRecordsTable from '../Monitoring/CropRecordsTable.jsx'
import { areaProblem } from './cropEntry.js'
import { parcelHeading } from './parcelWizard.js'

// Step 2 of Add Farm Parcels: the crops grown on each parcel - the Add Crop Records form itself (same fields, same rules), with the
// parcel as the place. Each crop is saved as a crop record on the parcel when the parcel is saved. Crops are optional.

function ParcelCrops({ row, index, error, lookups, onAdd, onImport, onUpdate, onRemove }) {
  const records = (row.crop_records || []).map((r) => ({ ...r, farm_parcel: String(row._id), farm_location_barangay: row.barangay }))
  const parcelArea = Number(row.area_hectares) || 0
  const parcels = [{ id: row._id, area_hectares: row.area_hectares, growing_area_ha: 0 }]
  const areaErrors = Object.fromEntries(records.map((r, i) => [r._id, areaProblem(records, i, parcels)]))
  const used = Math.round(records.reduce((sum, r) => sum + (Number(r.area_planted_ha) || 0), 0) * 100) / 100
  const over = parcelArea > 0 && used > parcelArea
  const knownParcel = { id: row._id, land_ownership: row.land_ownership, land_owner_name: row.land_owner_name, barangay: row.barangay }
  return (
    <div data-has-error={error ? 'true' : undefined} data-testid="parcel-crops">
      <FormSection title={parcelHeading(row, index)}>
        {error && <p role="alert" className="border-b border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>}
        <div className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className={`text-[12.5px] ${over ? 'font-semibold text-rose-600' : 'text-[#4A5E4A]'}`}>
              {records.length === 0
                ? 'No crops added.'
                : `${used} of ${parcelArea} ha planted${over ? ' — too much for this parcel' : ''}`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => onImport(row._id)} variant="outline" size="sm">
                <Upload size={13} aria-hidden="true" /> Import crops
              </Button>
              <Button type="button" onClick={() => onAdd(row._id, knownParcel)} variant="primary" size="sm">
                <Plus size={13} aria-hidden="true" /> Add crop
              </Button>
            </div>
          </div>
          {records.length > 0 && (
            <div className="mt-3">
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
            </div>
          )}
        </div>
      </FormSection>
    </div>
  )
}

export default function ParcelCropsStep({ rows, rowErrors, lookups, onAdd, onImport, onUpdate, onRemove }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[#4A5E4A]">
        Add what is planted on each parcel. Crops are <span className="font-semibold">optional</span>: continue without them if there are none yet.
      </p>
      {rows.map((row, i) => (
        <ParcelCrops key={row._id} row={row} index={i} error={rowErrors[row._id]} lookups={lookups}
          onAdd={onAdd} onImport={onImport} onUpdate={onUpdate} onRemove={onRemove} />
      ))}
    </div>
  )
}
