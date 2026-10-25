// The selection behind the Log Disaster form (Crop Disaster > Log Disaster): which crops a disaster hit, how much of each, and which are a
// total loss. Pure functions - no screen, no network - so the rules can be tested on their own. disasterTargets.js decides what the table
// shows; the server checks everything again.
import { toRows, withAllTotal } from './multiCropDisaster.js'

export const cropLabel = (r) => `${r.crop_type_name || 'Crop'}${r.season ? ` · ${r.season} ${r.year}` : ''}${r.date_planted ? ` — planted ${r.date_planted}` : ''}`

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

// "Total loss" on a set of crops: every one of them becomes affected over its whole planted area and a total loss; switching it
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

export function counts(selection) {
  const rows = Object.values(selection)
  return { crops: rows.length, total: rows.filter((r) => r.total).length }
}
