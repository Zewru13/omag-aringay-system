// How much land a harvest may cover: never more than the area the crop was planted on (or, for a harvest with no crop record, its parcel).
// A pure rule for the harvest forms so the box can say so while typing; the server checks it again, and also that all the harvests of one
// crop together stay within the planted area (production/harvest_area.py).

const EPSILON = 0.00005

const fmt = (value) => String(Math.round(Number(value) * 10000) / 10000)

// '' when the area is fine. `limitHa` is the planted area (or the parcel's), null when there is nothing to compare with.
export function harvestAreaProblem(value, limitHa, what = 'the area planted') {
  if (value === '' || value === null || value === undefined) return 'Area harvested is required.'
  const area = parseFloat(value)
  if (Number.isNaN(area) || area <= 0) return 'Area must be greater than 0.'
  const limit = limitHa === null || limitHa === undefined || limitHa === '' ? null : Number(limitHa)
  if (limit !== null && !Number.isNaN(limit) && area > limit + EPSILON) return `Cannot be more than ${what} (${fmt(limit)} ha).`
  return ''
}

// The limit as a hint under the box ('Planted: 2 ha'), or '' when there is none.
export function harvestAreaHint(limitHa, label = 'Planted') {
  const limit = limitHa === null || limitHa === undefined || limitHa === '' ? null : Number(limitHa)
  return limit === null || Number.isNaN(limit) ? '' : `${label}: ${fmt(limit)} ha`
}
