// Local-calendar date helpers.
//
// Every date field in this app stores a CALENDAR DATE ('2026-08-13'), not an
// instant, and the person entering it means their own local day. The obvious
// `new Date().toISOString().split('T')[0]` does NOT give that: toISOString
// converts to UTC first, so in Aringay (UTC+8) it returns YESTERDAY's date
// every day between 00:00 and 08:00 local.
//
// That is not a corner case here — it is a third of the day, and it covers
// the early morning when feeding and field activities actually get logged.
// A fisherfolk tapping "Ngayon" at 6am was silently filing the log against
// the previous day, which also shifts every overdue/due-today calculation
// that reads it back.
//
// These use the local calendar fields instead, so the string always matches
// what the person's own phone says the date is.

const pad = (n) => String(n).padStart(2, '0')

export const toLocalISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const todayISO = () => toLocalISO(new Date())

export const daysAgoISO = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toLocalISO(d)
}

export const yesterdayISO = () => daysAgoISO(1)
