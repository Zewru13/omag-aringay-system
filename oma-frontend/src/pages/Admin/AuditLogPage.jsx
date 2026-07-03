import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import EmptyState from '../../components/UI/EmptyState.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'

const MODEL_OPTIONS = [
  { label: 'All Models', value: '' },
  { label: 'Farmer', value: 'Farmer' },
  { label: 'Farm Parcel', value: 'FarmParcel' },
  { label: 'Fisherfolk', value: 'Fisherfolk' },
  { label: 'Intervention Program', value: 'InterventionProgram' },
  { label: 'Beneficiary Record', value: 'BeneficiaryRecord' },
  { label: 'Fisherfolk Beneficiary', value: 'FisherfolkBeneficiaryRecord' },
  { label: 'Harvest Record', value: 'HarvestRecord' },
  { label: 'User', value: 'User' },
]

const ACTION_OPTIONS = [
  { label: 'All Actions', value: '' },
  { label: 'Create', value: 'CREATE' },
  { label: 'Update', value: 'UPDATE' },
  { label: 'Delete', value: 'DELETE' },
]

const ACTION_TONE = { CREATE: 'green', UPDATE: 'blue', DELETE: 'rose' }

function formatTimestamp(ts) {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts))
}

function AuditLogPage() {
  const [entries, setEntries] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const [modelName, setModelName] = useState('')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrev, setHasPrev] = useState(false)

  const PAGE_SIZE = 20

  const load = async (currentPage = 1) => {
    setIsLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', currentPage)
      if (modelName) params.set('model_name', modelName)
      if (action) params.set('action', action)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)

      const response = await api.get(`/auditlog/?${params.toString()}`)
      const data = response.data
      setEntries(data.results ?? data)
      setTotalCount(data.count ?? (data.results?.length ?? 0))
      setHasNext(Boolean(data.next))
      setHasPrev(Boolean(data.previous))
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Unknown server error'
      setError(`Unable to load audit log. ${detail}`)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    load(1)
  }, [modelName, action, dateFrom, dateTo])

  const goToPage = (newPage) => {
    setPage(newPage)
    load(newPage)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const hasFilters = modelName || action || dateFrom || dateTo

  return (
    <PageLayout title="Audit Log" subtitle="Track all user actions and system activity">
      <div className="space-y-5">
        {/* Filter bar */}
        <div className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label className="text-[12px] font-medium text-[#4A5E4A]">Model</label>
              <select
                className={baseInputClasses}
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
              >
                {MODEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label className="text-[12px] font-medium text-[#4A5E4A]">Action</label>
              <select
                className={baseInputClasses}
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label className="text-[12px] font-medium text-[#4A5E4A]">Date From</label>
              <input
                className={baseInputClasses}
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label className="text-[12px] font-medium text-[#4A5E4A]">Date To</label>
              <input
                className={baseInputClasses}
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            {hasFilters && (
              <Button
                className="self-end"
                onClick={() => { setModelName(''); setAction(''); setDateFrom(''); setDateTo('') }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {isLoading && <LoadingSpinner message="Loading audit log..." />}
        {!isLoading && error && <ErrorMessage message={error} onRetry={() => load(page)} />}
        {!isLoading && !error && entries.length === 0 && (
          <EmptyState message="No audit log entries found." />
        )}

        {!isLoading && !error && entries.length > 0 && (
          <>
            {/* Mobile cards */}
            <div className="block space-y-3 md:hidden">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-[#E2E8E2] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <StatusPill tone={ACTION_TONE[entry.action] || 'slate'}>
                      {entry.action}
                    </StatusPill>
                    <p className="text-[12px] text-[#7A8E7A]">{formatTimestamp(entry.timestamp)}</p>
                  </div>
                  <p className="mt-2 text-[13px] font-semibold text-[#1A2B1A]">{entry.object_repr}</p>
                  <div className="mt-2 space-y-0.5 text-[12px] text-[#4A5E4A]">
                    <p><span className="font-medium">Model:</span> {entry.model_name}</p>
                    <p>
                      <span className="font-medium">User:</span>{' '}
                      {entry.user
                        ? (entry.user.full_name || entry.user.email)
                        : <span className="italic text-[#A8BCA8]">System</span>
                      }
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-[#1B4D2E]">
                    <tr>
                      <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-[0.06em] text-white whitespace-nowrap">Date / Time</th>
                      <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-[0.06em] text-white">User</th>
                      <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-[0.06em] text-white">Action</th>
                      <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-[0.06em] text-white">Model</th>
                      <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-[0.06em] text-white">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id} className="border-b border-[#F0F4F0] hover:bg-[#F9FAF9]">
                        <td className="whitespace-nowrap px-4 py-[13px] text-[13px] text-[#7A8E7A]">
                          {formatTimestamp(entry.timestamp)}
                        </td>
                        <td className="px-4 py-[13px]">
                          {entry.user ? (
                            <>
                              <p className="text-[13px] font-medium text-[#1A2B1A]">
                                {entry.user.full_name}
                              </p>
                              {entry.user.email && (
                                <p className="text-[12px] text-[#7A8E7A]">{entry.user.email}</p>
                              )}
                            </>
                          ) : (
                            <p className="text-[13px] italic text-[#A8BCA8]">System</p>
                          )}
                        </td>
                        <td className="px-4 py-[13px]">
                          <StatusPill tone={ACTION_TONE[entry.action] || 'slate'}>
                            {entry.action}
                          </StatusPill>
                        </td>
                        <td className="whitespace-nowrap px-4 py-[13px] text-[13px] text-[#1A2B1A]">
                          {entry.model_name}
                        </td>
                        <td className="px-4 py-[13px] text-[13px] text-[#4A5E4A]">{entry.object_repr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between rounded-xl border border-[#E2E8E2] bg-white px-4 py-3">
              <p className="text-[13px] text-[#4A5E4A]">
                Page {page} of {totalPages}
                {totalCount > 0 && (
                  <span className="ml-2 text-[#7A8E7A]">({totalCount} entries)</span>
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={!hasPrev}
                  onClick={() => goToPage(page - 1)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Previous
                </Button>
                <Button
                  disabled={!hasNext}
                  onClick={() => goToPage(page + 1)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </PageLayout>
  )
}

export default AuditLogPage
