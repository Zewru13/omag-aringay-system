import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import PurgedParcelDetailsModal from './PurgedParcelDetailsModal.jsx'
import { parcelLabel, purgeReasonLabel, purgedParams } from './parcelRecords.js'

// The Purged Parcels tab of Crop Records: parcels that were sold, transferred or otherwise left the farmer's records, newest first, with
// why, when (the date of occurrence) and by whom. Filter by a From / To date of occurrence; click a row for its details. Read-only.

const COLUMNS = ['Parcel', 'Farmer', 'Barangay', 'Area (ha)', 'Reason', 'Date of occurrence', 'Purged by', 'Note']

const fmtDate = (value) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
}
const reasonTone = (reason) => (reason === 'Sold' ? 'amber' : 'blue')

// Sold and Transferred are pills; a reason typed under Others is a sentence, so it is plain text that wraps.
function ReasonCell({ parcel }) {
  const label = purgeReasonLabel(parcel.purge_reason, parcel.purge_reason_other)
  if (parcel.purge_reason === 'Other') return <span className="block max-w-[14rem] whitespace-normal break-words text-[13px] font-medium text-[#1A2B1A]">{label}</span>
  return <StatusPill tone={reasonTone(parcel.purge_reason)}>{label}</StatusPill>
}

const dateInputCls =
  'rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none'

export default function PurgedParcelsTable({ isPhone }) {
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState(null)
  const debounced = useDebouncedValue(search.trim())
  const key = JSON.stringify([debounced, dateFrom, dateTo, page])
  const [result, setResult] = useState({ key: '', rows: [], count: 0, failed: false })

  useEffect(() => {
    let alive = true
    api.get('/farmers/parcels/purged/', { params: purgedParams({ search: debounced, dateFrom, dateTo, page }) })
      .then((r) => {
        if (!alive) return
        const rows = Array.isArray(r.data) ? r.data : r.data.results || []
        setResult({ key, rows, count: typeof r.data?.count === 'number' ? r.data.count : rows.length, failed: false })
      })
      .catch(() => alive && setResult({ key, rows: [], count: 0, failed: true }))
    return () => { alive = false }
  }, [key, debounced, dateFrom, dateTo, page])

  const isLoading = result.key !== key
  const filtering = Boolean(dateFrom || dateTo)
  const changeDate = (setter) => (value) => { setter(value); setPage(1) }
  const clearDates = () => { setDateFrom(''); setDateTo(''); setPage(1) }

  return (
    <div className="space-y-4">
      <FilterPanel
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search by farmer, RSBSA, or parcel number..."
        activeCount={[dateFrom, dateTo].filter(Boolean).length}
        defaultOpen={filtering}
      >
        <label className="flex items-center gap-1.5 text-[12px] text-[#4A5A4C]">
          From
          <input type="date" className={dateInputCls} value={dateFrom} max={dateTo || undefined}
            onChange={(e) => changeDate(setDateFrom)(e.target.value)} aria-label="Date of occurrence from" />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-[#4A5A4C]">
          To
          <input type="date" className={dateInputCls} value={dateTo} min={dateFrom || undefined}
            onChange={(e) => changeDate(setDateTo)(e.target.value)} aria-label="Date of occurrence to" />
        </label>
        {filtering && (
          <button type="button" onClick={clearDates} className="text-[13px] font-medium text-[#1E5637] hover:underline">Clear dates</button>
        )}
      </FilterPanel>

      {result.failed && !isLoading && <ErrorMessage message="Failed to load the purged parcels." />}

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl border border-[#E2E8E2] bg-[#E8EEE8]/60" />)}
        </div>
      ) : result.rows.length === 0 ? (
        <div className="rounded-xl border border-[#E2E8E2] bg-white py-12 text-center">
          <p className="text-[14px] font-medium text-[#4A5E4A]">No purged parcels</p>
          <p className="text-[13px] text-[#7A8E7A]">
            {filtering || debounced
              ? 'Nothing matches the search or dates. Try widening them.'
              : 'A parcel that was sold, transferred or otherwise left is purged from the Farm Parcels tab, and appears here.'}
          </p>
        </div>
      ) : isPhone ? (
        <ul className="space-y-2">
          {result.rows.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setViewing(p)}
                aria-label={`View details of purged parcel ${parcelLabel(p)}`}
                className="block w-full rounded-xl border border-[#E2E8E2] bg-white p-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:bg-[#F9FAF9]"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="break-words text-[14px] font-semibold text-[#1A2B1A]">{parcelLabel(p)}</span>
                  <ReasonCell parcel={p} />
                </span>
                <span className="block text-[13px] text-[#4A5E4A]">{p.farmer_name} · {p.barangay}</span>
                <span className="block text-[12px] text-[#7A8E7A]">{Number(p.area_hectares).toFixed(2)} ha · {fmtDate(p.purge_date)} · by {p.purged_by_name || '—'}</span>
                {p.purge_note && <span className="mt-1 block break-words text-[12.5px] text-[#4A5E4A]">{p.purge_note}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1B4D2E] text-white">
              <tr>
                {COLUMNS.map((label) => (
                  <th key={label} className="whitespace-nowrap px-3 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em]">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((p) => (
                <tr key={p.id} onClick={() => setViewing(p)} className="cursor-pointer border-b border-[#F0F4F0] align-top transition-colors hover:bg-[#F9FAF9]">
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-medium text-[#1A2B1A]">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setViewing(p) }}
                      aria-label={`View details of purged parcel ${parcelLabel(p)}`}
                      className="font-medium text-[#1B4D2E] hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      {parcelLabel(p)}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#1A2B1A]">
                    <p className="font-medium">{p.farmer_name}</p>
                    <p className="text-[11.5px] text-[#7A8E7A]">{p.rsbsa_number}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{p.barangay}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{Number(p.area_hectares).toFixed(2)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5"><ReasonCell parcel={p} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{fmtDate(p.purge_date)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{p.purged_by_name || '—'}</td>
                  <td className="max-w-[18rem] break-words px-3 py-2.5 text-[13px] text-[#4A5E4A]">{p.purge_note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaginationBar page={page} totalCount={result.count} pageSize={10} onPageChange={setPage} />

      {viewing && <PurgedParcelDetailsModal parcel={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
