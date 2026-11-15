// The rules of the farmer's Forecast page (MyForecastPage.jsx draws them): the sections, the countdown to a harvest, and how what
// was harvested compares with the estimate. No screen and no network, so they can be tested on their own.
import { todayISO } from '../../utils/localDate.js'

// Crops still in the field first, then the harvested ones (their estimate beside what was actually harvested).
export const FORECAST_SECTIONS = [
  { key: 'growing', label: 'Growing', match: (crop) => crop.status === 'Planted' || crop.status === 'Near Harvest' },
  { key: 'harvested', label: 'Harvested', match: (crop) => crop.status === 'Harvested' },
]

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
// A calendar date as a day number, so two dates can be subtracted without a time zone moving either of them.
const dayNumber = (iso) => {
  const m = DAY.exec(String(iso ?? ''))
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : null
}

// How far the expected harvest is from today: "in 85 days", "tomorrow", "today", "12 days late". Nothing when there is no date.
export function countdown(expected, today = todayISO()) {
  const target = dayNumber(expected)
  const now = dayNumber(today)
  if (target === null || now === null) return ''
  const days = target - now
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days > 1) return `in ${days} days`
  return `${-days} day${days === -1 ? '' : 's'} late`
}

const number = (value) => (value === null || value === undefined || value === '' ? null : Number(value))

// What was harvested against the estimate, as a whole percent: more is green, less is red, the same is grey. Nothing to say when
// either figure is missing or there was no estimate.
export function yieldDifference(estimate, actual) {
  const est = number(estimate)
  const act = number(actual)
  if (est === null || act === null || !Number.isFinite(est) || !Number.isFinite(act) || est === 0) return null
  const percent = Math.round(((act - est) / est) * 100)
  if (percent === 0) return { text: '0%', tone: 'grey' }
  return percent > 0 ? { text: `+${percent}%`, tone: 'green' } : { text: `${percent}%`, tone: 'red' }
}

// A weight in kilos ("2,400 kg"); nothing when it is missing.
export function kg(value) {
  const amount = number(value)
  return amount === null || !Number.isFinite(amount) ? null : `${amount.toLocaleString('en-US')} kg`
}

// Everything the search box may look at.
export const forecastText = (crop) => [crop.crop_type_name, crop.variety_used, crop.farm_location_barangay].filter(Boolean).join(' ')
