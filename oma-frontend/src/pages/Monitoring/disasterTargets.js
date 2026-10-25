// The full-screen Log Disaster form (Crop Disaster > Log Disaster): a table of every parcel that has crops still in the field, to tick
// the ones a disaster hit. Pure functions - no screen, no network - for what the table shows (search, filters, the list / per farmer /
// per barangay views, the page) and for what is ticked, so the rules can be tested on their own. The selection itself (which crops,
// how much of each, which are a total loss) is the one in disasterEvent.js. The server checks everything again.
import { cropLabel } from './disasterEvent.js'

export const VIEW_MODES = [
  { id: 'list', label: 'List' },
  { id: 'farmer', label: 'By farmer' },
  { id: 'barangay', label: 'By barangay' },
]
export const PAGE_SIZE = 25

export const parcelTitle = (p) => (p.parcel_id ? (p.parcel_number ? `Parcel ${p.parcel_number}` : `Parcel #${p.parcel_id}`) : 'No parcel on file')

// The parcels as the server sent them (GET /production/disasters/targets/), each with its title, and each crop with the label the
// selection rows show and its farmer.
export const prepareParcels = (parcels) => (parcels || []).map((p) => ({
  ...p,
  title: parcelTitle(p),
  crops: (p.crops || []).map((c) => ({ ...c, farmer: p.farmer_id, label: cropLabel(c) })),
}))

const text = (p) => [p.farmer_name, p.rsbsa_number, p.parcel_number, p.title, p.barangay, ...p.crops.map((c) => c.crop_type_name)].join(' ').toLowerCase()

// What is left after the search (every word has to appear somewhere on the parcel, its farmer or its crops) and the two filters.
export function filterParcels(parcels, { search = '', barangay = '', farmer = '' } = {}) {
  const words = String(search).toLowerCase().split(/\s+/).filter(Boolean)
  return parcels.filter((p) => (
    (!barangay || p.barangay === barangay)
    && (!farmer || String(p.farmer_id) === String(farmer))
    && words.every((w) => text(p).includes(w))
  ))
}

const byText = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' })

// The order the table shows: the list and the per-farmer view by farmer, the per-barangay view by barangay then farmer; parcels by number.
export function sortParcels(parcels, mode) {
  return [...parcels].sort((a, b) => (
    (mode === 'barangay' ? byText(a.barangay, b.barangay) : 0)
    || byText(a.farmer_name, b.farmer_name)
    || byText(a.title, b.title)
  ))
}

// The group a parcel sits under in a grouped view (null in the list).
export function groupOf(parcel, mode) {
  if (mode === 'farmer') return { key: `f${parcel.farmer_id}`, label: parcel.farmer_name, sub: parcel.rsbsa_number || '' }
  if (mode === 'barangay') return { key: `b${parcel.barangay}`, label: parcel.barangay || 'No barangay', sub: '' }
  return null
}

// One page of the table: the parcels of that page in order, with a group heading before the first parcel of each group (also at the top
// of a page that continues a group). A heading carries every parcel of its group (not only this page's), for "select the whole group".
export function pageItems(sorted, mode, page, size = PAGE_SIZE) {
  const members = new Map()
  if (mode !== 'list') sorted.forEach((p) => { const g = groupOf(p, mode); if (!members.has(g.key)) members.set(g.key, []); members.get(g.key).push(p) })
  const items = []
  let current = null
  sorted.slice((page - 1) * size, page * size).forEach((p) => {
    const g = groupOf(p, mode)
    if (g && g.key !== current) { items.push({ type: 'group', ...g, parcels: members.get(g.key) }); current = g.key }
    items.push({ type: 'parcel', key: p.key, parcel: p })
  })
  return items
}

export const pageCount = (total, size = PAGE_SIZE) => Math.max(1, Math.ceil(total / size))

export const allCrops = (parcels) => parcels.flatMap((p) => p.crops)

// What is ticked on one parcel: how many of its crops, whether all of them, and whether they are all a total loss.
export function parcelState(selection, parcel) {
  const rows = parcel.crops.map((c) => selection[c.id]).filter(Boolean)
  return { picked: rows.length, all: parcel.crops.length > 0 && rows.length === parcel.crops.length, total: parcel.crops.length > 0 && rows.length === parcel.crops.length && rows.every((r) => r.total) }
}

// The ticked rows in the order the table lists them (what is sent), with the crop records they came from.
export function orderedRows(selection, parcels) {
  const rows = []
  const records = []
  parcels.forEach((p) => p.crops.forEach((c) => { if (selection[c.id]) { rows.push(selection[c.id]); records.push(c) } }))
  return { rows, records }
}

export function selectedStats(selection, parcels) {
  const touched = parcels.filter((p) => p.crops.some((c) => selection[c.id]))
  return { crops: Object.keys(selection).length, parcels: touched.length, farmers: new Set(touched.map((p) => p.farmer_id)).size }
}

export function summaryLine({ crops, parcels, farmers }) {
  if (!crops) return 'No crops selected'
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  return `${plural(crops, 'crop')} on ${plural(parcels, 'parcel')} of ${plural(farmers, 'farmer')} selected`
}

export const barangayOptions = (parcels) => [...new Set(parcels.map((p) => p.barangay).filter(Boolean))].sort(byText)

export function farmerOptions(parcels) {
  const seen = new Map()
  parcels.forEach((p) => { if (!seen.has(p.farmer_id)) seen.set(p.farmer_id, { id: p.farmer_id, name: p.farmer_name }) })
  return [...seen.values()].sort((a, b) => byText(a.name, b.name))
}
