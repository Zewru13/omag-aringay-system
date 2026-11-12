// The rules of the catch log form (Capture Monitoring). Log Fishing Trip / Catch and Edit Catch Log are the same window (LogCatchModal.jsx),
// so the fields, what is refused, what is sent and how the species of an edited log are changed are written once here. Tested alone.

// "Other" is not in these lists: the dropdown (ComboboxWithOther) offers it itself and asks for the text.
export const FISHING_GROUNDS = [
  'Beach', 'Municipal Waters', 'Coastal Waters', 'Nearshore Waters', 'Offshore Waters', 'Open Sea', 'River', 'Lake', 'Fishpond', 'Fish Cage Area',
  'Fish Pen Area', 'Mangrove Area', 'Estuary', 'Brackish Water', 'Freshwater Area', 'Irrigation Canal', 'Reservoir',
]
export const GEARS = [
  'Hook and Line', 'Gill Net', 'Cast Net', 'Fish Trap', 'Crab Trap', 'Spear Fishing', 'Long Line', 'Seine Net', 'Lift Net', 'Handline',
  'Multiple Hook and Line', 'Net',
]
export const SPECIES_NAMES = [
  'Bangus', 'Tilapia', 'Galunggong', 'Tamban', 'Tulingan', 'Maya-maya', 'Lapu-lapu', 'Dalagang Bukid', 'Alumahan', 'Bisugo', 'Hito', 'Dalag', 'Hipon',
  'Alimango', 'Tahong', 'Talaba', 'Squid',
]

export const EMPTY_TRIP = {
  trip_date: '', return_date: '', fishing_ground: '', fishing_ground_other: '', gear_used: '', gear_used_other: '', hours_at_sea: '', remarks: '',
}
export const emptySpeciesRow = () => ({ id: null, species_name: '', species_name_other: '', volume_kg: '', notes: '' })

// A stored text as the dropdown shows it: an item of the list, or Other with the text.
const choice = (stored, list) => {
  const text = String(stored ?? '').trim()
  if (!text) return ['', '']
  return list.includes(text) ? [text, ''] : ['Other', text]
}

export function tripFormFrom(record) {
  const [ground, groundOther] = choice(record?.fishing_ground, FISHING_GROUNDS)
  const [gear, gearOther] = choice(record?.gear_used, GEARS)
  return {
    trip_date: record?.trip_date || '',
    return_date: record?.return_date || '',
    fishing_ground: ground,
    fishing_ground_other: groundOther,
    gear_used: gear,
    gear_used_other: gearOther,
    hours_at_sea: record?.hours_at_sea != null ? String(record.hours_at_sea) : '',
    remarks: record?.remarks || '',
  }
}

export function speciesRowsFrom(record) {
  const entries = record?.species_entries || []
  if (!entries.length) return [emptySpeciesRow()]
  return entries.map((entry) => {
    const [name, other] = choice(entry.species_name, SPECIES_NAMES)
    return { id: entry.id, species_name: name, species_name_other: other, volume_kg: entry.volume_kg != null ? String(entry.volume_kg) : '', notes: entry.notes || '' }
  })
}

export const speciesName = (row) => (row.species_name === 'Other' ? (row.species_name_other || '').trim() : (row.species_name || '').trim())
const volumeOf = (row) => parseFloat(row.volume_kg)
export const validSpeciesRows = (rows) => rows.filter((row) => speciesName(row) && Number.isFinite(volumeOf(row)) && volumeOf(row) > 0)
export const catchTotal = (rows) => rows.reduce((sum, row) => sum + (volumeOf(row) > 0 ? volumeOf(row) : 0), 0)

// What stops the save ('' when nothing does). `speciesOptional`: an older log that was saved with a total and no species may stay that way.
export function tripProblem({ fisherfolk, form, rows, speciesOptional = false }) {
  if (!fisherfolk) return 'Select a fisherfolk.'
  if (!form.trip_date) return 'Trip date is required.'
  if (form.return_date && form.return_date < form.trip_date) return 'Return date cannot be before the trip date.'
  if (!form.fishing_ground) return 'Choose the fishing ground.'
  if (form.fishing_ground === 'Other' && !form.fishing_ground_other.trim()) return 'Specify the fishing ground.'
  if (!form.gear_used) return 'Choose the gear used.'
  if (form.gear_used === 'Other' && !form.gear_used_other.trim()) return 'Specify the gear used.'
  if (form.hours_at_sea !== '' && !(parseFloat(form.hours_at_sea) >= 0)) return 'Hours at sea cannot be negative.'
  if (!speciesOptional && validSpeciesRows(rows).length === 0) return 'Add at least one species with its volume.'
  return ''
}

// The trip as the server keeps it. The total catch is never sent: the server adds up the species.
export function tripPayload(form) {
  return {
    trip_date: form.trip_date,
    return_date: form.return_date || null,
    fishing_ground: form.fishing_ground === 'Other' ? form.fishing_ground_other.trim() : form.fishing_ground,
    gear_used: form.gear_used === 'Other' ? form.gear_used_other.trim() : form.gear_used,
    hours_at_sea: form.hours_at_sea !== '' ? parseFloat(form.hours_at_sea) : null,
    remarks: (form.remarks || '').trim(),
  }
}

const entryOf = (row) => ({ species_name: speciesName(row), volume_kg: row.volume_kg, notes: row.notes || '' })

// What to do to the species of a log being saved: `remove` the ids of entries that were taken out or changed, `add` the new and the changed
// rows. (An entry has no "change" request of its own, so a changed one is removed and added again.) A new log adds every row.
export function speciesChanges(original, rows) {
  const before = new Map((original || []).map((entry) => [entry.id, entry]))
  const kept = new Set()
  const add = []
  for (const row of validSpeciesRows(rows)) {
    const old = row.id != null ? before.get(row.id) : null
    const next = entryOf(row)
    if (old && old.species_name === next.species_name && Number(old.volume_kg) === Number(next.volume_kg) && (old.notes || '') === next.notes) {
      kept.add(row.id)
      continue
    }
    add.push(next)
  }
  return { remove: [...before.keys()].filter((id) => !kept.has(id)), add }
}
