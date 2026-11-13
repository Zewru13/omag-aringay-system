// The Fisheries Log Disaster table (Fisheries Disaster > Log Disaster): every active pond and cage of every fisherfolk, to tick the ones a
// disaster hit - the fisheries counterpart of the crop table (disasterTargets.js + disasterEvent.js), with a stock in the place of a parcel
// and its ponds/cages in the place of the crops. Pure functions - no screen, no network - for what the table shows (search, filters, the
// sort order, the page), for what is ticked and for what is sent, so the rules can be tested on their own. The per-row checks (the fingerlings
// lost cannot exceed what was stocked, a total loss is the whole stocked count) are the ones of fisheriesStockLosses.js; the server checks
// everything again (fisheries/disaster_reports.py plan_stock_losses).
import { searchWords } from '../../utils/searchMatch.js'
import { effectiveLost, rowError, rowKey } from './fisheriesStockLosses.js'

export const PAGE_SIZE = 10

export const stockTitle = (s) => [
  s.species_name || 'Stock',
  s.cycle_name,
  s.cycle_no && `Cycle ${s.cycle_no}`,
].filter(Boolean).join(' · ')

// Where a stock is: the barangay of its ponds/cages, or the fisherfolk's own barangay when none is recorded.
export const placeOf = (s) => s.pond_location || s.barangay || ''

// The stocks as the server sent them (GET /fisheries/disaster-reports/targets/), each with its title and its ponds/cages as rows. A row is what
// is ticked: its key is stock:unit ("stock:all" for a stock that has no ponds/cages), `stocked` the fingerlings stocked in it (null when unknown).
export const prepareStocks = (stocks) => (stocks || []).map((s) => {
  const title = stockTitle(s)
  return {
    ...s,
    key: `s${s.stock_id}`,
    title,
    place: placeOf(s),
    rows: (s.units || []).map((u) => ({
      key: rowKey(s.stock_id, u.id),
      stockId: s.stock_id,
      unitId: u.id ?? null,
      unitLabel: u.label,
      stocked: u.fingerlings ?? null,
      dateStocked: s.date_stocked || null,
      fisherfolkId: s.fisherfolk_id,
      fisherfolkName: s.fisherfolk_name,
      stockTitle: title,
    })),
  }
})

export const rowsOf = (stocks) => stocks.flatMap((s) => s.rows)

const text = (s) => [
  s.fisherfolk_name, s.rsbsa_number, s.fishr_number, s.barangay, s.pond_location, s.species_name, s.cycle_name, s.title, ...s.rows.map((r) => r.unitLabel),
].join(' ').toLowerCase()

// What is left after the search (every word has to appear somewhere on the stock, its fisherfolk or its ponds/cages, so a fisherfolk is found by name
// there) and the Barangay filter.
export function filterStocks(stocks, { search = '', barangay = '' } = {}) {
  const words = searchWords(search)
  return stocks.filter((s) => (
    (!barangay || placeOf(s) === barangay)
    && words.every((w) => text(s).includes(w))
  ))
}

const byText = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' })

// The order the table shows: by fisherfolk, then the order of the server. (There is no Sort choice.)
export function sortStocks(stocks) {
  return [...stocks].sort((a, b) => byText(a.fisherfolk_name, b.fisherfolk_name) || a.stock_id - b.stock_id)
}

export const pageOf = (sorted, page, size = PAGE_SIZE) => sorted.slice((page - 1) * size, page * size)
export const pageCount = (total, size = PAGE_SIZE) => Math.max(1, Math.ceil(total / size))

export const barangayOptions = (stocks) => [...new Set(stocks.map(placeOf).filter(Boolean))].sort(byText)

// ── the selection: { [row key]: { lost, total } } - the fingerlings lost typed for the pond/cage ('' = not recorded) and whether it is a total loss
export const allSelected = (selection, rows) => rows.length > 0 && rows.every((r) => r.key in selection)

export function selectRows(selection, rows, on) {
  const next = { ...selection }
  rows.forEach((r) => {
    if (!on) delete next[r.key]
    else if (!(r.key in next)) next[r.key] = { lost: '', total: false }
  })
  return next
}

// "Total loss" on some ponds/cages: they become ticked and a total loss (the count lost is then the whole stocked count); switching it off only
// clears the mark - the rows stay ticked.
export function markTotal(selection, rows, on) {
  if (!on) {
    const next = { ...selection }
    rows.forEach((r) => { if (r.key in next) next[r.key] = { ...next[r.key], total: false } })
    return next
  }
  const next = selectRows(selection, rows, true)
  rows.forEach((r) => { next[r.key] = { ...next[r.key], total: true } })
  return next
}

export const updateRow = (selection, key, change) => (key in selection ? { ...selection, [key]: change(selection[key]) } : selection)

// A restored draft may name ponds/cages that are no longer on the list (harvested since): they are dropped.
export function pruneSelection(selection, stocks) {
  const live = new Set(rowsOf(stocks).map((r) => r.key))
  return Object.fromEntries(Object.entries(selection).filter(([key]) => live.has(key)))
}

// The fisherfolk who have a pond or cage ticked, one entry each in the order of the table: who they are and what of theirs is affected. The
// form shows one part (equipment, volume lost, photos) for each; one whose last pond/cage is un-ticked is no longer listed.
export function selectedPeople(selection, stocks) {
  const byPerson = new Map()
  stocks.forEach((s) => {
    const picked = s.rows.filter((r) => r.key in selection)
    if (!picked.length) return
    if (!byPerson.has(s.fisherfolk_id)) {
      byPerson.set(s.fisherfolk_id, {
        id: s.fisherfolk_id, full_name: s.fisherfolk_name, rsbsa_number: s.rsbsa_number || '', fishr_number: s.fishr_number || '', barangay: s.barangay || '',
        stocks: 0, units: 0, total: 0, lost: 0, latestStocked: null,
      })
    }
    const entry = byPerson.get(s.fisherfolk_id)
    entry.stocks += 1
    entry.units += picked.length
    entry.total += picked.filter((r) => selection[r.key].total).length
    picked.forEach((r) => {
      const lost = effectiveLost(r, selection[r.key])
      if (/^\d+$/.test(lost)) entry.lost += Number(lost)
    })
    if (s.date_stocked && (!entry.latestStocked || s.date_stocked > entry.latestStocked)) entry.latestStocked = s.date_stocked
  })
  return [...byPerson.values()]
}

export function selectionStats(selection, stocks) {
  const touched = stocks.filter((s) => s.rows.some((r) => r.key in selection))
  return {
    rows: rowsOf(touched).filter((r) => r.key in selection).length,
    stocks: touched.length,
    fisherfolk: new Set(touched.map((s) => s.fisherfolk_id)).size,
    total: rowsOf(touched).filter((r) => selection[r.key]?.total).length,
  }
}

export function summaryLine({ rows, stocks, fisherfolk }) {
  if (!rows) return 'No ponds or cages selected'
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`
  return `${plural(rows, 'pond/cage', 'ponds/cages')} of ${plural(stocks, 'stock', 'stocks')}, ${plural(fisherfolk, 'fisherfolk', 'fisherfolk')} selected`
}

// What is sent for one fisherfolk (the server takes a group of rows for each): every ticked pond/cage of theirs, in the order of the table. A blank
// count is "not recorded"; a total loss is the whole stocked count.
export function stockLossesOf(personId, selection, stocks) {
  return stocks.filter((s) => s.fisherfolk_id === personId).flatMap((s) => s.rows.filter((r) => r.key in selection).map((r) => {
    const lost = effectiveLost(r, selection[r.key])
    return { stocking_record: r.stockId, production_unit: r.unitId, fingerlings_lost: lost === '' ? null : Number(lost), is_total_loss: Boolean(selection[r.key].total) }
  }))
}

// The first mistake in the ticked rows of ONE stock ('' when there is none): a cycle that is closed is opened on it.
export function stockProblem(stock, selection) {
  for (const row of stock.rows) {
    if (!(row.key in selection)) continue
    const problem = rowError(row, selection[row.key])
    if (problem) return problem
  }
  return ''
}

// The first mistake in the ticked rows ('' when there is none).
export function rowsProblem(selection, stocks) {
  for (const row of rowsOf(stocks)) {
    if (!(row.key in selection)) continue
    const problem = rowError(row, selection[row.key])
    if (problem) return problem
  }
  return ''
}
