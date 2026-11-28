// The rules of the Add Farm Parcels window (AddFarmParcelsWindow.jsx): its three steps, which step a problem belongs to, what the
// Review step lists, and the address that opens the window. No screen and no network.
import { isTenure, validateDetails, validateRows } from '../Farmers/parcelRows.js'

export const WIZARD_STEPS = [
  { key: 'parcels', label: 'Parcel Details' },
  { key: 'crops', label: 'Add Crops' },
  { key: 'review', label: 'Review and Save' },
]

// Before saving: { step, problems } for the first step that still has something to fix, or null.
export function firstProblem(rows, onFile) {
  const details = validateDetails(rows, onFile)
  if (Object.keys(details).length) return { step: 'parcels', problems: details }
  const all = validateRows(rows, onFile)
  return Object.keys(all).length ? { step: 'crops', problems: all } : null
}

// The server's `errors` has one entry per parcel: {} or {field: [...]}. Anything other than a crop is fixed on Parcel Details.
export function serverErrorStep(errors) {
  const parcelField = (errors || []).some((entry) => Object.keys(entry || {}).some((key) => key !== 'crop_records' && key !== 'crops'))
  return parcelField ? 'parcels' : 'crops'
}

export const parcelHeading = (row, index) =>
  [`Parcel ${index + 1}`, row.parcel_number, row.barangay, Number(row.area_hectares) > 0 ? `${row.area_hectares} ha` : ''].filter(Boolean).join(' · ')

function cropLine(record, cropTypes) {
  const name = cropTypes.find((c) => String(c.id) === String(record.crop_type))?.name || 'Crop'
  return `${name} — ${record.area_planted_ha} ha, planted ${record.date_planted}`
}

// One line of the Review step's table per parcel.
export const reviewRows = (rows, cropTypes) => rows.map((row) => ({
  id: row._id,
  number: row.parcel_number,
  barangay: row.barangay,
  area: row.area_hectares,
  ownership: isTenure(row.land_ownership) ? `${row.land_ownership} (owner: ${row.land_owner_name})` : row.land_ownership,
  taxDec: isTenure(row.land_ownership) ? '' : row.tax_declaration_number || '—',     // '' = no line: Owner parcels only
  farmType: row.farm_type,
  schedule: row.cropping_schedule,
  classifications: (row.classifications || []).join(', ') || '—',
  crops: (row.crop_records || []).map((r) => cropLine(r, cropTypes)),
}))

export { readAddParcels, openAddParcelsParams, closeAddParcelsParams, addParcelsAddress } from '../../utils/parcelWindowAddress.js'
