import { useEffect, useState } from 'react'
import { UserSearch } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import NumberedPages from './NumberedPages.jsx'
import { historyLink } from './auditLog.js'
import { HISTORY_TABS, MATCH_LIMIT, pickerRows, pickerUrl } from './historyTabs.js'

// One history tab: search for a farmer, fisherfolk or cooperative, pick one, and read what is on record about them, newest first.
// Whom it shows is in the address (AuditLogPage), so a "View history" link opens it and Back returns.
const PAGE_SIZE = 10
const CARD = 'rounded-xl border border-[#E2E8E2] bg-white'
const COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'what', label: 'What Happened' },
  { key: 'module', label: 'Module' },
]

// the server sends a plain day (2026-05-01): read it as that day wherever the browser is
const formatDay = (day) => new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${day}T00:00:00Z`))

function Picker({ config, onPick }) {
  const [typed, setTyped] = useState('')
  const [found, setFound] = useState({ term: '', rows: [], error: '' })
  const term = typed.trim()

  useEffect(() => {
    if (term.length < 2) return undefined
    let current = true                              // a late answer to an older search is ignored
    const timer = setTimeout(() => {
      Promise.all(config.sources.map(({ url, kind }) => api.get(pickerUrl(url, term)).then(({ data }) => pickerRows(kind, data))))
        .then((lists) => { if (current) setFound({ term, rows: lists.flat().slice(0, MATCH_LIMIT), error: '' }) })
        .catch(() => { if (current) setFound({ term, rows: [], error: 'The search did not work. Check your connection and try again.' }) })
    }, 300)
    return () => { current = false; clearTimeout(timer) }
  }, [term, config])

  const answered = term.length >= 2 && found.term === term
  return (
    <div>
      <div className="flex items-center rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] focus-within:border-[#1B4D2E] focus-within:ring-2 focus-within:ring-[#1B4D2E]/10">
        <SearchBar value={typed} onChange={setTyped} placeholder={config.placeholder} />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {answered ? `${found.rows.length} match${found.rows.length === 1 ? '' : 'es'}` : ''}
      </p>
      {term.length >= 2 && !answered && <p className="mt-2 text-[13px] text-[#7A8E7A]">Searching…</p>}
      {answered && found.error && <p role="alert" className="mt-2 text-[13px] text-rose-600">{found.error}</p>}
      {answered && !found.error && found.rows.length === 0 && <p className="mt-2 text-[13px] text-[#7A8E7A]">No match. Check the spelling.</p>}
      {answered && found.rows.length > 0 && (
        <ul className="mt-2 max-h-72 divide-y divide-[#F0F4F0] overflow-y-auto rounded-lg border border-[#E2E8E2]">
          {found.rows.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <button type="button" onClick={() => { setTyped(''); onPick(row) }}
                className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-[#F5F7F5] max-md:min-h-[44px]">
                <span className="font-medium text-[#1A2B1A]">{row.name}</span>
                <span className="text-[12px] text-[#7A8E7A]">{row.note}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function History({ kind, id, onClear }) {
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState({ key: null, subject: null, rows: [], total: 0, error: '' })
  const key = `${page}#${attempt}`

  useEffect(() => {
    let current = true                              // a late answer for an earlier pick is ignored
    api.get(`/auditlog/history/${kind}/${id}/?page=${page}`)
      .then(({ data }) => { if (current) setAnswer({ key, subject: data.subject, rows: data.results, total: data.count, error: '' }) })
      .catch((err) => {
        const error = err.response?.data?.detail || 'This history could not be loaded.'
        if (current) setAnswer({ key, subject: null, rows: [], total: 0, error })
      })
    return () => { current = false }
  }, [kind, id, page, key])

  const { subject, rows, total, error } = answer
  const isLoading = answer.key !== key
  const another = <Button type="button" variant="outline" size="sm" onClick={onClear}>Pick another</Button>

  if (isLoading && !subject) return <LoadingSpinner message="Loading the history..." />
  if (!isLoading && error) {
    return (
      <div className="space-y-3">
        <ErrorMessage message={error} onRetry={() => setAttempt((n) => n + 1)} />
        {another}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className={`${CARD} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="break-words text-[15px] font-semibold text-[#1A2B1A]">{subject.name}</h3>
          {another}
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
          {subject.facts.map((fact) => (
            <div key={fact.label} className="flex gap-1.5">
              <dt className="text-[#7A8E7A]">{fact.label}:</dt>
              <dd className="break-words font-medium text-[#1A2B1A]">{fact.value || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
      <DataTable
        columns={COLUMNS}
        data={rows.map((row, i) => ({ id: i + 1, date: formatDay(row.date), what: row.what, module: row.module }))}
        isLoading={isLoading}
        phoneTitleKey="what"
        phoneSubtitleKey="date"
        emptyState={<p className="px-5 py-8 text-center text-sm text-slate-500">Nothing recorded yet.</p>}
      />
      <NumberedPages page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
    </div>
  )
}

export default function AuditHistoryTab({ tab, kind, id }) {
  const navigate = useNavigate()
  const config = HISTORY_TABS[tab]
  return (
    <div className="space-y-4">
      <section className={`${CARD} space-y-3 p-4`} aria-label={config.title}>
        <div>
          <h2 className="text-[15px] font-semibold text-[#1A2B1A]">{config.title}</h2>
          <p className="text-[13px] text-[#4A5E4A]">{config.intro}</p>
        </div>
        <Picker config={config} onPick={(row) => navigate(historyLink(row))} />
      </section>
      {id ? (
        <History key={`${kind}-${id}`} kind={kind} id={id} onClear={() => navigate(`/audit-log?tab=${tab}`)} />
      ) : (
        <div className={`${CARD} flex flex-col items-center gap-2 px-4 py-10 text-center`}>
          <UserSearch size={32} className="text-[#A8BCA8]" aria-hidden="true" />
          <p className="text-[13px] text-[#4A5E4A]">{config.empty}</p>
        </div>
      )}
    </div>
  )
}
