import { useMemo, useState } from 'react'
import { Check, ChevronDown, PackageCheck, X } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { groupLoansByBorrower, loanMatches } from '../../utils/borrowerGroups.js'
import { loanStatusLabel } from '../../utils/equipmentLoans.js'
import { filterOptions, filterOrgItems } from '../../utils/orgListFilter.js'

// An organization's borrowed equipment: one row per person (name and a short summary), which opens in place onto
// that person's items. Every item has its own buttons, so each request is decided and each return confirmed one by one.
// Same search and filter bar as the other organization lists; the filters narrow the items inside each person.
//   loans: the equipment-loans endpoint's rows. onApprove / onReject / onReturn(loan): what the buttons do.
//   busyId: the loan id being approved right now (its buttons wait).

const TONE = { REQUESTED: 'amber', BORROWED: 'teal', RETURN_PENDING: 'amber', RETURNED: 'green', REJECTED: 'slate', CANCELLED: 'slate' }
const SELECT = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none'
const ACTION = 'min-h-10 whitespace-nowrap'

const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(String(value).length > 10 ? value : `${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

function Fact({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 text-[12.5px]">
      <dt className="text-[#7A8E7A]">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-[#1A2B1A]">{children}</dd>
    </div>
  )
}

function LoanItem({ loan, busy, onApprove, onReject, onReturn }) {
  const status = loan.overdue ? 'Overdue' : loanStatusLabel(loan.status)
  const out = loan.status === 'BORROWED' || loan.status === 'RETURN_PENDING'
  const closed = !out && loan.status !== 'REQUESTED'
  return (
    <li className={`px-4 py-3 ${closed ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[14px] font-medium text-[#1A2B1A]">
          {loan.quantity} × {loan.equipment_name}
        </p>
        <StatusPill tone={loan.overdue ? 'rose' : TONE[loan.status]}>{status}</StatusPill>
      </div>
      <dl className="mt-2 space-y-1">
        <Fact label="Asked by">{loan.origin === 'MEMBER' ? 'The member' : 'The organization'}</Fact>
        {loan.borrowed_at && <Fact label="Borrowed">{formatDate(loan.borrowed_at)}</Fact>}
        {out && <Fact label="Return by">{formatDate(loan.due_date)}</Fact>}
        {loan.status === 'RETURN_PENDING' && <Fact label="Member says returned">{formatDate(loan.return_requested_at)}</Fact>}
        {loan.member_note && <Fact label="Member note">{loan.member_note}</Fact>}
        {loan.reject_reason && <Fact label="Reason">{loan.reject_reason}</Fact>}
        {loan.status === 'RETURNED' && (
          <>
            <Fact label="Returned">{formatDate(loan.returned_at)}</Fact>
            <Fact label="Came back as">{Object.entries(loan.return_breakdown || {}).map(([c, q]) => `${q} ${c}`).join(', ') || '—'}</Fact>
          </>
        )}
      </dl>
      {(loan.status === 'REQUESTED' || out) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {loan.status === 'REQUESTED' && (
            <>
              <Button type="button" size="sm" variant="outline" icon={Check} disabled={busy} className={`${ACTION} !text-[#1B4D2E]`} onClick={() => onApprove(loan)}>
                Approve
              </Button>
              <Button type="button" size="sm" variant="outline" icon={X} disabled={busy} className={`${ACTION} !border-rose-200 !text-rose-600 hover:!bg-rose-50`} onClick={() => onReject(loan)}>
                Reject
              </Button>
            </>
          )}
          {out && (
            <Button type="button" size="sm" variant="outline" icon={PackageCheck} className={`${ACTION} !text-[#1B4D2E]`} onClick={() => onReturn(loan)}>
              Mark returned
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

export default function BorrowerList({ loans, onApprove, onReject, onReturn, busyId = null, pageSize = 30 }) {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState({})
  const [openIds, setOpenIds] = useState(() => new Set())
  const [visible, setVisible] = useState(pageSize)

  const groups = useMemo(() => {
    const filtered = loans.filter((loan) => loanMatches(loan, chosen))
    return filterOrgItems(groupLoansByBorrower(filtered), { query })
  }, [loans, chosen, query])
  const everyone = useMemo(() => groupLoansByBorrower(loans).length, [loans])

  const asItems = loans.map((loan) => ({ id: loan.id, attrs: { status: loanStatusLabel(loan.status), equipment: loan.equipment_name } }))
  const choices = (key) => filterOptions(asItems, key).map((value) => ({ value, label: value }))
  const filters = [
    { key: 'status', label: 'Status', allLabel: 'All statuses', options: choices('status') },
    { key: 'overdue', label: 'Overdue', allLabel: 'Overdue or not', options: loans.some((l) => l.overdue) ? [{ value: 'Overdue only', label: 'Overdue only' }] : [] },
    { key: 'equipment', label: 'Equipment', allLabel: 'All equipment', options: choices('equipment') },
  ].filter((f) => f.options.length > 0)
  const activeCount = Object.values(chosen).filter(Boolean).length

  const setFilter = (key) => (e) => { setChosen((c) => ({ ...c, [key]: e.target.value })); setVisible(pageSize) }
  const clear = () => { setChosen({}); setQuery(''); setVisible(pageSize) }
  const toggle = (id) => setOpenIds((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  if (loans.length === 0) {
    return <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">Nothing has been borrowed yet.</p>
  }

  const shown = groups.slice(0, visible)
  return (
    <div className="max-w-3xl space-y-3">
      <FilterPanel
        search={query} onSearchChange={(v) => { setQuery(v); setVisible(pageSize) }} searchPlaceholder="Search member..."
        activeCount={activeCount + (query.trim() ? 1 : 0)} className=""
      >
        {filters.map((f) => (
          <select key={f.key} className={SELECT} value={chosen[f.key] || ''} onChange={setFilter(f.key)} aria-label={f.label}>
            <option value="">{f.allLabel}</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {(activeCount > 0 || query.trim()) && (
          <button type="button" onClick={clear} className="text-[13px] font-medium text-[#1E5637] hover:underline">Clear filters</button>
        )}
      </FilterPanel>

      <p className="text-[12px] text-[#7A8E7A]" data-testid="list-count">
        {groups.length === everyone ? `${everyone} ${everyone === 1 ? 'person' : 'people'} in total` : `${groups.length} of ${everyone} shown`}
      </p>

      {groups.length === 0 ? (
        <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">Nothing matches your search or filters.</p>
      ) : (
        <ul className="divide-y divide-[#EEF2EE] overflow-hidden rounded-xl border border-[#E2E8E2] bg-white" data-testid="borrower-list">
          {shown.map((group) => {
            const open = openIds.has(group.id)
            const panelId = `borrower-${group.id.replace(/[^a-z0-9]/gi, '-')}`
            return (
              <li key={group.id}>
                <button
                  type="button" onClick={() => toggle(group.id)} aria-expanded={open} aria-controls={panelId}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F5F7F5]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-[#1A2B1A]">{group.name}</span>
                    <span className="block truncate text-[12px] text-[#7A8E7A]">{group.summary}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {group.needsAction && <StatusPill tone="amber">Needs action</StatusPill>}
                    <ChevronDown size={16} className={`text-[#A8BCA8] transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </span>
                </button>
                {open && (
                  <ul id={panelId} className="divide-y divide-[#EEF2EE] border-t border-[#EEF2EE] bg-[#FAFBFA]">
                    {group.loans.map((loan) => (
                      <LoanItem
                        key={loan.id} loan={loan} busy={busyId === loan.id}
                        onApprove={onApprove} onReject={onReject} onReturn={onReturn}
                      />
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {groups.length > visible && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => setVisible((v) => v + pageSize)}>
            Show more ({groups.length - visible} left)
          </Button>
        </div>
      )}
    </div>
  )
}
