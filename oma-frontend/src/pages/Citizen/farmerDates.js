import { DATE_LOCALE } from './labels.js'

// Day-first dates ("12 September 2026", "10 Sep 2026"), as the Farmer citizen
// reference writes them — the en-PH patterns themselves put the month first.
const monthOf = (d, style) => new Intl.DateTimeFormat(DATE_LOCALE, { month: style }).format(d)

const format = (iso, style) => {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getDate()} ${monthOf(d, style)} ${d.getFullYear()}`
}

export const dayFirstLong = (iso) => format(iso, 'long')
export const dayFirstShort = (iso) => format(iso, 'short')
