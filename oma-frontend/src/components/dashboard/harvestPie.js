// The "how did harvests compare with the estimate" pie on the Farmers and Fisherfolk lists. Pure helpers (no screen, no network).

const round1 = (x) => Math.round(x * 10) / 10

// counts: the endpoint's { total, compared, increased, decreased, on_target, no_data }. Percentages are shares of the people who
// could be compared; a slice nobody is in is left out.
export function pieSlices(counts) {
  if (!counts || !counts.compared) return []
  const slices = [
    { key: 'increased', label: 'Exceeded the estimate', value: counts.increased },
    { key: 'decreased', label: 'Below the estimate', value: counts.decreased },
    { key: 'on_target', label: 'Exactly on the estimate', value: counts.on_target },
  ]
  return slices.filter((s) => s.value > 0).map((s) => ({ ...s, percent: round1((s.value / counts.compared) * 100) }))
}

export function pieNote(counts, noun) {
  if (!counts.total) return `No ${noun} match the filters.`
  if (!counts.compared) return `None of the ${counts.total} ${noun} has a harvested record with an estimate to compare.`
  return `${counts.compared} of ${counts.total} ${noun} compared${counts.no_data ? ` · ${counts.no_data} with no harvest to compare` : ''}`
}

export function yearChoices(currentYear) {
  return [
    ...[0, 1, 2].map((back) => ({ value: String(currentYear - back), label: String(currentYear - back) })),
    { value: 'all', label: 'All years' },
  ]
}

// The comparison request: the list's own filters (its paging dropped) and the chosen year.
export function comparisonUrl(base, listQuery, year) {
  const params = new URLSearchParams(listQuery)
  params.delete('page')
  params.set('year', year)
  return `${base}?${params.toString()}`
}
