import { useEffect, useMemo, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { ACTIVITY_FILTERS, activityLogRows, filterActivityRows } from './cycleActivityLogs.js'
import { LogCell, LogHead, LogRow, LogTable, LogTh } from './LogFormTable.jsx'

// Activity Logs (the ⋮ menu of Fisheries Monitoring): every Feeding Log and Health Log saved for the row's production cycle, with its date, pond/cage,
// details and notes. Read-only. The logs are the cycle's own, read through the same endpoints (and the same access rules) as the Feeding Log and
// Health Log forms: staff see the cycle they open, a fisherfolk account only its own; nothing is created or duplicated here.
const listOf = (data) => (Array.isArray(data) ? data : data?.results || [])

export default function CycleActivityLogsModal({ record, onClose }) {
  const [state, setState] = useState({ status: 'loading', feeding: [], health: [] })
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    let alive = true
    const cycleId = record.production_cycle
    Promise.all([
      api.get(`/monitoring/aquaculture-cycles/${cycleId}/feeding/`),
      api.get(`/monitoring/aquaculture-cycles/${cycleId}/health/`),
    ])
      .then(([feeding, health]) => { if (alive) setState({ status: 'ok', feeding: listOf(feeding.data), health: listOf(health.data) }) })
      .catch(() => { if (alive) setState({ status: 'error', feeding: [], health: [] }) })
    return () => { alive = false }
  }, [record.production_cycle])

  const all = useMemo(() => activityLogRows({ feeding: state.feeding, health: state.health }), [state])
  const rows = filterActivityRows(all, filter)
  const cycleLabel = [record.production_cycle_no ? `Cycle #${record.production_cycle_no}` : null, record.production_cycle_name].filter(Boolean).join(' · ')
  const pill = (on) => `press-scale rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors max-md:min-h-9 ${on ? 'border-[#1B4D2E] bg-[#1B4D2E] text-white' : 'border-[#C8D5C8] bg-white text-[#4A5E4A] hover:bg-[#F0F4F0]'}`

  return (
    <ModalShell
      title="Activity Logs"
      subtitle={[record.fisherfolk_name, cycleLabel, record.species_name].filter(Boolean).join(' · ')}
      icon={ClipboardList}
      onClose={onClose}
      maxWidth="max-w-5xl"
    >
      {state.status === 'loading' && <LoadingSpinner />}
      {state.status === 'error' && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">The activity logs of this production cycle could not be loaded.</p>
      )}
      {state.status === 'ok' && (
        <div className="space-y-3" data-testid="activity-logs">
          <div className="flex flex-wrap items-center gap-2">
            {ACTIVITY_FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={pill(filter === f.key)}>
                {f.label}
                <span className="ml-1.5 opacity-70">{f.key === 'all' ? all.length : all.filter((r) => r.kind === f.key).length}</span>
              </button>
            ))}
            <span className="ml-auto text-[12px] text-[#7A8E7A]">{state.feeding.length} Feeding Log{state.feeding.length === 1 ? '' : 's'} · {state.health.length} Health Log{state.health.length === 1 ? '' : 's'}</span>
          </div>
          {rows.length === 0 ? (
            <p className="rounded-xl border border-[#E2E8E2] bg-white px-4 py-8 text-center text-[13px] italic text-[#7A8E7A]" data-testid="activity-logs-empty">
              {all.length === 0 ? 'No Feeding Log or Health Log has been recorded for this production cycle yet.' : 'No logs of this kind.'}
            </p>
          ) : (
            <LogTable label="Feeding Logs and Health Logs of the production cycle" testId="activity-logs-table">
              <LogHead>
                <LogTh>Date</LogTh><LogTh>Activity</LogTh><LogTh>Pond/Cage</LogTh><LogTh>Details</LogTh><LogTh>Notes</LogTh>
              </LogHead>
              <tbody>
                {rows.map((r) => (
                  <LogRow key={r.key} data-testid="activity-log-row">
                    <LogCell label="Date" className="whitespace-nowrap">{r.date}</LogCell>
                    <LogCell label="Activity">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.kind === 'health' ? 'bg-rose-50 text-rose-700' : 'bg-[#EBF5EE] text-[#1B4D2E]'}`}>{r.type}</span>
                    </LogCell>
                    <LogCell label="Pond/Cage" className="font-medium text-[#1A2B1A]">{r.unit}</LogCell>
                    <LogCell label="Details">
                      <span className="font-medium text-[#1A2B1A]">{r.summary}</span>
                      {r.details.length > 0 && (
                        <span className="block text-[12px] text-[#4A5E4A]">{r.details.map(([label, value]) => `${label}: ${value}`).join(' · ')}</span>
                      )}
                    </LogCell>
                    <LogCell label="Notes" className="text-[#4A5E4A]">{r.notes || '—'}</LogCell>
                  </LogRow>
                ))}
              </tbody>
            </LogTable>
          )}
        </div>
      )}
    </ModalShell>
  )
}
