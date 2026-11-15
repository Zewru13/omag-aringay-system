// The search box and the Year filter above a list of an account page. The list is already on the screen (a person's own records),
// so both narrow it here. No screen and no network, so the rules can be tested on their own.
import { matchesSearch } from '../../utils/searchMatch.js'

// Rows whose text holds every word typed, in any order. `textOf(row)` is everything the search may look at, as one string.
export const searchRows = (rows, query, textOf) => rows.filter((row) => matchesSearch(textOf(row), query))

const yearOf = (value) => {
  const match = /^(\d{4})-\d{2}-\d{2}/.exec(String(value ?? ''))
  return match ? Number(match[1]) : null
}

// The years the rows fall in, newest first, each once. `dateOf(row)` is the date the filter reads (a row without one has no year).
export function yearsOf(rows, dateOf) {
  const years = new Set(rows.map((row) => yearOf(dateOf(row))).filter((year) => year !== null))
  return [...years].sort((a, b) => b - a)
}

// The rows of one year; an empty `year` means every year.
export const inYear = (rows, year, dateOf) => (year === '' || year == null ? rows : rows.filter((row) => yearOf(dateOf(row)) === Number(year)))
