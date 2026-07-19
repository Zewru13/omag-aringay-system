// Shared by ForecastingPage.jsx (crop) and FisheriesForecastingTab.jsx
// (fisheries) so the Yield Analysis "Possible Factors" wording can't quietly
// diverge between the two pages the way it did before this file existed —
// same failure pattern as the fisherfolk-search bug that showed up in five
// separate components. Mirrors the same rules implemented server-side (for
// the PDF/Excel export) in core/utils.py::possible_factors_text — JS can't
// import Python, so keep the two in sync by rule, not by literal string.

const FACTOR_HINTS = {
  crop: 'weather, pests, and soil',
  fisheries: 'water quality, disease, and weather',
}

const NO_SCHEDULE_NOUN = {
  crop: 'crop',
  fisheries: 'species',
}

/**
 * "Possible Factors" text for one Yield Analysis record. Causal-adjacent
 * "Missed: ..." wording is reserved for the one case it's actually
 * informative for — a real shortfall (variance_pct < 0) alongside logged
 * activity gaps. A record that met or beat its estimate, or one with no
 * comparable estimate at all, gets neutral, non-causal wording instead.
 */
export function possibleFactorsText(rec, domain = 'crop') {
  if (rec.activities_total_count === 0) {
    const noun = NO_SCHEDULE_NOUN[domain] || 'record'
    return `No activity schedule defined for this ${noun}.`
  }

  const hasGaps = Boolean(rec.missed_high_priority && rec.missed_high_priority.length > 0)
  const { variance_pct: variancePct, activities_completed_count: completed, activities_total_count: total } = rec

  if (variancePct === null || variancePct === undefined) {
    if (!hasGaps) return 'All key activities completed'
    return `Recommended activities logged: ${completed}/${total} — no yield estimate available for comparison.`
  }

  if (variancePct >= 0) {
    if (!hasGaps) return 'All key activities completed'
    return `Recommended activities logged: ${completed}/${total} — yield met or exceeded the estimate despite limited logged activity.`
  }

  // variancePct < 0
  if (!hasGaps) {
    const hint = FACTOR_HINTS[domain] || 'external, unlogged conditions'
    return `Most recommended activities were completed; the shortfall may reflect factors outside this system's scope (${hint}).`
  }
  return 'Missed: ' + rec.missed_high_priority.map(m => `${m.activity} (Day ${m.scheduled_day})`).join(', ')
}
