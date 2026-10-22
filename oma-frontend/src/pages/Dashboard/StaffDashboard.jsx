import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ClipboardCheck, Fish, MapPin, PackageX, Sprout, Wheat } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import HarvestComparisonCard from '../../components/dashboard/HarvestComparisonCard.jsx'
import { approvalLines, hasApproved } from '../../utils/approvalStatus.js'
import DashPanel from './DashPanel.jsx'
import DisasterTrendsCard from './DisasterTrendsCard.jsx'
import YieldVarianceCard from './YieldVarianceCard.jsx'

// The admin/evaluator dashboard, built to the approved staff reference
// ("New Dashboard base.docx", three frames), then rearranged into rows of equal-height cards that share one header style
// (DashPanel) so nothing leaves a gap:
//   sector cards -> disaster reports over time + season snapshot -> harvest against estimate (farmers, fisherfolk)
//   -> needs attention + pending change requests -> activity status by barangay.
//
// Everything here is fed by real endpoints. The per-domain activity counts, the
// per-barangay table, the sector totals and the yield variance all come from
// /production/dashboard/activity-status/, which reuses the same overdue/due/upcoming
// classifier the record detail screens use so the dashboard can never disagree with
// the screen it links to.
//
// ONE deliberate omission from the reference: its Activity Status table draws an
// "Assigned Evaluator" column. No staff-to-barangay assignment exists anywhere
// in this system, so the column is dropped rather than filled with invented
// names — agreed before building.

const num = (n) => (n ?? 0).toLocaleString()
const ROW = 'grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5'
// Phone order (lg and up keep the page order): sectors, attention, requests and activity, then the charts.
const PHONE_ORDER = { sectors: 'order-1', attention: 'order-2', lists: 'order-3', charts: 'order-4', pies: 'order-5' }
const LG_FLOW = 'lg:order-none'

// Sector card: a compact panel with two figures side by side.
function SectorCard({ tone, icon, title, primaryLabel, primaryValue, primaryNote,
                      secondaryLabel, secondaryValue, secondaryNote, isLoading }) {
  const accent = tone === 'crop' ? 'text-primary' : 'text-[color:var(--color-semantic-info)]'
  const figure = (label, value, note, highlight) => (
    <div className="min-w-0 px-4 py-3 md:px-5">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-[0.05em] text-text-muted">{label}</p>
      <p className="mt-1 text-[26px] font-bold leading-none tabular-nums text-text-primary">{isLoading ? '—' : num(value)}</p>
      <p className={`mt-1.5 text-[12px] ${highlight ? accent : 'text-text-muted'}`}>{note || ' '}</p>
    </div>
  )
  return (
    <DashPanel title={title} icon={icon} tone={tone}>
      <div className="grid flex-1 grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {figure(primaryLabel, primaryValue, primaryNote, primaryNote?.startsWith('+'))}
        {figure(secondaryLabel, secondaryValue, secondaryNote, false)}
      </div>
    </DashPanel>
  )
}

// The three-figure block inside the "Needs attention" panel.
function MonitoringBlock({ tone, icon: Icon, title, data, linkLabel, onLink, isLoading }) {
  const accent = tone === 'crop' ? 'text-primary' : 'text-[color:var(--color-semantic-info)]'
  const cell = (label, value, cls) => (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-[0.04em] text-text-muted">{label}</p>
      <p className={`mt-1 text-[24px] font-bold leading-none tabular-nums ${cls}`}>{isLoading ? '—' : num(value)}</p>
    </div>
  )
  return (
    <div className="flex min-w-0 flex-col px-4 py-4 md:px-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={14} className={accent} aria-hidden="true" />
        <h4 className={`text-[12px] font-bold uppercase tracking-[0.05em] ${accent}`}>{title}</h4>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {cell('Overdue', data?.overdue, 'text-[color:var(--color-semantic-critical)]')}
        {cell('Due today', data?.due_today, 'text-[color:var(--color-semantic-warning)]')}
        {cell('Upcoming', data?.upcoming, 'text-text-primary')}
      </div>
      <button
        type="button"
        onClick={onLink}
        className={`mt-auto flex min-h-[40px] items-center pt-2 ${accent} cursor-pointer transition-opacity hover:opacity-75`}
      >
        <span className="text-[12.5px]">{linkLabel} →</span>
      </button>
    </div>
  )
}

const TH = 'px-3 py-2.5 md:px-5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted'
const TD = 'px-3 py-3 md:px-5 text-[14px]'

export default function StaffDashboard({ user }) {
  const navigate = useNavigate()
  const [board, setBoard] = useState(null)
  const [requests, setRequests] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [tableDomain, setTableDomain] = useState('crop')
  const loadRequests = useCallback(() => {
    api.get('/staff/change-requests/', { params: { status: 'PENDING' } })
      .then((r) => setRequests(Array.isArray(r.data) ? r.data : r.data?.results || []))
      .catch(() => setRequests([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    api.get('/production/dashboard/activity-status/')
      .then((r) => { if (!cancelled) setBoard(r.data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false) })
    loadRequests()
    return () => { cancelled = true }
  }, [loadRequests])

  const decide = async (req, action) => {
    setBusyId(req.id)
    try {
      const body = action === 'reject' ? { rejection_reason: 'Rejected from dashboard review.' } : {}
      await api.post(`/staff/change-requests/${req.id}/${action}/`, body)
    } catch {
      // Someone else may have decided it first; the reload below shows where it stands.
    } finally {
      loadRequests()
      setBusyId(null)
    }
  }

  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const roleLabel = user?.role === 'ADMIN' ? 'Administrator view' : 'Focal Person view'
  const rows = board?.[tableDomain]?.by_barangay || []
  const variance = board?.yield_variance || []
  const fisheriesVariance = board?.fisheries_yield_variance || []
  const followUp = board?.not_received_count || {}

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="min-w-0">
        <h1 className="text-[20px] font-bold leading-tight text-text-primary md:text-[24px]">What needs attention today</h1>
        <p className="mt-1 text-[12.5px] text-text-muted md:text-[13px]">{today} · {roleLabel} · Aringay, La Union</p>
      </div>

      {/* ── Sector cards ────────────────────────────────────────────────── */}
      <div className={`grid grid-cols-2 gap-3 lg:gap-5 ${PHONE_ORDER.sectors} ${LG_FLOW}`}>
        <SectorCard
          tone="crop" icon={Sprout} title="Crop Sector" isLoading={isLoading}
          primaryLabel="Registered Farmers" primaryValue={board?.sectors?.crop?.registered}
          primaryNote={board ? `+${num(board.sectors.crop.new_this_month)} this month` : ''}
          secondaryLabel="Farmers Organizations" secondaryValue={board?.sectors?.crop?.organizations}
          secondaryNote="active & registered"
        />
        <SectorCard
          tone="fisheries" icon={Fish} title="Fisheries Sector" isLoading={isLoading}
          primaryLabel="Registered Fisherfolk" primaryValue={board?.sectors?.fisheries?.registered}
          primaryNote={board ? `+${num(board.sectors.fisheries.new_this_month)} this month` : ''}
          secondaryLabel="Fisherfolk Organizations" secondaryValue={board?.sectors?.fisheries?.organizations}
          secondaryNote="active & registered"
        />
      </div>

      {/* ── Disaster reports over time + season snapshot ───────────────── */}
      <div className={`${ROW} ${PHONE_ORDER.charts} ${LG_FLOW}`}>
        <DisasterTrendsCard />
        <YieldVarianceCard crop={variance} fisheries={fisheriesVariance} isLoading={isLoading} />
      </div>

      {/* ── Harvest compared with the estimate ─────────────────────────── */}
      <div className={`${ROW} ${PHONE_ORDER.pies} ${LG_FLOW}`}>
        <HarvestComparisonCard
          url="/farmers/harvest-comparison/" title="Farmers — Harvest vs Estimate"
          noun="farmers" nounOne="farmer" icon={Wheat} tone="crop"
        />
        <HarvestComparisonCard
          url="/fisheries/fisherfolk/harvest-comparison/" title="Fisherfolk — Harvest vs Estimate"
          noun="fisherfolk" nounOne="fisherfolk" icon={Fish} tone="fisheries"
        />
      </div>

      {/* ── Needs attention (and follow-up, when there are cases) ─────── */}
      <div className={`${(followUp.total || 0) > 0 ? ROW : 'grid grid-cols-1 gap-4'} ${PHONE_ORDER.attention} ${LG_FLOW}`}>
        <DashPanel title="Needs Attention — Activity Overdue" icon={AlertTriangle} tone="critical" subtitle="Crop and fisheries monitoring">
          <div className="grid flex-1 grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
            <MonitoringBlock
              tone="crop" icon={Sprout} title="Crop Monitoring" data={board?.crop} isLoading={isLoading}
              linkLabel="View crop activities" onLink={() => navigate('/crop-monitoring')}
            />
            <MonitoringBlock
              tone="fisheries" icon={Fish} title="Fisheries Monitoring" data={board?.fisheries} isLoading={isLoading}
              linkLabel="View fisheries activities" onLink={() => navigate('/fisheries-monitoring')}
            />
          </div>
        </DashPanel>

        {(followUp.total || 0) > 0 && (
          <DashPanel title="Needs Follow-up — Assistance Not Received" icon={PackageX} tone="critical" subtitle="Crop and fisheries assistance">
            <div className="grid flex-1 grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
              {[
                { key: 'crop', tone: 'crop', Icon: Sprout, title: 'Crop', value: followUp.crop, label: 'Review crop cases →', to: '/crop-assistance?tab=needs-follow-up' },
                { key: 'fisheries', tone: 'fisheries', Icon: Fish, title: 'Fisheries', value: followUp.fisheries, label: 'Review fisheries cases →', to: '/fisheries-assistance?tab=needs-follow-up' },
              ].map(({ key, tone, Icon, title, value, label, to }) => {
                const accent = tone === 'crop' ? 'text-primary' : 'text-[color:var(--color-semantic-info)]'
                return (
                  <div key={key} className="flex min-w-0 flex-col px-4 py-4 md:px-5">
                    <div className="mb-3 flex items-center gap-2">
                      <Icon size={14} className={accent} aria-hidden="true" />
                      <h4 className={`text-[12px] font-bold uppercase tracking-[0.05em] ${accent}`}>{title}</h4>
                    </div>
                    <p className="text-[24px] font-bold leading-none tabular-nums text-[color:var(--color-semantic-critical)]">{num(value)}</p>
                    <button type="button" onClick={() => navigate(to)}
                      className={`mt-auto flex min-h-[40px] items-center pt-2 ${accent} cursor-pointer transition-opacity hover:opacity-75`}>
                      <span className="text-[12.5px]">{label}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          </DashPanel>
        )}
      </div>

      {/* ── Activity status by barangay (left) and pending change requests (right) ── */}
      <div className={`${ROW} ${PHONE_ORDER.lists} ${LG_FLOW}`}>
        <DashPanel
          title="Barangay Activity Status" icon={MapPin}
          subtitle="Overdue, due today and upcoming"
          right={(
            <div className="flex shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border-strong">
              {[
                { key: 'crop', label: 'Crop', Icon: Sprout },
                { key: 'fisheries', label: 'Fisheries', Icon: Fish },
              ].map(({ key, label, Icon }) => (
                <button
                  key={key} type="button" onClick={() => setTableDomain(key)}
                  className={`flex min-h-[36px] cursor-pointer items-center gap-1.5 px-4 transition-colors ${
                    tableDomain === key ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:bg-surface-2'
                  }`}
                >
                  <Icon size={13} aria-hidden="true" />
                  <span className="text-[12.5px] font-semibold">{label}</span>
                </button>
              ))}
            </div>
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Barangay</th>
                  <th className={TH}>Overdue</th>
                  <th className={TH}>Due Today</th>
                  <th className={TH}>Upcoming</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td className={`${TD} italic text-text-muted`} colSpan={4}>
                    {isLoading ? 'Loading…' : 'No outstanding activities in any barangay.'}
                  </td></tr>
                ) : rows.map((r, i) => (
                  <tr key={r.barangay} className={i === rows.length - 1 ? '' : 'border-b border-border'}>
                    <td className={`${TD} text-text-primary`}>{r.barangay}</td>
                    <td className={`${TD} font-bold tabular-nums ${r.overdue ? 'text-[color:var(--color-semantic-critical)]' : 'text-text-muted'}`}>
                      {r.overdue || '—'}
                    </td>
                    <td className={`${TD} font-bold tabular-nums ${r.due_today ? 'text-[color:var(--color-semantic-warning)]' : 'text-text-muted'}`}>
                      {r.due_today || '—'}
                    </td>
                    <td className={`${TD} tabular-nums text-text-secondary`}>{r.upcoming || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashPanel>
        <DashPanel
          className="order-first lg:order-none"
          title="Pending Change Requests" icon={ClipboardCheck} count={requests.length}
          action={requests.length ? 'Review all →' : null} onAction={() => navigate('/users')}
        >
          {requests.length === 0 ? (
            <p className="flex flex-1 items-center justify-center px-5 py-8 text-center text-[13px] italic text-text-muted">
              No change requests waiting for review.
            </p>
          ) : (
            <ul className="lg:max-h-[268px] lg:overflow-y-auto">
              {requests.map((r, i) => (
                <li key={r.id} className={`px-4 py-3.5 md:px-5 ${i === requests.length - 1 ? '' : 'border-b border-border'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-[14px] font-semibold text-text-primary">
                      {r.record_label || r.requested_by_name || `Request #${r.id}`}
                    </p>
                    <span className="shrink-0 text-[12px] tabular-nums text-text-muted">
                      {r.requested_at ? new Date(r.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] capitalize text-[color:var(--color-semantic-info)]">
                    {r.field_label || (r.field_name || '').replace(/_/g, ' ') || 'Change request'}
                  </p>
                  <p className="mt-0.5 break-words text-[12.5px] text-text-muted">
                    {r.old_value || '—'} → {r.requested_value || '—'}
                  </p>
                  {r.requires_both && (
                    <p className="mt-1 text-[12px] text-text-secondary" data-testid="approval-lines">
                      {approvalLines(r).map((line, idx) => (
                        <span key={line.role}>
                          {idx > 0 ? ' · ' : ''}
                          {line.done ? `${line.role} ✓ ${line.by}`.trim() : `${line.role} pending`}
                        </span>
                      ))}
                    </p>
                  )}
                  <div className="mt-2.5 flex gap-2">
                    <button type="button" disabled={busyId === r.id || hasApproved(r, user?.role)} onClick={() => decide(r, 'approve')}
                      title={hasApproved(r, user?.role) ? 'You already approved this' : undefined}
                      className="min-h-[40px] flex-1 cursor-pointer rounded-[6px] border border-[color:var(--color-semantic-safe)] px-3 transition-colors hover:bg-[color:var(--color-semantic-safe-bg)] disabled:opacity-50 md:min-h-[34px] md:flex-none">
                      <span className="text-[12px] font-semibold text-[color:var(--color-semantic-safe)]">Approve</span>
                    </button>
                    <button type="button" disabled={busyId === r.id} onClick={() => decide(r, 'reject')}
                      className="min-h-[40px] flex-1 cursor-pointer rounded-[6px] border border-border-strong px-3 transition-colors hover:bg-surface-2 disabled:opacity-50 md:min-h-[34px] md:flex-none">
                      <span className="text-[12px] font-semibold text-text-secondary">Reject</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DashPanel>
      </div>
    </div>
  )
}
