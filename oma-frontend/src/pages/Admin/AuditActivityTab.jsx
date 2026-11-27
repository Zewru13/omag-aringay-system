import { useEffect, useState } from 'react'
import { Bot, History } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import EmptyState from '../../components/UI/EmptyState.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { DATE_FILTER_LABEL } from '../../components/UI/DateRangeFields.jsx'
import AuditEntryWindow from './AuditEntryWindow.jsx'
import NumberedPages from './NumberedPages.jsx'
import { ACTION_OPTIONS, MODULE_OPTIONS, historyLink, rowPerson } from './auditLog.js'

// The All Activity tab: every action, newest first, with a search, the filters and numbered pages. A row opens its details; a row
// about exactly one farmer, fisherfolk or cooperative also links to that history.
const PAGE_SIZE = 10
const NO_FILTERS = { module: '', action: '', from: '', to: '' }
const SELECT_LABEL = 'flex items-center gap-1.5 text-[13px] text-[#4A5E4A] max-md:grid max-md:w-full max-md:grid-cols-[7.5rem_minmax(0,1fr)]'
const HEAD = 'px-4 py-[11px] text-[11px] font-semibold uppercase tracking-[0.06em] text-white'

function formatTimestamp(ts) {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts))
}

// Entries attributed to the shared system/automation account: a save made outside a request (a command or a script).
function SystemUserBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F0F4F0] px-2.5 py-1 text-[12px] font-medium text-[#5A6B5C]">
      <Bot size={13} aria-hidden="true" />
      System / Automation
    </span>
  )
}

function Who({ user }) {
  if (user?.is_system) return <SystemUserBadge />
  if (!user) return <p className="text-[13px] italic text-[#A8BCA8]">System</p>
  return (
    <>
      <p className="break-words text-[13px] font-medium text-[#1A2B1A]">{user.full_name || user.email}</p>
      {user.role && <p className="text-[12px] text-[#7A8E7A]">{user.role}</p>}
    </>
  )
}

// A click here goes to the history; it must not also open the entry behind it.
function HistoryLink({ entry }) {
  const person = rowPerson(entry)
  if (!person) return null
  return (
    <Link to={historyLink(person)} onClick={(e) => e.stopPropagation()} aria-label={`View history of ${person.name}`}
      className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium text-[#1B4D2E] hover:underline max-md:min-h-[44px]">
      <History size={12} aria-hidden="true" /> View history
    </Link>
  )
}

export default function AuditActivityTab() {
  const [typed, setTyped] = useState('')            // what is in the search box
  const [search, setSearch] = useState('')          // what is asked for, once typing stops
  const [filters, setFilters] = useState(NO_FILTERS)
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)         // Retry
  const [answer, setAnswer] = useState({ key: null, entries: [], total: 0, error: '' })
  const [opened, setOpened] = useState(null)        // the entry shown in the details window

  useEffect(() => {
    if (typed.trim() === search) return undefined
    const timer = setTimeout(() => { setSearch(typed.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [typed, search])

  const params = new URLSearchParams({ page: String(page) })
  if (search) params.set('search', search)
  if (filters.module) params.set('module', filters.module)
  if (filters.action) params.set('action', filters.action)
  if (filters.from) params.set('date_from', filters.from)
  if (filters.to) params.set('date_to', filters.to)
  const query = params.toString()
  const key = `${query}#${attempt}`

  useEffect(() => {
    let current = true                              // a late answer to an older question is ignored
    api.get(`/auditlog/?${query}`)
      .then(({ data }) => {
        if (current) setAnswer({ key, entries: data.results ?? data, total: data.count ?? 0, error: '' })
      })
      .catch((err) => {
        const detail = err.response?.data?.detail || err.message || 'Unknown server error'
        if (current) setAnswer({ key, entries: [], total: 0, error: `Unable to load audit log. ${detail}` })
      })
    return () => { current = false }
  }, [query, key])

  const isLoading = answer.key !== key
  const { entries, total, error } = answer
  const set = (name) => (e) => { const { value } = e.target; setFilters((f) => ({ ...f, [name]: value })); setPage(1) }

  // A phone card opens its entry with the finger or the keyboard. In the table the whole row can be clicked, and the description is
  // the button the keyboard reaches.
  const opens = (entry) => ({
    role: 'button', tabIndex: 0, onClick: () => setOpened(entry),
    onKeyDown: (e) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpened(entry) }
    },
    'aria-label': `Open the entry: ${entry.object_repr}`,
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-[#1A2B1A]">All Activity</h2>
        <p className="text-[13px] text-[#4A5E4A]">Every action in the system, newest first: who did it, what they did, and to whom.</p>
      </div>
      <FilterPanel
        className=""
        search={typed}
        onSearchChange={setTyped}
        searchPlaceholder="Search a name or what happened…"
        activeCount={Object.values(filters).filter(Boolean).length}
        onReset={() => { setFilters(NO_FILTERS); setPage(1) }}
      >
        <label className={SELECT_LABEL}>
          Module
          <select className={baseInputClasses} value={filters.module} onChange={set('module')}>
            {MODULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className={SELECT_LABEL}>
          Action
          <select className={baseInputClasses} value={filters.action} onChange={set('action')}>
            {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className={DATE_FILTER_LABEL}>
          From Date
          <input className={baseInputClasses} type="date" value={filters.from} max={filters.to || undefined} onChange={set('from')} />
        </label>
        <label className={DATE_FILTER_LABEL}>
          To Date
          <input className={baseInputClasses} type="date" value={filters.to} min={filters.from || undefined} onChange={set('to')} />
        </label>
      </FilterPanel>

      {isLoading && <LoadingSpinner message="Loading audit log..." />}
      {!isLoading && error && <ErrorMessage message={error} onRetry={() => setAttempt((n) => n + 1)} />}
      {!isLoading && !error && entries.length === 0 && <EmptyState message="No audit log entries found." />}

      {!isLoading && !error && entries.length > 0 && (
        <>
          {/* Phone cards */}
          <div className="block space-y-3 md:hidden">
            {entries.map((entry) => (
              <div key={entry.id} {...opens(entry)}
                className="cursor-pointer rounded-xl border border-[#E2E8E2] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] active:bg-[#F9FAF9]">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#7A8E7A]">
                  <p>{formatTimestamp(entry.timestamp)}</p>
                  <p>{entry.module || '—'}</p>
                </div>
                <p className="mt-2 break-words text-[13px] font-semibold text-[#1A2B1A]">{entry.object_repr}</p>
                <div className="mt-2"><Who user={entry.user} /></div>
                <HistoryLink entry={entry} />
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="hidden overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-[#1B4D2E]">
                  <tr>
                    <th className={`${HEAD} whitespace-nowrap`}>Date &amp; Time</th>
                    <th className={HEAD}>Who</th>
                    <th className={HEAD}>What Happened</th>
                    <th className={HEAD}>Module</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} onClick={() => setOpened(entry)}
                      className="cursor-pointer border-b border-[#F0F4F0] hover:bg-[#F9FAF9] focus-within:bg-[#F0F4F0]">
                      <td className="whitespace-nowrap px-4 py-[13px] text-[13px] text-[#7A8E7A]">{formatTimestamp(entry.timestamp)}</td>
                      <td className="px-4 py-[13px]"><Who user={entry.user} /></td>
                      <td className="px-4 py-[13px] text-[13px] text-[#4A5E4A]">
                        {/* the click reaches the row, which opens the entry */}
                        <button type="button" className="mr-2 cursor-pointer break-words text-left hover:underline">
                          {entry.object_repr}
                        </button>
                        <HistoryLink entry={entry} />
                      </td>
                      <td className="px-4 py-[13px] text-[12px] text-[#7A8E7A]">{entry.module || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {!isLoading && !error && <NumberedPages page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
      {opened && <AuditEntryWindow entry={opened} onClose={() => setOpened(null)} />}
    </div>
  )
}
