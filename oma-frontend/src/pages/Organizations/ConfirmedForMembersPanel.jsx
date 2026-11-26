import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Download, Printer } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import PhotoLinks from '../../components/UI/PhotoLinks.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadSpecReport, printSpecReport } from '../../utils/specActions.js'
import { formatAssistanceQuantity } from '../AssistanceManagement/assistanceFieldHelpers.js'
import { agenciesText } from '../AssistanceManagement/distributionsTableRows.js'
import { assistanceName, confirmedReportSpec } from './confirmedAssistances.js'

// What this organization has confirmed for its members: the history behind the "Confirm for Members" action, one row per ASSISTANCE. A row
// opens to the members the organization confirmed for it (with their proof photos); the row menu prints or downloads the report of the whole
// assistance (bulk), and each member has a report of their own (individual). The confirmations are final (no staff approval), so this is a
// record, not a queue.

const PAGE_SIZE = 10

const COLUMNS = [
  { key: 'name_cell', label: 'Assistance' },
  { key: 'quantity_cell', label: 'Quantity' },
  { key: 'agencies_cell', label: 'Source Agency' },
  { key: 'given_cell', label: 'Date Given' },
  { key: 'confirmed_cell', label: 'Confirmed On' },
  { key: 'members_cell', label: 'Members' },
  { key: 'actions_cell', label: 'Actions' },
]

const fmtDate = (v) => (v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(String(v).length > 10 ? v : `${v}T00:00:00`)) : '—')

function Members({ group, noun, onReport }) {
  return (
    <div className="px-2 py-3 sm:px-4">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#4A5E4A]">
        {group.member_count} {group.member_count === 1 ? noun : `${noun}s`} confirmed by the cooperative
      </p>
      <div className="overflow-x-auto rounded-lg border border-[#E2E8E2] bg-white">
        <table className="min-w-full text-left text-[13px]">
          <thead className="bg-[#EBF5EE] text-[11px] uppercase tracking-wide text-[#4A5E4A]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">RSBSA No.</th>
              <th className="px-3 py-2">Barangay</th>
              <th className="px-3 py-2">Confirmed On</th>
              <th className="px-3 py-2">Confirmed By</th>
              <th className="px-3 py-2">Proof Photos</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F4F0]">
            {group.members.map((m) => (
              <tr key={m.request_id}>
                <td className="px-3 py-2 font-medium text-[#1A2B1A]">{m.name}</td>
                <td className="px-3 py-2 text-[#4A5E4A]">{m.rsbsa || '—'}</td>
                <td className="px-3 py-2 text-[#4A5E4A]">{m.barangay || '—'}</td>
                <td className="px-3 py-2 text-[#4A5E4A]">{fmtDate(m.confirmed_at)}</td>
                <td className="px-3 py-2 text-[#4A5E4A]">{m.confirmed_by || '—'}</td>
                <td className="px-3 py-2"><PhotoLinks photos={(m.photo_urls || []).map((url, i) => ({ id: `${m.request_id}-${i}`, url }))} /></td>
                <td className="px-3 py-2 text-right">
                  <RowActions actions={[
                    { key: 'print', label: 'Print Report', icon: Printer, onClick: () => onReport(group, m, printSpecReport, 'Failed to print the report.') },
                    { key: 'download', label: 'Download Report', icon: Download, onClick: () => onReport(group, m, downloadSpecReport, 'Failed to download the report.') },
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

export default function ConfirmedForMembersPanel({ type, organizationId: id, organizationName = '' }) {
  const { showToast } = useToast()
  const [page, setPage] = useState(1)
  const [state, setState] = useState({ key: '', count: 0, results: [], failed: false })
  const [openId, setOpenId] = useState(null)
  const key = `${type}:${id}:${page}`
  const isLoading = state.key !== key
  const domain = type === 'farmers' ? 'crop' : 'fisheries'
  const noun = type === 'farmers' ? 'farmer' : 'fisherfolk'

  useEffect(() => {
    let cancelled = false
    api.get(`/interventions/confirmed-for-members/${type}/${id}/assistances/`, { params: { page } })
      .then((r) => { if (!cancelled) setState({ key, count: r.data.count || 0, results: r.data.results || [], failed: false }) })
      .catch(() => { if (!cancelled) setState({ key, count: 0, results: [], failed: true }) })
    return () => { cancelled = true }
  }, [type, id, page, key])

  // Print or download a report: of the whole assistance (member omitted) or of one member.
  const report = useCallback(async (group, member, action, failure) => {
    try {
      await action(confirmedReportSpec({ domain, group, member, organizationName }))
    } catch {
      showToast(failure, 'error')
    }
  }, [domain, organizationName, showToast])

  const rows = useMemo(() => state.results.map((g) => ({
    ...g,
    name_title: assistanceName(g),
    name_cell: (
      <span className="inline-flex items-center gap-1.5 font-medium text-[#1A2B1A]">
        <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-[#7A8E7A] transition-transform ${openId === g.id ? 'rotate-180' : ''}`} />
        {assistanceName(g)}
      </span>
    ),
    quantity_cell: formatAssistanceQuantity(g.assistance_type, g.quantity) || '—',
    agencies_cell: <span title={(g.source_agencies || []).join(', ')}>{agenciesText(g.source_agencies)}</span>,
    given_cell: fmtDate(g.date_given),
    confirmed_cell: fmtDate(g.confirmed_at),
    members_cell: g.member_count,
    actions_cell: (
      <RowActions actions={[
        { key: 'print', label: 'Print Report', icon: Printer, onClick: () => report(g, null, printSpecReport, 'Failed to print the report.') },
        { key: 'download', label: 'Download Report', icon: Download, onClick: () => report(g, null, downloadSpecReport, 'Failed to download the report.') },
      ]} />
    ),
  })), [state.results, openId, report])

  if (state.failed && !isLoading) return <ErrorMessage message="Could not load the confirmation history." />

  return (
    <div className="space-y-3" data-testid="confirmed-for-members">
      <p className="text-[12px] text-[#7A8E7A]">
        {isLoading ? 'Loading…' : `${state.count} assistance${state.count === 1 ? '' : 's'} confirmed · newest first. Click one to see who was confirmed.`}
      </p>
      <DataTable
        columns={COLUMNS}
        data={isLoading ? [] : rows}
        isLoading={isLoading}
        cardColumns={2}
        phoneTitleKey="name_title"
        phoneSubtitleKey="confirmed_cell"
        expandedRowId={openId}
        rowClickLabel={(r) => `Show who was confirmed for ${r.name_title}`}
        onRowClick={(r) => setOpenId((current) => (current === r.id ? null : r.id))}
        renderExpanded={(r) => <Members group={r} noun={noun} onReport={report} />}
        renderExpandedMobile={(r) => <Members group={r} noun={noun} onReport={report} />}
        phoneOpenLabel="Show who was confirmed"
        emptyState={<p className="px-4 py-10 text-center text-[13px] text-[#7A8E7A]">Nothing confirmed for members yet. When this cooperative confirms assistance for its members, each assistance is listed here with who was confirmed and the proof photos.</p>}
      />
      <PaginationBar page={page} totalCount={state.count} pageSize={PAGE_SIZE} onPageChange={(p) => { setOpenId(null); setPage(p) }} />
    </div>
  )
}
