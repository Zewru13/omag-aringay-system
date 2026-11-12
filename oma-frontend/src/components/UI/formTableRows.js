// The rules of a read-only detail table (DetailTable in FormTable.jsx), kept apart from the markup so they can be tested alone.

// What a read-only cell shows: a dash for nothing, Yes / No for a flag, a list joined with commas; anything else as it is (0 is a value).
export function displayValue(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return value.trim() ? value : '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  return value
}

// Lay the fields out as table rows: `columns` fields to a row (two by default). A field marked `wide` takes a row of its own, a field left
// alone on a row is given the whole row, and a field marked `hidden` (or an empty entry) is left out.
//   fields: [{ label, value, wide?, hidden? }]  ->  [[field, field], [field(wide)], ...]
export function detailRows(fields, columns = 2) {
  const rows = []
  let open = []
  const close = () => {
    if (!open.length) return
    rows.push(open.length < columns ? open.map((f) => ({ ...f, wide: true })) : open)
    open = []
  }
  for (const field of fields || []) {
    if (!field || field.hidden) continue
    if (field.wide || columns < 2) {
      close()
      rows.push([{ ...field, wide: true }])
      continue
    }
    open.push(field)
    if (open.length === columns) close()
  }
  close()
  return rows
}
