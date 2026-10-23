// The bigger Log Disaster form (Crop Disaster > Log Disaster): one disaster event over the crops of SEVERAL farmers. Pure functions - no
// screen, no network - for what is shown (each farmer's growing crops grouped by parcel) and for the selection (which crops are
// affected, how much of each, which are a total loss), so the rules can be tested on their own. The server checks everything again.
import { toRows, withAllTotal } from './multiCropDisaster.js'

// Only a crop that is still in the field can be hit by a disaster.
export const GROWING = ['Planted', 'Near Harvest']
export const growingRecords = (records) => (records || []).filter((r) => GROWING.includes(r.status))

export const NO_PARCEL_KEY = 'none'

export const cropLabel = (r) => `${r.crop_type_name || 'Crop'}${r.season ? ` · ${r.season} ${r.year}` : ''}${r.date_planted ? ` — planted ${r.date_planted}` : ''}`

// A farmer's growing crops grouped by the parcel they are on: [{ key, parcelId, label, records }], parcels by number, crops with no
// parcel on file last. Each record gets the `label` the selection rows show.
export function groupByParcel(records) {
  const groups = new Map()
  growingRecords(records).forEach((r) => {
    const key = r.farm_parcel ? String(r.farm_parcel) : NO_PARCEL_KEY
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        parcelId: r.farm_parcel || null,
        label: r.farm_parcel ? (r.parcel_number ? `Parcel ${r.parcel_number}` : `Parcel #${r.farm_parcel}`) : 'No parcel on file',
        records: [],
      })
    }
    groups.get(key).records.push({ ...r, label: cropLabel(r) })
  })
  return [...groups.values()].sort((a, b) => {
    if (a.parcelId === null) return 1
    if (b.parcelId === null) return -1
    return a.label.localeCompare(b.label, undefined, { numeric: true })
  })
}

// ── the selection: { [recordId]: row } where a row is what multiCropDisaster.js works with (id, label, plantedHa, area, total)
export const isSelected = (selection, record) => Object.prototype.hasOwnProperty.call(selection, record.id)

export function selectCrop(selection, record, on) {
  const next = { ...selection }
  if (!on) { delete next[record.id]; return next }
  if (!isSelected(next, record)) next[record.id] = toRows([record])[0]
  return next
}

export function selectMany(selection, records, on) {
  return records.reduce((current, record) => selectCrop(current, record, on), selection)
}

export const allSelected = (selection, records) => records.length > 0 && records.every((r) => isSelected(selection, r))
export const allTotal = (selection, records) => records.length > 0 && records.every((r) => isSelected(selection, r) && selection[r.id].total)

// "All total loss" on a set of crops: every one of them becomes affected over its whole planted area and a total loss; switching it
// off only clears the total-loss marks (the crops stay selected, the areas stay as they are).
export function markTotal(selection, records, on) {
  if (!on) {
    const next = { ...selection }
    records.forEach((r) => { if (isSelected(next, r)) next[r.id] = { ...next[r.id], total: false } })
    return next
  }
  const next = selectMany(selection, records, true)
  const rows = withAllTotal(records.map((r) => next[r.id]), true)
  records.forEach((r, i) => { next[r.id] = rows[i] })
  return next
}

export const updateRow = (selection, id, change) => (selection[id] ? { ...selection, [id]: change(selection[id]) } : selection)

// Crops dropped from the selection when their farmer is taken off the form.
export function dropRecords(selection, records) {
  const gone = new Set(records.map((r) => r.id))
  return Object.fromEntries(Object.entries(selection).filter(([id]) => !gone.has(Number(id))))
}

export function counts(selection) {
  const rows = Object.values(selection)
  return { crops: rows.length, total: rows.filter((r) => r.total).length }
}

// The selected rows in the order the farmers and their crops are shown (what is sent), and the records they came from.
export function orderedSelection(selection, farmerGroups) {
  const rows = []
  const records = []
  farmerGroups.forEach((groups) => groups.forEach((group) => group.records.forEach((r) => {
    if (isSelected(selection, r)) { rows.push(selection[r.id]); records.push(r) }
  })))
  return { rows, records }
}

export function farmerLine(count, farmers) {
  if (!count) return 'No crops selected'
  return `${count} crop${count === 1 ? '' : 's'} of ${farmers} farmer${farmers === 1 ? '' : 's'} selected`
}
