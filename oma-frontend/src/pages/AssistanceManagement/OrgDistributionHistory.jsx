import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDateTime, formatStamp } from '../../utils/distributionHelpers.js'
import { SOURCE_AGENCY_OPTIONS } from './assistanceFieldHelpers.js'

// An organization's assistance history as distributions: one row per distribution, expandable to the members it went to.
// Used by the crop and the fisheries assistance pages in organization mode.

const DOMAINS = {
  crop: {
    url: '/interventions/my-org-distributions/',
    types: ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other'],
  },
  fisheries: {
    url: '/interventions/my-org-fisherfolk-distributions/',
    types: ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Cash Assistance', 'Equipment', 'Training', 'Other'],
  },
}

const STATUS_FILTERS = [
  { value: 'AWAITING_CONFIRMATION', label: 'Awaiting confirmation' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'needs-follow-up', label: 'Needs follow-up' },
  { value: 'PENDING', label: 'Scheduled (not yet due)' },
]
const MEMBER_STATUS_LABELS = {
  PENDING: 'Scheduled',
  AWAITING_CONFIRMATION: 'Awaiting confirmation',
  CONFIRMED: 'Confirmed',
  NOT_RECEIVED: 'Not received',
  RESOLVED: 'Resolved',
}
const SUMMARY_TONE = { 'Awaiting confirmation': 'amber', 'Needs follow-up': 'rose', Confirmed: 'green' }
const REMOVABLE = new Set(['PENDING', 'AWAITING_CONFIRMATION'])
const EMPTY_FILTERS = { status: '', assistance_type: '', date_from: '', date_to: '', source_agency: '' }

const SELECT = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none'

const removableCount = (item) => item.members.filter((m) => REMOVABLE.has(m.status)).length

function StatusCounts({ counts }) {
  const parts = Object.entries(counts || {}).filter(([, n]) => n > 0)
    .map(([status, n]) => `${n} ${(MEMBER_STATUS_LABELS[status] || status).toLowerCase()}`)
  return <span className="text-[12px] text-[#4A5A4C]">{parts.join(' · ')}</span>
}

// The members a distribution went to, with each one's status; shared by the table row and the phone card.
function MemberList({ item, onRemove }) {
  return (
    <ul className="divide-y divide-[#EEF2EE] rounded-lg border border-[#E2E8E2] bg-white" aria-label="Members in this distribution">
      {item.members.map((m) => (
        <li key={m.record_id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2">
          <span className="min-w-0 font-medium text-[#1A2B1A]">{m.name}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusPill status={m.status}>{MEMBER_STATUS_LABELS[m.status] || m.status}</StatusPill>
            {m.confirmed_at && <span className="text-[12px] text-[#7A8E7A]">{formatStamp(m.confirmed_at)}</span>}
            {REMOVABLE.has(m.status) && (
              <button type="button" onClick={() => onRemove(m)} className="text-[12px] font-semibold text-rose-700 hover:underline">
                Remove from the list
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function OrgDistributionHistory({ domain = 'crop', refreshKey = 0, onChanged }) {
  const config = DOMAINS[domain]
  const { showToast } = useToast()
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [memberInput, setMemberInput] = useState('')
  const [member, setMember] = useState('')
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(new Set())
  const [removing, setRemoving] = useState(null) // { item, member? }
  const [isBusy, setIsBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const handle = setTimeout(() => setMember(memberInput.trim()), 300)
    return () => clearTimeout(handle)
  }, [memberInput])

  const params = useMemo(() => {
    const p = { ...filters }
    if (member) p.member = member
    Object.keys(p).forEach((k) => { if (!p[k]) delete p[k] })
    return p
  }, [filters, member])

  // Loads on mount, on every filter change, when the page bumps refreshKey (a new distribution) and after a removal.
  useEffect(() => {
    let cancelled = false
    api.get(config.url, { params })
      .then((r) => { if (!cancelled) { setItems(Array.isArray(r.data) ? r.data : []); setError('') } })
      .catch(() => { if (!cancelled) setError('Failed to load the assistance history.') })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [config.url, params, refreshKey, reloadKey])

  const activeCount = Object.values(filters).filter(Boolean).length
  const filtersActive = activeCount > 0 || Boolean(member)
  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setMemberInput(''); setMember('') }
  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const confirmRemoval = async () => {
    const { item, member: one } = removing
    setIsBusy(true)
    try {
      // The row only lists the members that match the current filters, so remove exactly those (never the whole batch).
      const body = { domain, record_ids: one ? [one.record_id] : item.members.filter((m) => REMOVABLE.has(m.status)).map((m) => m.record_id) }
      const r = await api.post('/interventions/assistance-removals/', body)
      const { removed = [], kept = [] } = r.data
      showToast(
        `${removed.length} entr${removed.length === 1 ? 'y' : 'ies'} removed from the list`
          + (kept.length ? `; ${kept.length} stayed because the member already confirmed.` : '.'),
        removed.length ? 'success' : 'info',
      )
      setRemoving(null)
      setReloadKey((k) => k + 1)
      onChanged?.()
    } catch (err) {
      const data = err?.response?.data
      showToast((data && (data.detail || Object.values(data)[0]?.[0])) || 'The entries could not be removed.', 'error')
    } finally {
      setIsBusy(false)
    }
  }

  const removalMessage = () => {
    if (!removing) return ''
    if (removing.member) {
      return `${removing.member.name} will no longer receive this assistance. The entry is kept for audit but disappears from the list.`
    }
    const removable = removableCount(removing.item)
    const kept = removing.item.member_count - removable
    return `${removable} entr${removable === 1 ? 'y' : 'ies'} will be removed from the list and those members can no longer receive it.`
      + (kept ? ` ${kept} already confirmed or followed up and will stay.` : '')
      + (filtersActive ? ' Only the members shown by your filters are affected.' : '')
  }

  return (
    <div className="space-y-4">
      <FilterPanel
        search={memberInput} onSearchChange={setMemberInput} searchPlaceholder="Search member..."
        activeCount={activeCount + (member ? 1 : 0)}
      >
        <select className={SELECT} value={filters.status} onChange={setFilter('status')} aria-label="Status">
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className={SELECT} value={filters.assistance_type} onChange={setFilter('assistance_type')} aria-label="Assistance type">
          <option value="">All assistance types</option>
          {config.types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={SELECT} value={filters.source_agency} onChange={setFilter('source_agency')} aria-label="Source agency">
          <option value="">All source agencies</option>
          {SOURCE_AGENCY_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-[#4A5A4C]">
          From
          <input type="date" className={SELECT} value={filters.date_from} max={filters.date_to || undefined}
            onChange={setFilter('date_from')} aria-label="Date from" />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-[#4A5A4C]">
          To
          <input type="date" className={SELECT} value={filters.date_to} min={filters.date_from || undefined}
            onChange={setFilter('date_to')} aria-label="Date to" />
        </label>
        {(activeCount > 0 || member) && (
          <button type="button" onClick={clearFilters} className="text-[13px] font-medium text-[#1E5637] hover:underline">
            Clear filters
          </button>
        )}
      </FilterPanel>

      {error ? <ErrorMessage message={error} /> : (
        <>
        {/* Phone: one card per distribution, with labelled buttons. */}
        <div className="space-y-3 md:hidden" data-testid="distribution-cards">
          {isLoading && items.length === 0 && <p className="px-1 py-6 text-center text-[13px] text-[#7A8E7A]">Loading...</p>}
          {!isLoading && items.length === 0 && (
            <p className="rounded-xl border border-[#E2E8E2] bg-white px-4 py-6 text-center text-[13px] text-[#7A8E7A]">
              {activeCount || member ? 'No distributions match these filters.' : 'No assistance has been given yet.'}
            </p>
          )}
          {items.map((item) => {
            const isOpen = expanded.has(item.id)
            const removable = removableCount(item)
            return (
              <div key={item.id} className="rounded-xl border border-[#E2E8E2] bg-white p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1A2B1A]">{item.assistance_type || '—'}</p>
                    <p className="text-[12px] text-[#7A8E7A]">{formatDateTime(item.date_given, item.recorded_at)}</p>
                  </div>
                  <StatusPill tone={SUMMARY_TONE[item.summary_status] || 'slate'}>{item.summary_status}</StatusPill>
                </div>
                <p className="mt-2 text-[12px] text-[#4A5A4C]">
                  {item.member_count} member{item.member_count === 1 ? '' : 's'}
                  {item.quantity ? ` · ${item.quantity}` : ''}
                  {item.source_agencies?.length > 0 ? ` · ${item.source_agencies.join(', ')}` : ''}
                </p>
                <p className="mt-0.5"><StatusCounts counts={item.status_counts} /></p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" aria-expanded={isOpen} onClick={() => toggle(item.id)}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#C8D5C8] px-2 text-[12px] font-semibold text-[#1B4D2E] hover:bg-[#F0F4F0]">
                    {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                    {isOpen ? 'Hide members' : 'Show members'}
                  </button>
                  <button type="button" disabled={removable === 0} onClick={() => setRemoving({ item })}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-2 text-[12px] font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">
                    <Trash2 size={13} aria-hidden="true" /> Remove
                  </button>
                </div>
                {isOpen && <div className="mt-3"><MemberList item={item} onRemove={(m) => setRemoving({ item, member: m })} /></div>}
              </div>
            )
          })}
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white md:block">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="bg-[#1B4D2E] text-[11px] font-semibold uppercase tracking-wide text-white">
                <th className="w-8 px-3 py-3" aria-label="Expand" />
                <th className="px-3 py-3">Date and Time</th>
                <th className="px-3 py-3">Assistance</th>
                <th className="px-3 py-3">Quantity</th>
                <th className="px-3 py-3">Members</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[#7A8E7A]">Loading...</td></tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[#7A8E7A]">
                  {activeCount || member ? 'No distributions match these filters.' : 'No assistance has been given yet.'}
                </td></tr>
              )}
              {items.map((item) => {
                const isOpen = expanded.has(item.id)
                const removable = removableCount(item)
                return [
                  <tr key={item.id} className="cursor-pointer border-t border-[#EEF2EE] hover:bg-[#F5F7F5]"
                    onClick={() => toggle(item.id)} data-testid="distribution-row">
                    <td className="px-3 py-3 text-[#4A5A4C]">
                      <button type="button" aria-expanded={isOpen} aria-label={isOpen ? 'Hide members' : 'Show members'}
                        onClick={(e) => { e.stopPropagation(); toggle(item.id) }}>
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-[#1A2B1A]">{formatDateTime(item.date_given, item.recorded_at)}</td>
                    <td className="px-3 py-3">
                      <span className="font-medium text-[#1A2B1A]">{item.assistance_type || '—'}</span>
                      {item.source_agencies?.length > 0 && <span className="block text-[12px] text-[#7A8E7A]">{item.source_agencies.join(', ')}</span>}
                    </td>
                    <td className="px-3 py-3">{item.quantity || '—'}</td>
                    <td className="px-3 py-3">{item.member_count}</td>
                    <td className="px-3 py-3">
                      <StatusPill tone={SUMMARY_TONE[item.summary_status] || 'slate'}>{item.summary_status}</StatusPill>
                      <span className="mt-1 block"><StatusCounts counts={item.status_counts} /></span>
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      {/* Disabled (not hidden) once every member has confirmed: nothing is left to remove. */}
                      <RowActions alwaysMenu actions={[
                        { key: 'remove', label: removable === 0 ? 'Remove (all members confirmed)' : 'Remove from the list', icon: Trash2, tone: 'rose', disabled: removable === 0, onClick: () => setRemoving({ item }) },
                      ]} />
                    </td>
                  </tr>,
                  isOpen && (
                    <tr key={`${item.id}-members`} className="bg-[#F9FAF9]">
                      <td />
                      <td colSpan={6} className="px-3 py-3">
                        <MemberList item={item} onRemove={(m) => setRemoving({ item, member: m })} />
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {removing && (
        <ConfirmDialog
          title="Remove from the list?"
          message={removalMessage()}
          confirmLabel={isBusy ? 'Removing...' : 'Remove'}
          onConfirm={confirmRemoval}
          onCancel={() => { if (!isBusy) setRemoving(null) }}
        />
      )}
    </div>
  )
}
