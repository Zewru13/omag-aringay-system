// The rules of the account kit's record list (RecordList.jsx draws them). One column definition serves both layouts:
//   { key, label, phone?: 'title' | 'line' | 'badge' | 'hide', align?: 'right', render?: (row) => node }
// On a computer every column is a table column, in order. On a phone a record is a row: the title, up to two detail lines and the
// status badge. No screen here, so the rules can be tested on their own.

const MAX_PHONE_LINES = 2

// Which column is the phone row's title (the first one unless a column says so), which is its badge, and its detail lines.
export function phoneParts(columns) {
  const title = columns.find((c) => c.phone === 'title') || columns[0]
  const badge = columns.find((c) => c.phone === 'badge') || null
  const lines = columns.filter((c) => c !== title && (c.phone === 'line' || c.phone === undefined)).slice(0, MAX_PHONE_LINES)
  return { title, badge, lines }
}

// Rows under their section headings ("Growing", "Harvested"): `sections` is [{ key, label, match(row) }]. A row goes to the first
// section that takes it; a section with no rows is left out. Without sections the rows are one unnamed group.
export function groupRows(rows, sections) {
  if (!rows?.length) return []
  if (!sections?.length) return [{ key: 'all', label: null, rows }]
  return sections
    .map((section, i) => ({
      key: section.key,
      label: section.label,
      rows: rows.filter((row) => section.match(row) && !sections.slice(0, i).some((earlier) => earlier.match(row))),
    }))
    .filter((group) => group.rows.length > 0)
}

const isBlank = (value) => value === undefined || value === null || value === ''

// What a cell shows: the column's own drawing when it has one, else the row's value; nothing to show is a dash.
export function cellText(column, row) {
  const value = column.render ? column.render(row) : row[column.key]
  return isBlank(value) ? '—' : value
}

// The tick boxes of a list (RecordList's `selectable`): whether every row that can be ticked is ticked (the header box), and whether
// any is. `canSelect(row)` leaves rows out that cannot be ticked; without it every row counts.
export function selectionState(rows, selected, canSelect = () => true) {
  const ids = rows.filter(canSelect).map((row) => row.id)
  const some = ids.some((id) => selected.has(id))
  return { all: ids.length > 0 && ids.every((id) => selected.has(id)), some }
}
