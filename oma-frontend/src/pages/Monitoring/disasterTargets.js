// The full-screen Log Disaster form (Crop Disaster > Log Disaster): a table of every parcel that has crops still in the field, to tick
// the ones a disaster hit. Pure functions - no screen, no network - for what the table shows (search, filters, the sort order, the
// page) and for what is ticked, so the rules can be tested on their own. The selection itself (which crops,
// how much of each, which are a total loss) is the one in disasterEvent.js. The server checks everything again.
import { cropLabel } from './disasterEvent.js'

export const SORTS = [
  { id: 'farmer', label: 'Farmer' },
  { id: 'barangay', label: 'Barangay' },
  { id: 'parcel', label: 'Parcel number' },
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

// The order the table shows: by farmer (the default), by barangay, or by parcel number; ties fall back to farmer, then parcel.
export function sortParcels(parcels, sort) {
  return [...parcels].sort((a, b) => (
    (sort === 'barangay' ? byText(a.barangay, b.barangay) : sort === 'parcel' ? byText(a.title, b.title) : 0)
    || byText(a.farmer_name, b.farmer_name)
    || byText(a.title, b.title)
  ))
}

// One page of the sorted table.
export const pageOf = (sorted, page, size = PAGE_SIZE) => sorted.slice((page - 1) * size, page * size)

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

// The farmers who have a crop ticked, one entry each in the order of the table: who they are and what of theirs is affected. The
// Log Disaster form shows one photo-documentation row per entry; a farmer whose last crop is un-ticked is no longer listed.
export function selectedFarmers(selection, parcels) {
  const byFarmer = new Map()
  parcels.forEach((p) => {
    const picked = p.crops.filter((c) => selection[c.id])
    if (!picked.length) return
    if (!byFarmer.has(p.farmer_id)) {
      byFarmer.set(p.farmer_id, { id: p.farmer_id, name: p.farmer_name, rsbsa: p.rsbsa_number, barangay: p.barangay, parcels: 0, crops: 0, total: 0, parcelTitles: [] })
    }
    const entry = byFarmer.get(p.farmer_id)
    entry.parcels += 1
    entry.crops += picked.length
    entry.total += picked.filter((c) => selection[c.id].total).length
    entry.parcelTitles.push(p.title)
  })
  return [...byFarmer.values()]
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
