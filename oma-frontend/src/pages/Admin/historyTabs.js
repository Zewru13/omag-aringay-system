// The words of the Audit Log's three history tabs, where each one searches, and how a match is shown. No screen and no network.

export const HISTORY_TABS = {
  farmer: {
    title: 'Farmer History',
    intro: 'Search for a farmer to see their history: crops, harvests, disasters, assistance, farm visits and more.',
    placeholder: 'Search a farmer by name or RSBSA number…',
    empty: 'Pick a farmer above to see their history.',
    sources: [{ url: '/farmers/', kind: 'farmer' }],
  },
  fisherfolk: {
    title: 'Fisherfolk History',
    intro: 'Search for a fisherfolk to see their history: ponds, cycles, harvests, fishing trips, disasters, assistance and more.',
    placeholder: 'Search a fisherfolk by name or RSBSA number…',
    empty: 'Pick a fisherfolk above to see their history.',
    sources: [{ url: '/fisheries/fisherfolk/', kind: 'fisherfolk' }],
  },
  cooperative: {
    title: 'Cooperative History',
    intro: 'Search for a cooperative to see its history: members, officers, equipment and assistance given.',
    placeholder: 'Search a cooperative by name or registration number…',
    empty: 'Pick a cooperative above to see its history.',
    sources: [
      { url: '/organizations/farmers/', kind: 'farmers-cooperative' },
      { url: '/organizations/fisherfolk/', kind: 'fisherfolk-cooperative' },
    ],
  },
}

export const MATCH_LIMIT = 20
const COOPERATIVE_NOTES = { 'farmers-cooperative': 'Farmers cooperative', 'fisherfolk-cooperative': 'Fisherfolk cooperative' }

export const pickerUrl = (url, typed) => `${url}?${new URLSearchParams({ search: typed, page_size: String(MATCH_LIMIT) })}`

// The matches of one source, from a plain list or a page of results.
export function pickerRows(kind, data) {
  const rows = Array.isArray(data) ? data : data?.results || []
  return rows.slice(0, MATCH_LIMIT).map((row) => ({
    kind,
    id: row.id,
    name: row.full_name || row.name || [row.first_name, row.last_name].filter(Boolean).join(' '),
    note: COOPERATIVE_NOTES[kind] || row.rsbsa_number || '',
  }))
}
