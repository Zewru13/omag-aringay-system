import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import { parcelLabel, purgeReasonLabel, purgedParams } from './parcelRecords.js'

// The Purged Parcels tab of Crop Records: parcels that were sold or transferred to someone else, newest first, with why, when and
// by whom. Read-only.

const COLUMNS = ['Parcel', 'Farmer', 'Barangay', 'Area (ha)', 'Reason', 'Date', 'Purged by', 'Note']

const fmtDate = (value) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
}
const reasonTone = (reason) => (reason === 'Sold' ? 'amber' : 'blue')

export default function PurgedParcelsTable({ isPhone }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebouncedValue(search.trim())
  const key = JSON.stringify([debounced, page])
  const [result, setResult] = useState({ key: '', rows: [], count: 0, failed: false })

  useEffect(() => {
    let alive = true
    api.get('/farmers/parcels/purged/', { params: purgedParams({ search: debounced, page }) })
      .then((r) => {
        if (!alive) return
        const rows = Array.isArray(r.data) ? r.data : r.data.results || []
        setResult({ key, rows, count: typeof r.data?.count === 'number' ? r.data.count : rows.length, failed: false })
      })
      .catch(() => alive && setResult({ key, rows: [], count: 0, failed: true }))
    return () => { alive = false }
  }, [key, debounced, page])

  const isLoading = result.key !== key

  return (
    <div className="space-y-4">
      <FilterPanel search={search} onSearchChange={(v) => { setSearch(v); setPage(1) }} searchPlaceholder="Search by farmer, RSBSA, or parcel number..." />

      {result.failed && !isLoading && <ErrorMessage message="Failed to load the purged parcels." />}

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl border border-[#E2E8E2] bg-[#E8EEE8]/60" />)}
        </div>
      ) : result.rows.length === 0 ? (
        <div className="rounded-xl border border-[#E2E8E2] bg-white py-12 text-center">
          <p className="text-[14px] font-medium text-[#4A5E4A]">No purged parcels</p>
          <p className="text-[13px] text-[#7A8E7A]">A parcel that was sold or transferred is purged from the Farm Parcels tab, and appears here.</p>
        </div>
      ) : isPhone ? (
        <ul className="space-y-2">
          {result.rows.map((p) => (
            <li key={p.id} className="rounded-xl border border-[#E2E8E2] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-words text-[14px] font-semibold text-[#1A2B1A]">{parcelLabel(p)}</p>
                <StatusPill tone={reasonTone(p.purge_reason)}>{purgeReasonLabel(p.purge_reason)}</StatusPill>
              </div>
              <p className="text-[13px] text-[#4A5E4A]">{p.farmer_name} · {p.barangay}</p>
              <p className="text-[12px] text-[#7A8E7A]">{Number(p.area_hectares).toFixed(2)} ha · {fmtDate(p.purge_date)} · by {p.purged_by_name || '—'}</p>
              {p.purge_note && <p className="mt-1 break-words text-[12.5px] text-[#4A5E4A]">{p.purge_note}</p>}
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
                <tr key={p.id} className="border-b border-[#F0F4F0] align-top">
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-medium text-[#1A2B1A]">{parcelLabel(p)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#1A2B1A]">
                    <p className="font-medium">{p.farmer_name}</p>
                    <p className="text-[11.5px] text-[#7A8E7A]">{p.rsbsa_number}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{p.barangay}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{Number(p.area_hectares).toFixed(2)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5"><StatusPill tone={reasonTone(p.purge_reason)}>{purgeReasonLabel(p.purge_reason)}</StatusPill></td>
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
    </div>
  )
}
