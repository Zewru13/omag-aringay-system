import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Download, Eye, Pencil, Printer, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadSpecReport, printSpecReport } from '../../utils/specActions.js'
import { buildDistributionRecordSpec } from './assistanceHistoryReport.js'
import { assistanceTypeText, formatAssistanceQuantity } from './assistanceFieldHelpers.js'
import { EDITABLE_STATUSES, STATUS_LABELS, SUMMARY_TONE, canRemove, extractErrorMessage, timeText } from './assistanceStatus.js'
import { agenciesText, distributionRowLabel } from './distributionsTableRows.js'

// The staff view of assistance on the Crop and Fisheries Assistance pages: one row per distribution, named after the cooperative it went to
// (or the farmers / fisherfolk themselves when it was given to selected people), dropping down to the members given it. A member's own record
// can be viewed or corrected, and someone who has not claimed it can be taken off the list.
//   url       the staff distributions list (interventions/.../distributions/)
//   noun      'farmers' | 'fisherfolk'
//   filters   { year, barangay, status, ... }: sent as they are, blanks left out;  version  bump to read the list again
//   onMemberAction(kind, member)   kind: 'view' | 'edit'
//   reportDomain   'crop' | 'fisheries': gives every row a ⋮ menu with Print Report / Download Report of that one distribution and its recipients
const PAGE_SIZE = 10

const COLUMNS = [
  { key: 'date_cell', label: 'Date, Time and Place' },
  { key: 'who_cell', label: 'Given To' },
  { key: 'assistance_type', label: 'Assistance Type' },
  { key: 'agencies_cell', label: 'Source Agency' },
  { key: 'quantity_cell', label: 'Quantity' },
  { key: 'summary_cell', label: 'Status' },
]

const formatDate = (v) => (v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${String(v).slice(0, 10)}T00:00:00`)) : '—')

function Members({ group, noun, onMemberAction, onRemove }) {
  return (
    <div className="px-2 py-3 sm:px-4">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#4A5E4A]">
        {group.member_count} {group.member_count === 1 ? noun.replace(/s$/, '') : noun} given this assistance
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
                    EDITABLE_STATUSES.has(m.status) && { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => onMemberAction('edit', m) },
                    canRemove(m) && { key: 'remove', label: 'Remove (not claimed)', icon: Trash2, tone: 'rose', onClick: () => onRemove(m) },
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

export default function DistributionsTable({ url, noun, filters, version = 0, onMemberAction, emptyText, reportDomain = '' }) {
  const { showToast } = useToast()
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState(null)
  const [removing, setRemoving] = useState(null)   // the member being taken off a distribution
  const [isRemoving, setIsRemoving] = useState(false)
  const [removals, setRemovals] = useState(0)      // bumped after a removal, so the list is read again
  const [state, setState] = useState({ key: null, count: 0, results: [], failed: false })
  const latest = useRef(0)

  const filterKey = JSON.stringify(filters)
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (lastFilterKey !== filterKey) { setLastFilterKey(filterKey); setPage(1) }   // another filter starts again from page 1

  const key = `${filterKey}|${page}|${version}|${removals}`
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

  const reportOf = useCallback((g, action, failure) => async () => {
    try {
      await action(buildDistributionRecordSpec({ domain: reportDomain, noun, distribution: g }))
    } catch {
      showToast(failure, 'error')
    }
  }, [reportDomain, noun, showToast])

  const removeMember = async () => {
    setIsRemoving(true)
    try {
      const domain = noun === 'fisherfolk' ? 'fisheries' : 'crop'
      const { data } = await api.post('/interventions/assistance-removals/', { domain, record_ids: [removing.record_id] })
      if (data.removed?.length) showToast(`${removing.name} was removed from this distribution.`, 'success')
      else showToast(data.kept?.[0]?.reason || 'This entry stays on the list.', 'info')
      setRemoving(null)
      setRemovals((c) => c + 1)
    } catch (err) {
      showToast(extractErrorMessage(err, 'The entry could not be removed.'), 'error')
    } finally {
      setIsRemoving(false)
    }
  }

  const rows = useMemo(() => state.results.map((g) => ({
    ...g,
    date_cell: (
      <span className="block">
        <span className="block whitespace-nowrap">{formatDate(g.date_given)}{g.distribution_time ? `, ${timeText(g.distribution_time)}` : ''}</span>
        {g.distribution_place && <span className="block text-[12px] text-[#7A8E7A]">{g.distribution_place}</span>}
      </span>
    ),
    who_cell: (
      <span className="inline-flex items-center gap-1.5 font-medium text-[#1A2B1A]">
        <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-[#7A8E7A] transition-transform ${openId === g.id ? 'rotate-180' : ''}`} />
        {distributionRowLabel(g, noun)}
      </span>
    ),
    agencies_cell: <span title={(g.source_agencies || []).join(', ')}>{agenciesText(g.source_agencies)}</span>,
    assistance_type: assistanceTypeText(g),
    quantity_cell: formatAssistanceQuantity(g.assistance_type, g.quantity) || '—',
    summary_cell: <StatusPill tone={SUMMARY_TONE[g.summary_status] || 'slate'}>{g.summary_status}</StatusPill>,
    name_title: distributionRowLabel(g, noun),
    actions_cell: reportDomain ? (
      <RowActions actions={[
        { key: 'print', label: 'Print Report', icon: Printer, onClick: reportOf(g, printSpecReport, 'Failed to print the report.') },
        { key: 'download', label: 'Download Report', icon: Download, onClick: reportOf(g, downloadSpecReport, 'Failed to download the report.') },
      ]} />
    ) : null,
  })), [state.results, noun, openId, reportDomain, reportOf])

  if (state.failed && !isLoading) return <ErrorMessage message="Failed to load the assistance records." />

  return (
    <>
      <DataTable
        columns={reportDomain ? [...COLUMNS, { key: 'actions_cell', label: 'Actions' }] : COLUMNS}
        data={isLoading ? [] : rows}
        isLoading={isLoading}
        cardColumns={2}
        phoneTitleKey="name_title"
        phoneSubtitleKey="date_cell"
        expandedRowId={openId}
        rowClickLabel={(r) => `Show the ${noun} who received this assistance (${r.name_title})`}
        onRowClick={(r) => setOpenId((id) => (id === r.id ? null : r.id))}
        renderExpanded={(r) => <Members group={r} noun={noun} onMemberAction={onMemberAction} onRemove={setRemoving} />}
        renderExpandedMobile={(r) => <Members group={r} noun={noun} onMemberAction={onMemberAction} onRemove={setRemoving} />}
        phoneOpenLabel="Show who received it"
        emptyState={<p className="px-4 py-10 text-center text-[13px] text-[#7A8E7A]">{emptyText || 'No assistance has been given yet.'}</p>}
      />
      <PaginationBar page={page} totalCount={state.count} pageSize={PAGE_SIZE} onPageChange={(p) => { setOpenId(null); setPage(p) }} />
      {removing && (
        <ConfirmDialog
          title="Remove from this distribution?"
          message={removing.status === 'PENDING'
            ? `${removing.name} will no longer be given this assistance. If they have an account, they are told. The entry is kept for audit.`
            : `Use this when ${removing.name} did not claim the assistance. The entry is kept for audit but disappears from the list and reports.`}
          confirmLabel={isRemoving ? 'Removing…' : 'Remove'}
          onConfirm={removeMember}
          onCancel={() => { if (!isRemoving) setRemoving(null) }}
        />
      )}
    </>
  )
}
