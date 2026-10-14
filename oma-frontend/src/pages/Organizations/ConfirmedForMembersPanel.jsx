import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import PhotoLinks from '../../components/UI/PhotoLinks.jsx'

// What this organization has confirmed for its members: the history behind the "Confirm for Members" action. Those
// confirmations are final (no staff approval), so this is a record, not a queue. Rows that were confirmed together
// (same moment, same person) are shown as one group with the proof photos they share.

const PAGE_SIZE = 10

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}
const fmtDate = (d) => (d ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${d}T00:00:00`)) : '—')

function groupBatches(rows) {
  const map = new Map()
  for (const r of rows) {
    const key = `${(r.reviewed_at || r.submitted_at || '').slice(0, 19)}|${r.submitted_by || ''}`
    if (!map.has(key)) map.set(key, { key, at: r.reviewed_at || r.submitted_at, by: r.submitted_by_name, photos: r.photo_urls || [], rows: [] })
    map.get(key).rows.push(r)
  }
  return [...map.values()]
}

export default function ConfirmedForMembersPanel({ type, organizationId: id }) {
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.get(`/interventions/confirmed-for-members/${type}/${id}/`, { params: { page } })
      .then((r) => { if (!cancelled) { setRows(r.data.results || []); setCount(r.data.count || 0); setError('') } })
      .catch(() => { if (!cancelled) setError('Could not load the confirmation history.') })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [type, id, page])

  const batches = useMemo(() => groupBatches(rows), [rows])
  const nameKey = type === 'farmers' ? 'farmer_full_name' : 'fisherfolk_full_name'

  if (isLoading) return <div className="flex min-h-24 items-center justify-center"><LoadingSpinner size={24} /></div>
  if (error) return <p className="rounded-lg bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
  if (count === 0) {
    return (
      <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">
        Nothing confirmed for members yet. When this organization confirms assistance for its members, each confirmation is listed here with its proof photos.
      </p>
    )
  }

  return (
    <div className="space-y-4" data-testid="confirmed-for-members">
      <p className="text-[12px] text-[#7A8E7A]">{count} confirmation{count === 1 ? '' : 's'} · newest first</p>
      {batches.map((b) => (
        <div key={b.key} className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0F4F0] bg-[#F5F8F5] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0 text-[#1B4D2E]" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#1A2B1A]">Confirmed {fmtDateTime(b.at)}</p>
                <p className="text-[12px] text-[#7A8E7A]">by {b.by || 'the organization'} · {b.rows.length} member{b.rows.length === 1 ? '' : 's'}</p>
              </div>
            </div>
            <PhotoLinks photos={b.photos.map((url, i) => ({ id: `${b.key}-${i}`, url }))} />
          </div>
          <ul className="divide-y divide-[#F0F4F0]">
            {b.rows.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <p className="text-[14px] font-medium text-[#1A2B1A]">{r[nameKey]}</p>
                <p className="text-[12px] text-[#7A8E7A]">{r.member_rsbsa}</p>
                <p className="mt-1 text-[13px] text-[#4A5E4A]">
                  {[r.assistance_type || 'Assistance', r.quantity, (r.source_agencies || []).join(', ')].filter(Boolean).join(' · ')}
                  <span className="text-[#7A8E7A]"> · given {fmtDate(r.date_given)}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <PaginationBar page={page} totalCount={count} pageSize={PAGE_SIZE} onPageChange={(p) => { setIsLoading(true); setPage(p) }} />
    </div>
  )
}
