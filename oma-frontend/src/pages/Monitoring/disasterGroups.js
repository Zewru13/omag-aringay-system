// The Disaster pages list one row per disaster log. This groups them by person so a farmer or fisherfolk with several
// shows once, with their crops or ponds opening beneath. Pure, so the grouping and the counts can be tested.
//   rows: the page's log rows. idKey / nameKey / barangayKey: which fields name the person.
// Returns [{ key, name, barangay, rows, total, active, recovered, summary }] in the order people first appear.
export const groupDisasterRows = (rows, { idKey, nameKey, barangayKey }) => {
  if (!Array.isArray(rows)) return []
  const groups = new Map()
  rows.forEach((row) => {
    const name = String(row[nameKey] || '').trim() || 'Unknown'
    const id = row[idKey]
    const key = id !== undefined && id !== null ? `id:${id}` : `name:${name.toLowerCase()}`
    if (!groups.has(key)) groups.set(key, { key, name, barangay: row[barangayKey] || '', rows: [] })
    groups.get(key).rows.push(row)
  })
  return [...groups.values()].map((group) => {
    // Active = still open and can be recovered; history = open on paper but its crop or stock is already harvested.
    const history = group.rows.filter((r) => r.status === 'Active' && r.can_recover === false).length
    const active = group.rows.filter((r) => r.status === 'Active').length - history
    const recovered = group.rows.filter((r) => r.status === 'Recovered').length
    return {
      ...group,
      total: group.rows.length,
      active,
      history,
      recovered,
      summary: [active && `${active} active`, recovered && `${recovered} recovered`, history && `${history} history only`].filter(Boolean).join(' · '),
    }
  })
}
