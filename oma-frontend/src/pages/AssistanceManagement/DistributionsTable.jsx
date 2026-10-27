import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, Eye, Pencil } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { formatAssistanceQuantity } from './assistanceFieldHelpers.js'
import { agenciesText, distributionRowLabel } from './distributionsTableRows.js'

// The staff view of assistance on the Crop and Fisheries Assistance pages: one row per distribution, named after the organization that
// gave it (or "Individual farmers (5)" when it was given to selected people), dropping down to the members who benefited. A distribution
// cannot be cancelled from here; a member's own record can be viewed, edited while that is allowed, or marked resolved.
//   url       the staff distributions list (interventions/.../distributions/)
//   noun      'farmers' | 'fisherfolk'
//   filters   { year, barangay, status, ... }: sent as they are, blanks left out;  version  bump to read the list again
//   onMemberAction(kind, member)   kind: 'view' | 'edit' | 'resolve'
const STATUS_LABELS = { PENDING: 'Pending', AWAITING_CONFIRMATION: 'Awaiting Confirmation', CONFIRMED: 'Confirmed', NOT_RECEIVED: 'Not Received', RESOLVED: 'Resolved' }
const SUMMARY_TONE = { 'Confirmed': 'green', 'Awaiting confirmation': 'amber', 'Needs follow-up': 'rose' }
const EDITABLE = new Set(['PENDING', 'AWAITING_CONFIRMATION', 'CONFIRMED'])
const PAGE_SIZE = 10

const COLUMNS = [
  { key: 'date_cell', label: 'Date Given' },
  { key: 'who_cell', label: 'Organization' },
  { key: 'assistance_type', label: 'Assistance Type' },
  { key: 'agencies_cell', label: 'Source Agency' },
  { key: 'quantity_cell', label: 'Quantity' },
  { key: 'summary_cell', label: 'Status' },
]

const formatDate = (v) => (v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${String(v).slice(0, 10)}T00:00:00`)) : '—')

function Members({ group, noun, onMemberAction }) {
  return (
    <div className="px-2 py-3 sm:px-4">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#4A5E4A]">
        {group.member_count} {group.member_count === 1 ? noun.replace(/s$/, '') : noun} who received this assistance
      </p>
      <div className="overflow-x-auto rounded-lg border border-[#E2E8E2] bg-white">
        <table className="min-w-full text-left text-[13px]">
          <thead className="bg-[#EBF5EE] text-[11px] uppercase tracking-wide text-[#4A5E4A]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Barangay</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F4F0]">
            {group.members.map((m) => (
              <tr key={m.record_id}>
                <td className="px-3 py-2 font-medium text-[#1A2B1A]">{m.name}</td>
                <td className="px-3 py-2 text-[#4A5E4A]">{m.barangay || '—'}</td>
                <td className="px-3 py-2"><StatusPill status={m.status}>{STATUS_LABELS[m.status] || m.status}</StatusPill></td>
                <td className="px-3 py-2 text-right">
                  <RowActions actions={[
                    { key: 'view', label: 'View', icon: Eye, onClick: () => onMemberAction('view', m) },
                    EDITABLE.has(m.status) && { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => onMemberAction('edit', m) },
                    m.status === 'NOT_RECEIVED' && { key: 'resolve', label: 'Mark Resolved', icon: CheckCircle2, onClick: () => onMemberAction('resolve', m) },
                  ]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DistributionsTable({ url, noun, filters, version = 0, onMemberAction, emptyText }) {
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState(null)
  const [state, setState] = useState({ key: null, count: 0, results: [], failed: false })
  const latest = useRef(0)

  const filterKey = JSON.stringify(filters)
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (lastFilterKey !== filterKey) { setLastFilterKey(filterKey); setPage(1) }   // another filter starts again from page 1

  const key = `${filterKey}|${page}|${version}`
  const isLoading = state.key !== key

  const load = useCallback(() => {
    const request = ++latest.current
    const params = { page }
    Object.entries(JSON.parse(filterKey)).forEach(([k, v]) => { if (v !== '' && v != null) params[k] = v })
    api.get(url, { params })
      .then((r) => { if (request === latest.current) setState({ key, count: r.data.count || 0, results: r.data.results || [], failed: false }) })
      .catch(() => { if (request === latest.current) setState({ key, count: 0, results: [], failed: true }) })
  }, [url, page, filterKey, key])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => state.results.map((g) => ({
    ...g,
    date_cell: formatDate(g.date_given),
    who_cell: (
      <span className="inline-flex items-center gap-1.5 font-medium text-[#1A2B1A]">
        <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-[#7A8E7A] transition-transform ${openId === g.id ? 'rotate-180' : ''}`} />
        {distributionRowLabel(g, noun)}
      </span>
    ),
    agencies_cell: <span title={(g.source_agencies || []).join(', ')}>{agenciesText(g.source_agencies)}</span>,
    quantity_cell: formatAssistanceQuantity(g.assistance_type, g.quantity) || '—',
    summary_cell: <StatusPill tone={SUMMARY_TONE[g.summary_status] || 'slate'}>{g.summary_status}</StatusPill>,
    name_title: distributionRowLabel(g, noun),
  })), [state.results, noun, openId])

  if (state.failed && !isLoading) return <ErrorMessage message="Failed to load the assistance records." />

  return (
    <>
      <DataTable
        columns={COLUMNS}
        data={isLoading ? [] : rows}
        isLoading={isLoading}
        cardColumns={2}
        phoneTitleKey="name_title"
        phoneSubtitleKey="date_cell"
        expandedRowId={openId}
        rowClickLabel={(r) => `Show the ${noun} who received this assistance from ${r.name_title}`}
        onRowClick={(r) => setOpenId((id) => (id === r.id ? null : r.id))}
        renderExpanded={(r) => <Members group={r} noun={noun} onMemberAction={onMemberAction} />}
        renderExpandedMobile={(r) => <Members group={r} noun={noun} onMemberAction={onMemberAction} />}
        phoneOpenLabel="Show who received it"
        emptyState={<p className="px-4 py-10 text-center text-[13px] text-[#7A8E7A]">{emptyText || 'No assistance has been given yet.'}</p>}
      />
      <PaginationBar page={page} totalCount={state.count} pageSize={PAGE_SIZE} onPageChange={(p) => { setOpenId(null); setPage(p) }} />
    </>
  )
}
