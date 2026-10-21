import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import { groupChildParams, groupHeading, groupSummary } from './monitoringGroups.js'

// Crop Monitoring grouped by crop or by farmer. The groups come from the server (GET /production/monitoring/groups/, ten
// per page, with the same filters as the list); opening a group loads that group's own records from the ordinary list
// (ten at a time, "Show more" for the rest). The page supplies buildRow(record) so a record's cells and its action menu
// (record activity, view details, record harvest, report disaster) are exactly the ones used everywhere else on the page.
//   groupBy: 'crop' | 'farmer'    params: the list's filters (monitoringParams)    version: bump to reload after an action
//   columns / phoneTitleKey: for the records inside a group    onRecordsLoaded(records): e.g. to look up record locks

const GROUP_PAGE_SIZE = 10

export default function GroupedMonitoringTable({
  groupBy, params, version, columns, buildRow, phoneTitleKey, phoneSubtitleKey, onRecordsLoaded, emptyText = 'No monitoring records found',
}) {
  const [page, setPage] = useState(1)
  // What the last answer was for: while it differs from what is asked now, the table is loading.
  const [result, setResult] = useState({ key: null, groups: [], total: 0, error: '' })
  const [open, setOpen] = useState(() => new Set())
  const [children, setChildren] = useState({})   // group key -> { records, count, next, loading, error }
  const seq = useRef(0)
  const loaded = useRef(onRecordsLoaded)
  useEffect(() => { loaded.current = onRecordsLoaded }, [onRecordsLoaded])

  // The parent gives this component a new `key` when the grouping or a filter changes, so it starts again from the
  // first page with every group closed.
  const paramsKey = JSON.stringify(params)
  const askedKey = `${groupBy}|${paramsKey}|${page}|${version}`
  const { groups, total, error } = result
  const isLoading = result.key !== askedKey

  useEffect(() => {
    const mine = ++seq.current
    api.get('/production/monitoring/groups/', { params: { ...JSON.parse(paramsKey), group_by: groupBy, page } })
      .then((r) => { if (mine === seq.current) setResult({ key: askedKey, groups: r.data.results || [], total: r.data.count || 0, error: '' }) })
      .catch(() => { if (mine === seq.current) setResult({ key: askedKey, groups: [], total: 0, error: 'Failed to load crop monitoring records.' }) })
  }, [groupBy, paramsKey, page, version, askedKey])

  const loadChildren = useCallback(async (group, pageNumber = 1, append = false) => {
    const extra = groupChildParams(groupBy, group)
    if (!extra) return
    setChildren((prev) => ({ ...prev, [group.key]: { ...(prev[group.key] || { records: [], count: 0, next: null }), loading: true, error: '' } }))
    try {
      const r = await api.get('/production/monitoring/', { params: { ...params, ...extra, page: pageNumber } })
      const records = Array.isArray(r.data) ? r.data : (r.data.results || [])
      const count = Array.isArray(r.data) ? records.length : (r.data.count ?? records.length)
      const next = Array.isArray(r.data) ? null : (r.data.next ? pageNumber + 1 : null)
      setChildren((prev) => ({
        ...prev,
        [group.key]: { records: append ? [...(prev[group.key]?.records || []), ...records] : records, count, next, loading: false, error: '' },
      }))
      loaded.current?.(records)
    } catch {
      setChildren((prev) => ({ ...prev, [group.key]: { ...(prev[group.key] || { records: [], count: 0, next: null }), loading: false, error: 'Could not load these records.' } }))
    }
  }, [groupBy, params])

  // After an action (harvest recorded, activity added, ...) the open groups load again so their rows are current.
  useEffect(() => {
    if (version === 0) return
    groups.filter((g) => open.has(g.key)).forEach((g) => loadChildren(g, 1, false))
  }, [version]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (group) => {
    const willOpen = !open.has(group.key)
    setOpen((prev) => { const next = new Set(prev); if (willOpen) next.add(group.key); else next.delete(group.key); return next })
    if (willOpen && !children[group.key]) loadChildren(group, 1, false)
  }

  return (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-testid="grouped-monitoring-table">
        <div className="hidden bg-[#1B4D2E] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-white sm:block">
          {groupBy === 'farmer' ? 'Farmer' : 'Crop'}
        </div>
        {isLoading && <p className="px-4 py-8 text-center text-sm text-slate-500">Loading…</p>}
        {!isLoading && !error && groups.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-[14px] font-medium text-[#4A5E4A]">{emptyText}</p>
          </div>
        )}
        <ul className="divide-y divide-[#E2E8E2]">
          {!isLoading && groups.map((group) => {
            const isOpen = open.has(group.key)
            const child = children[group.key]
            const canOpen = Boolean(groupChildParams(groupBy, group))
            return (
              <li key={group.key}>
                <button
                  type="button"
                  disabled={!canOpen}
                  onClick={() => toggle(group)}
                  aria-expanded={isOpen}
                  className="grid min-h-[56px] w-full grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F5F7F5] focus-visible:bg-[#F5F7F5] focus-visible:outline-none disabled:cursor-default"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-[#1A2B1A]">{groupHeading(groupBy, group)}</span>
                    <span className="block truncate text-[12px] text-[#7A8E7A]">{groupSummary(group)}</span>
                  </span>
                  <ChevronDown size={18} className={`justify-self-end text-[#7A8E7A] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {isOpen && (
                  <div className="border-t border-[#E2E8E2] bg-[#F9FAF9] px-2 py-2 sm:px-4" data-testid="group-records">
                    {child?.error && <p className="px-2 py-3 text-sm text-rose-600">{child.error}</p>}
                    <DataTable
                      columns={columns}
                      data={(child?.records || []).map(buildRow)}
                      isLoading={!child || (child.loading && !child.records.length)}
                      phoneTitleKey={phoneTitleKey}
                      phoneSubtitleKey={phoneSubtitleKey}
                      emptyState={<p className="px-4 py-8 text-center text-sm text-slate-500">No records.</p>}
                    />
                    {child && child.next && (
                      <div className="flex justify-center pt-2">
                        <button type="button" disabled={child.loading}
                          onClick={() => loadChildren(group, child.next, true)}
                          className="min-h-[44px] rounded-lg border border-[#C8D5C8] bg-white px-4 text-[13px] font-semibold text-[#1B4D2E] hover:bg-[#F0F4F0] disabled:opacity-60">
                          {child.loading ? 'Loading…' : `Show more (${Math.max(child.count - child.records.length, 0)} left)`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      <PaginationBar page={page} totalCount={total} pageSize={GROUP_PAGE_SIZE} onPageChange={setPage} />
    </div>
  )
}
