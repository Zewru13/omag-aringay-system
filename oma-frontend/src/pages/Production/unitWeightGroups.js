// Harvest Unit Settings shows one row per unit weight, for however many crops it is set: rows of the same unit, weight and note are a group
// (the server keeps one row per unit and crop). No screen and no network, so it can be tested on its own.

const weightKey = (kg) => (kg === null || kg === undefined || kg === '' ? '' : String(Number(kg)))

// The weights (as the list endpoint gives them) as groups, newest first:
// [{ id (the newest row's), key, unit, kg_per_unit, note, ids, crop_ids ([] when every), crop_names, every }].
// A row for every crop is a group of its own; rows of crops are grouped by unit (not case sensitive), weight and note.
export function groupWeights(weights) {
  const groups = new Map()
  ;(Array.isArray(weights) ? weights : []).forEach((row) => {
    const every = row.crop_type === null || row.crop_type === undefined
    const key = [(row.unit || '').toLowerCase(), weightKey(row.kg_per_unit), row.note || '', every ? 'every' : 'crops'].join('|')
    const group = groups.get(key) || { key, unit: row.unit, kg_per_unit: row.kg_per_unit, note: row.note || '', ids: [], crop_ids: [], crop_names: [], every, id: 0 }
    group.ids.push(row.id)
    if (!every) { group.crop_ids.push(row.crop_type); group.crop_names.push(row.crop_type_name) }
    group.id = Math.max(group.id, row.id)
    groups.set(key, group)
  })
  return [...groups.values()].sort((a, b) => b.id - a.id || a.unit.localeCompare(b.unit))
}

export const cropsText = (group) => (group.every ? 'Every crop' : group.crop_names.join(', '))

// The body of the request that adds or changes a group (POST .../harvest-unit-weights/ or PUT .../group/ with `ids`).
export const groupRequest = ({ unit, crop_types, kg_per_unit, note }) => ({
  unit: (unit || '').trim(),
  crop_types: (crop_types || []).map(Number),
  kg_per_unit: kg_per_unit === '' || kg_per_unit === null || kg_per_unit === undefined ? null : kg_per_unit,
  note: (note || '').trim(),
})
