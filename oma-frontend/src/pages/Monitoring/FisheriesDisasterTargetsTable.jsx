import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { effectiveLost, rowError, autoFilled } from './fisheriesStockLosses.js'
import {
  PAGE_SIZE, allSelected, barangayOptions, filterStocks, markTotal, pageOf, rowsOf, selectRows, sortStocks, stockProblem, updateRow,
} from './disasterPonds.js'

// The ponds and cages a disaster can hit (Fisheries Disaster > Log Disaster), as a table like the parcels of the crop Log Disaster: one row for each
// active stock (a cycle), searchable (a fisherfolk is found by name) and filterable by barangay, ten a page. Click a cycle to open it and see all the
// ponds and cages inside. Tick the ones that were hit - a cycle's own tick ticks all of its ponds/cages and opens it, or tick them one by one - and give
// each its fingerlings lost, or tick Total loss (the whole stocked count). A stock with no ponds/cages on record is one row with its own tick. What is
// ticked is the selection { row key: { lost, total } } of disasterPonds.js, held by the window that saves it.
//   stocks: the prepared list (prepareStocks)   selection / onChange: what is ticked   showErrors: show every row's mistake, not only the touched ones

const CHECK = 'h-4 w-4 flex-none accent-[#1B4D2E]'
const TOTAL_CHECK = 'h-4 w-4 flex-none rounded border-rose-300 text-rose-600 accent-rose-600 focus:ring-rose-500'
const SELECT = 'h-[38px] rounded-lg border border-[#E2E8E2] bg-white px-3 text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none'
const TH = 'whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em]'
const TD = 'px-3 py-2.5 text-[13px] text-[#4A5E4A]'

const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString())

function TotalLossBox({ checked, onChange, label, disabled = false }) {
  return (
    <label className={`inline-flex min-h-[36px] items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-medium ${checked ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-[#E2E8E2] text-[#4A5E4A]'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" className={TOTAL_CHECK} checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      Total loss
    </label>
  )
}

// Fingerlings lost of one pond/cage: typed once it is ticked; a total loss fills in (and locks) the whole stocked count when it is known.
function LostCell({ row, value, error, onChange }) {
  if (!value) return <span className="text-[#A8BCA8]">—</span>
  const auto = autoFilled(row, value)
  return (
    <div>
      <input
        type="text" inputMode="numeric" aria-label={`Fingerlings lost in ${row.unitLabel} of ${row.stockTitle}`}
        className={`${baseInputClasses} w-28 ${error ? 'border-rose-400' : ''}`} readOnly={auto} placeholder="not recorded"
        value={auto ? effectiveLost(row, value) : value.lost}
        onChange={(e) => onChange({ lost: e.target.value.replace(/\D/g, '') })}
      />
      {error && <p className="mt-1 max-w-[12rem] text-xs text-rose-600">{error}</p>}
    </div>
  )
}

export default function FisheriesDisasterTargetsTable({ stocks, selection, onChange, showErrors = false }) {
  const [search, setSearch] = useState('')
  const [barangay, setBarangay] = useState('')
  const [page, setPage] = useState(1)
  const [opened, setOpened] = useState(() => new Set())     // keys of the cycles shown open
  const [touched, setTouched] = useState(() => new Set())
  const query = useDebouncedValue(search.trim())

  const sorted = useMemo(() => sortStocks(filterStocks(stocks, { search: query, barangay })), [stocks, query, barangay])
  const items = useMemo(() => pageOf(sorted, page), [sorted, page])
  const shownRows = useMemo(() => rowsOf(sorted), [sorted])
  const barangays = useMemo(() => barangayOptions(stocks), [stocks])

  const filtered = (setter) => (value) => { setter(value); setPage(1) }
  const reset = () => { setBarangay(''); setPage(1) }
  const toggleOpen = (key) => setOpened((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const tick = (rows, on) => onChange(selectRows(selection, rows, on))
  // Ticking a whole cycle opens it, so the count lost in each pond/cage can be typed.
  const tickStock = (stock, on) => { tick(stock.rows, on); if (on) setOpened((prev) => new Set(prev).add(stock.key)) }
  const total = (rows, on) => onChange(markTotal(selection, rows, on))
  const change = (row, patch) => {
    setTouched((prev) => new Set(prev).add(row.key))
    onChange(updateRow(selection, row.key, (v) => ({ ...v, ...patch })))
  }
  const problem = (row) => (showErrors || touched.has(row.key) ? rowError(row, selection[row.key]) : '')
  const nobody = shownRows.length === 0

  const lostCell = (row) => <LostCell row={row} value={selection[row.key]} error={problem(row)} onChange={(patch) => change(row, patch)} />
  const totalCell = (row) => (
    <TotalLossBox checked={Boolean(selection[row.key]?.total)} label={`${row.unitLabel} of ${row.stockTitle} is a total loss`} onChange={(on) => total([row], on)} />
  )
  const rowTick = (row) => (
    <input type="checkbox" className={CHECK} checked={row.key in selection} aria-label={`Select ${row.unitLabel} of ${row.stockTitle} (${row.fisherfolkName})`} onChange={(e) => tick([row], e.target.checked)} />
  )

  return (
    <section className="space-y-3" aria-label="Affected ponds and cages">
      <FilterPanel
        className=""
        search={search}
        onSearchChange={filtered(setSearch)}
        searchPlaceholder="Search a fisherfolk, registration number, species, barangay, pond or cage…"
        activeCount={[barangay].filter(Boolean).length}
        onReset={reset}
      >
        <select className={SELECT} value={barangay} onChange={(e) => filtered(setBarangay)(e.target.value)} aria-label="Barangay">
          <option value="">Barangay</option>
          {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </FilterPanel>

      {stocks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#C8D5C8] bg-white px-4 py-10 text-center text-[13px] text-[#7A8E7A]">No pond or cage has fish in it now, so there is nothing to log a disaster on. Damage to a pond, cage or equipment only is added below.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12.5px] text-[#4A5E4A]">
            <label className="flex min-h-[36px] cursor-pointer items-center gap-2 font-medium text-[#1A2B1A]">
              <input type="checkbox" className={CHECK} checked={allSelected(selection, shownRows)} disabled={nobody} onChange={(e) => tick(shownRows, e.target.checked)} />
              Select every pond/cage shown ({sorted.length} cycle{sorted.length === 1 ? '' : 's'}, {shownRows.length} pond{shownRows.length === 1 ? '/cage' : 's/cages'})
            </label>
            {Object.keys(selection).length > 0 && (
              <button type="button" className="font-medium text-[#1B4D2E] hover:underline" onClick={() => onChange({})}>Clear the selection</button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white">
            <table className="w-full min-w-[60rem] text-sm">
              <thead className="bg-[#F0F4F0] text-[#4A5E4A]">
                <tr>
                  <th className={`${TH} w-10`}><span className="sr-only">Select</span></th>
                  <th className={TH}>Cycle</th>
                  <th className={TH}>Fisherfolk</th>
                  <th className={TH}>Barangay</th>
                  <th className={TH}>Pond/Cage</th>
                  <th className={TH}>Stocked</th>
                  <th className={TH}>Fingerlings Lost</th>
                  <th className={TH}>Total loss</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-[13px] text-[#7A8E7A]">No pond or cage matches the search and filter.</td></tr>
                )}
                {items.map((stock) => {
                  const picked = stock.rows.filter((r) => r.key in selection)
                  const all = picked.length === stock.rows.length
                  const who = (
                    <td className={`${TD} whitespace-nowrap`}><p className="font-medium text-[#1A2B1A]">{stock.fisherfolk_name}</p><p className="text-[11.5px] text-[#7A8E7A]">{stock.rsbsa_number || stock.fishr_number}</p></td>
                  )
                  // A stock with no ponds/cages on record: one row, nothing to open.
                  if (stock.rows.length === 1 && stock.rows[0].unitId === null) {
                    const row = stock.rows[0]
                    return (
                      <tr key={stock.key} className={`border-b border-[#F0F4F0] align-top ${row.key in selection ? 'bg-[#F6FAF7]' : ''}`}>
                        <td className="w-10 px-3 py-2.5">{rowTick(row)}</td>
                        <td className={TD}><span className="font-medium text-[#1A2B1A]">{stock.title}</span></td>
                        {who}
                        <td className={`${TD} whitespace-nowrap`}>{stock.place || '—'}</td>
                        <td className={`${TD} whitespace-nowrap`}>{row.unitLabel}</td>
                        <td className={`${TD} whitespace-nowrap`}>{fmt(row.stocked)}</td>
                        <td className={TD}>{lostCell(row)}</td>
                        <td className={TD}>{totalCell(row)}</td>
                      </tr>
                    )
                  }
                  // A cycle with ponds/cages: one row, which opens to show them all when it is clicked.
                  const open = opened.has(stock.key) || (showErrors && Boolean(stockProblem(stock, selection)))
                  return [
                    <tr
                      key={stock.key}
                      className={`cursor-pointer border-b border-[#F0F4F0] transition-colors hover:bg-[#F9FAF9] ${picked.length ? 'bg-[#F6FAF7]' : ''}`}
                      onClick={(e) => { if (!e.target.closest('input, label, button')) toggleOpen(stock.key) }}
                    >
                      <td className="w-10 px-3 py-2.5">
                        <input type="checkbox" className={CHECK} checked={all} aria-label={`Select every pond/cage of ${stock.title} (${stock.fisherfolk_name})`}
                          ref={(el) => { if (el) el.indeterminate = picked.length > 0 && !all }} onChange={(e) => tickStock(stock, e.target.checked)} />
                      </td>
                      <td className={TD}>
                        <button type="button" onClick={() => toggleOpen(stock.key)} aria-expanded={open}
                          aria-label={`${open ? 'Hide' : 'Show'} the ponds and cages of ${stock.title} (${stock.fisherfolk_name})`}
                          className="flex min-h-[36px] items-center gap-2 text-left font-medium text-[#1A2B1A]">
                          <ChevronDown size={15} className={`flex-none text-[#4A5E4A] transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
                          {stock.title}
                        </button>
                      </td>
                      {who}
                      <td className={`${TD} whitespace-nowrap`}>{stock.place || '—'}</td>
                      <td colSpan={3} className={`${TD} whitespace-nowrap`}>{stock.rows.length} ponds/cages{picked.length > 0 && <span className="text-[#1B4D2E]"> · {picked.length} affected</span>}</td>
                      <td className={TD}>
                        <TotalLossBox checked={all && picked.every((r) => selection[r.key].total)} label={`Every pond/cage of ${stock.title} (${stock.fisherfolk_name}) is a total loss`} onChange={(on) => total(stock.rows, on)} />
                      </td>
                    </tr>,
                    ...(open ? stock.rows.map((row) => (
                      <tr key={row.key} className={`border-b border-[#F0F4F0] align-top ${row.key in selection ? 'bg-[#F6FAF7]' : 'bg-[#FBFCFB]'}`}>
                        <td className="w-10 px-3 py-2.5">{rowTick(row)}</td>
                        <td colSpan={3} />
                        <td className={`${TD} whitespace-nowrap`}>{row.unitLabel}</td>
                        <td className={`${TD} whitespace-nowrap`}>{fmt(row.stocked)}</td>
                        <td className={TD}>{lostCell(row)}</td>
                        <td className={TD}>{totalCell(row)}</td>
                      </tr>
                    )) : []),
                  ]
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar page={page} totalCount={sorted.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </section>
  )
}
