import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Fish, PackageX, Sprout } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PhotoLinks from '../../components/UI/PhotoLinks.jsx'
import { resolveMediaUrl } from '../../utils/mediaUrl.js'

// The admin/evaluator dashboard, built to the approved staff reference
// ("New Dashboard base.docx", three frames).
//
// Everything here is fed by real endpoints. The per-domain activity counts, the
// per-barangay table, the cross-domain disaster feed, the sector totals and the
// yield variance all come from /production/dashboard/activity-status/, which
// reuses the same overdue/due/upcoming classifier the record detail screens use
// so the dashboard can never disagree with the screen it links to.
//
// ONE deliberate omission from the reference: its Activity Status table draws an
// "Assigned Evaluator" column. No staff-to-barangay assignment exists anywhere
// in this system, so the column is dropped rather than filled with invented
// names — agreed before building.

const CARD = 'bg-surface border border-border rounded-[var(--radius-md)] shadow-sm overflow-hidden'
const num = (n) => (n ?? 0).toLocaleString()

// Sector card — two figures under a tinted band, per frame 1.
function SectorCard({ tone, icon: Icon, title, primaryLabel, primaryValue, primaryNote,
                      secondaryLabel, secondaryValue, secondaryNote, isLoading }) {
  const t = tone === 'crop'
    ? { band: 'bg-primary-light', text: 'text-primary' }
    : { band: 'bg-[color:var(--color-semantic-info-bg)]', text: 'text-[color:var(--color-semantic-info)]' }
  return (
    <div className={CARD}>
      <div className={`flex items-center gap-2 px-5 py-3 ${t.band}`}>
        <Icon size={15} className={t.text} aria-hidden="true" />
        <h3 className={`text-[12px] font-bold uppercase tracking-[0.06em] ${t.text}`}>{title}</h3>
      </div>
      <div className="grid grid-cols-2">
        <div className="px-5 py-4 border-r border-border">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted">{primaryLabel}</p>
          <p className="mt-1.5 text-[30px] font-bold leading-none tabular-nums text-text-primary">
            {isLoading ? '—' : num(primaryValue)}
          </p>
          <p className={`mt-2 text-[12px] ${primaryNote?.startsWith('+') ? t.text : 'text-text-muted'}`}>
            {primaryNote}
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted">{secondaryLabel}</p>
          <p className="mt-1.5 text-[30px] font-bold leading-none tabular-nums text-text-primary">
            {isLoading ? '—' : num(secondaryValue)}
          </p>
          <p className="mt-2 text-[12px] text-text-muted">{secondaryNote}</p>
        </div>
      </div>
    </div>
  )
}

// The three-figure block inside the amber "Needs attention" banner.
function MonitoringBlock({ tone, icon: Icon, title, data, linkLabel, onLink, isLoading }) {
  const accent = tone === 'crop'
    ? 'text-primary'
    : 'text-[color:var(--color-semantic-info)]'
  const cell = (label, value, cls) => (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">{label}</p>
      <p className={`mt-1 text-[26px] font-bold leading-none tabular-nums ${cls}`}>
        {isLoading ? '—' : num(value)}
      </p>
    </div>
  )
  return (
    <div className="flex-1 min-w-[240px] px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
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
        className={`mt-3 ${accent} transition-opacity hover:opacity-75 cursor-pointer`}
      >
        <span className="text-[12.5px]">{linkLabel} →</span>
      </button>
    </div>
  )
}

function Pill({ children, kind = 'neutral' }) {
  const map = {
    crop: 'bg-primary-light text-primary',
    fisheries: 'bg-[color:var(--color-semantic-info-bg)] text-[color:var(--color-semantic-info)]',
    disaster: 'bg-[color:var(--color-semantic-critical-bg)] text-[color:var(--color-semantic-critical)]',
    neutral: 'bg-surface-2 text-text-muted',
  }
  return (
    <span className={`inline-block shrink-0 rounded-[5px] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] ${map[kind]}`}>
      {children}
    </span>
  )
}

function PanelHead({ title, count, action, onAction, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-border flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-text-primary truncate">{title}</h3>
          {count > 0 && (
            <span className="shrink-0 rounded-full bg-[color:var(--color-semantic-warning-bg)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--color-semantic-warning)] tabular-nums">
              {count}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-text-muted">{subtitle}</p>}
      </div>
      {right}
      {action && (
        <button type="button" onClick={onAction} className="shrink-0 text-text-secondary transition-colors hover:text-primary cursor-pointer">
          <span className="text-[13px]">{action}</span>
        </button>
      )}
    </div>
  )
}

const TH = 'px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted'
const TD = 'px-5 py-3 text-[14px]'

export default function StaffDashboard({ user }) {
  const navigate = useNavigate()
  const [board, setBoard] = useState(null)
  const [requests, setRequests] = useState([])
  const [confirmationRequests, setConfirmationRequests] = useState([])
  const [activity, setActivity] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [tableDomain, setTableDomain] = useState('crop')

  const loadRequests = useCallback(() => {
    api.get('/staff/change-requests/', { params: { status: 'PENDING' } })
      .then((r) => setRequests(Array.isArray(r.data) ? r.data : r.data?.results || []))
      .catch(() => setRequests([]))
  }, [])

  // Accountless-beneficiary on-behalf-of confirmation (Piece 2). Two
  // separate models/endpoints (BeneficiaryConfirmationRequest and its
  // fisherfolk mirror — see interventions/models.py's own comment for why
  // this is two mirrored models rather than one polymorphic one, matching
  // this codebase's dominant per-domain convention), merged into ONE queue
  // here so it can sit as ONE panel next to Pending Change Requests rather
  // than two separate ones — each row keeps a `domain` tag so the decide
  // action below knows which endpoint pair it belongs to.
  const loadConfirmationRequests = useCallback(() => {
    Promise.allSettled([
      api.get('/interventions/beneficiary-confirmation-requests/', { params: { status: 'PENDING' } }),
      api.get('/interventions/fisherfolk-beneficiary-confirmation-requests/', { params: { status: 'PENDING' } }),
    ]).then(([farmerRes, ffRes]) => {
      const farmerRows = farmerRes.status === 'fulfilled'
        ? (Array.isArray(farmerRes.value.data) ? farmerRes.value.data : farmerRes.value.data?.results || [])
        : []
      const ffRows = ffRes.status === 'fulfilled'
        ? (Array.isArray(ffRes.value.data) ? ffRes.value.data : ffRes.value.data?.results || [])
        : []
      const merged = [
        ...farmerRows.map((r) => ({ ...r, domain: 'farmer', personName: r.farmer_full_name })),
        ...ffRows.map((r) => ({ ...r, domain: 'fisherfolk', personName: r.fisherfolk_full_name })),
      ].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
      setConfirmationRequests(merged)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      api.get('/production/dashboard/activity-status/'),
      api.get('/auditlog/', { params: { page_size: 8 } }),
    ]).then(([b, a]) => {
      if (cancelled) return
      if (b.status === 'fulfilled') setBoard(b.value.data)
      if (a.status === 'fulfilled') setActivity(a.value.data?.results || [])
    }).finally(() => { if (!cancelled) setIsLoading(false) })
    loadRequests()
    loadConfirmationRequests()
    return () => { cancelled = true }
  }, [loadRequests, loadConfirmationRequests])

  const decide = async (req, action) => {
    setBusyId(req.id)
    try {
      const body = action === 'reject' ? { rejection_reason: 'Rejected from dashboard review.' } : {}
      await api.post(`/staff/change-requests/${req.id}/${action}/`, body)
      loadRequests()
    } finally { setBusyId(null) }
  }

  const decideConfirmation = async (req, action) => {
    setBusyId(`confirmation-${req.id}`)
    try {
      const base = req.domain === 'farmer'
        ? '/interventions/beneficiary-confirmation-requests/'
        : '/interventions/fisherfolk-beneficiary-confirmation-requests/'
      const body = action === 'reject' ? { rejection_reason: 'Rejected from dashboard review.' } : {}
      await api.post(`${base}${req.id}/${action}/`, body)
      loadConfirmationRequests()
    } finally { setBusyId(null) }
  }

  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const roleLabel = user?.role === 'ADMIN' ? 'Administrator view' : 'Focal Person view'
  const rows = board?.[tableDomain]?.by_barangay || []
  const disasters = board?.active_disasters || []
  const variance = board?.yield_variance || []

  // The audit log carries no domain field; the reference tags each row CROP or
  // FISH, so it is derived from the model that was touched.
  const domainOf = (modelName = '') =>
    /fish|stocking|pond|species/i.test(modelName) ? 'fisheries'
      : /crop|harvest|planting|farm/i.test(modelName) ? 'crop' : null

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold leading-tight text-text-primary">What needs attention today</h1>
        <p className="mt-1 text-[13px] text-text-muted">{today} · {roleLabel} · Aringay, La Union</p>
      </div>

      {/* ── Sector cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectorCard
          tone="crop" icon={Sprout} title="Crop Sector" isLoading={isLoading}
          primaryLabel="Registered Farmers" primaryValue={board?.sectors?.crop?.registered}
          primaryNote={board ? `+${num(board.sectors.crop.new_this_month)} this month →` : ''}
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

      {/* ── Two-column body ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-5 min-w-0 lg:sticky lg:top-20">
          {/* Needs attention — activity overdue */}
          <div className={CARD}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 bg-[color:var(--color-semantic-warning-bg)] border-b border-border flex-wrap">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-[color:var(--color-semantic-critical)]" aria-hidden="true" />
                <h3 className="text-[12.5px] font-bold uppercase tracking-[0.05em] text-[color:var(--color-semantic-critical)]">
                  Needs Attention — Activity Overdue
                </h3>
              </div>
              <span className="text-[12px] text-text-muted">Both domains shown</span>
            </div>
            <div className="flex flex-wrap divide-x divide-border">
              <MonitoringBlock
                tone="crop" icon={Sprout} title="Crop Monitoring" data={board?.crop} isLoading={isLoading}
                linkLabel="View crop activities" onLink={() => navigate('/crop-monitoring')}
              />
              <MonitoringBlock
                tone="fisheries" icon={Fish} title="Fisheries Monitoring" data={board?.fisheries} isLoading={isLoading}
                linkLabel="View fisheries activities" onLink={() => navigate('/fisheries-monitoring')}
              />
            </div>
          </div>

          {/* Needs attention — assistance not received */}
          {(board?.not_received_count?.total || 0) > 0 && (
            <div className={CARD}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 bg-[color:var(--color-semantic-warning-bg)] border-b border-border flex-wrap">
                <div className="flex items-center gap-2">
                  <PackageX size={15} className="text-[color:var(--color-semantic-critical)]" aria-hidden="true" />
                  <h3 className="text-[12.5px] font-bold uppercase tracking-[0.05em] text-[color:var(--color-semantic-critical)]">
                    Needs Follow-up — Assistance Not Received
                  </h3>
                </div>
                <span className="text-[12px] text-text-muted">Both domains shown</span>
              </div>
              <div className="flex flex-wrap divide-x divide-border">
                <div className="flex-1 min-w-[200px] px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sprout size={14} className="text-primary" aria-hidden="true" />
                    <h4 className="text-[12px] font-bold uppercase tracking-[0.05em] text-primary">Crop</h4>
                  </div>
                  <p className="text-[26px] font-bold leading-none tabular-nums text-[color:var(--color-semantic-critical)]">
                    {num(board?.not_received_count?.crop)}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/crop-assistance?tab=needs-follow-up')}
                    className="mt-3 text-primary transition-opacity hover:opacity-75 cursor-pointer"
                  >
                    <span className="text-[12.5px]">Review crop cases →</span>
                  </button>
                </div>
                <div className="flex-1 min-w-[200px] px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Fish size={14} className="text-[color:var(--color-semantic-info)]" aria-hidden="true" />
                    <h4 className="text-[12px] font-bold uppercase tracking-[0.05em] text-[color:var(--color-semantic-info)]">Fisheries</h4>
                  </div>
                  <p className="text-[26px] font-bold leading-none tabular-nums text-[color:var(--color-semantic-critical)]">
                    {num(board?.not_received_count?.fisheries)}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/fisheries-assistance?tab=needs-follow-up')}
                    className="mt-3 text-[color:var(--color-semantic-info)] transition-opacity hover:opacity-75 cursor-pointer"
                  >
                    <span className="text-[12.5px]">Review fisheries cases →</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Activity status — all barangays */}
          <div className={CARD}>
            <PanelHead
              title="Activity Status — All Barangays"
              subtitle="Per-barangay breakdown for selected domain"
              right={
                <div className="flex overflow-hidden rounded-[var(--radius-sm)] border border-border-strong shrink-0">
                  {[
                    { key: 'crop', label: 'Crop', Icon: Sprout },
                    { key: 'fisheries', label: 'Fisheries', Icon: Fish },
                  ].map(({ key, label, Icon }) => (
                    <button
                      key={key} type="button" onClick={() => setTableDomain(key)}
                      className={`flex items-center gap-1.5 px-4 py-2 transition-colors cursor-pointer ${
                        tableDomain === key ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:bg-surface-2'
                      }`}
                    >
                      <Icon size={13} aria-hidden="true" />
                      <span className="text-[12.5px] font-semibold">{label}</span>
                    </button>
                  ))}
                </div>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
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
                    <tr><td className={`${TD} text-text-muted italic`} colSpan={4}>
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
          </div>

          {/* Active disaster reports */}
          <div className={CARD}>
            <PanelHead
              title="Active Disaster Reports" count={disasters.length}
              action="View all →" onAction={() => navigate('/crop-monitoring')}
            />
            {disasters.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] italic text-text-muted">
                {isLoading ? 'Loading…' : 'No active disaster reports.'}
              </p>
            ) : (
              <ul>
                {disasters.map((d, i) => (
                  <li key={`${d.domain}-${d.id}`}
                      className={`flex flex-wrap items-start gap-3 px-5 py-3.5 ${i === disasters.length - 1 ? '' : 'border-b border-border'}`}>
                    <Pill kind="disaster">{d.disaster_type}</Pill>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-text-primary">
                        {d.disaster_type} — {d.barangay || 'Unspecified barangay'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Pill kind={d.domain}>{d.domain === 'crop' ? 'Crop' : 'Fish'}</Pill>
                        <span className="text-[12.5px] text-text-secondary">{d.subject || '—'}</span>
                        <span className="text-[12.5px] text-text-muted">· {d.area_affected_ha} ha affected</span>
                        {d.is_total_loss && (
                          <span className="text-[12.5px] font-semibold text-[color:var(--color-semantic-critical)]">· Total loss</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[12.5px] text-text-muted tabular-nums">{d.date_of_occurrence}</span>
                      <button
                        type="button"
                        onClick={() => navigate(d.domain === 'crop' ? '/crop-monitoring' : '/fisheries-monitoring')}
                        className="rounded-[6px] border border-border-strong bg-surface px-3 py-1.5 transition-colors hover:bg-surface-2 cursor-pointer"
                      >
                        <span className="text-[12px] font-semibold text-text-secondary">Open</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Season snapshot — yield variance */}
          <div className={CARD}>
            <PanelHead
              title="Season Snapshot — Crop Yield Variance"
              subtitle="Estimated at planting vs actual harvest · municipality average"
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className={TH}>Crop</th>
                    <th className={TH}>Target</th>
                    <th className={TH}>Actual</th>
                    <th className={TH}>Variance</th>
                    <th className={TH}>Season</th>
                  </tr>
                </thead>
                <tbody>
                  {variance.length === 0 ? (
                    <tr><td className={`${TD} text-text-muted italic`} colSpan={5}>
                      {isLoading ? 'Loading…' : 'No harvested records with both an estimate and an actual yield.'}
                    </td></tr>
                  ) : variance.map((v, i) => {
                    const up = (v.variance_pct ?? 0) >= 0
                    return (
                      <tr key={v.crop} className={i === variance.length - 1 ? '' : 'border-b border-border'}>
                        <td className={`${TD} font-semibold text-text-primary`}>{v.crop}</td>
                        <td className={`${TD} text-text-muted tabular-nums`}>{v.target_mt_ha} mt/ha</td>
                        <td className={`${TD} text-text-primary tabular-nums`}>{v.actual_mt_ha} mt/ha</td>
                        <td className={`${TD} font-bold tabular-nums ${up ? 'text-[color:var(--color-semantic-safe)]' : 'text-[color:var(--color-semantic-critical)]'}`}>
                          {up ? '▲' : '▼'} {Math.abs(v.variance_pct ?? 0)}%
                        </td>
                        <td className={`${TD} text-text-muted tabular-nums`}>{v.season} {v.year}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Right column ──────────────────────────────────────────────── */}
        <div className="space-y-5 min-w-0 lg:sticky lg:top-20">
          <div className={CARD}>
            <PanelHead
              title="Pending Change Requests" count={requests.length}
              action={requests.length ? 'Review all →' : null} onAction={() => navigate('/users')}
            />
            {requests.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] italic text-text-muted">
                No change requests waiting for review.
              </p>
            ) : (
              <ul>
                {requests.map((r, i) => (
                  <li key={r.id} className={`px-5 py-3.5 ${i === requests.length - 1 ? '' : 'border-b border-border'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] font-semibold text-text-primary truncate">
                        {r.record_name || r.requested_by_name || `Request #${r.id}`}
                      </p>
                      <span className="text-[12px] text-text-muted shrink-0 tabular-nums">
                        {r.requested_at ? new Date(r.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                      </span>
                    </div>
                    <div className="mt-1 flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-[13px] text-[color:var(--color-semantic-info)] capitalize">
                          {(r.field_name || '').replace(/_/g, ' ') || 'Change request'}
                        </p>
                        <p className="mt-0.5 text-[12.5px] text-text-muted">
                          {r.old_value || '—'} → {r.requested_value || '—'}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button type="button" disabled={busyId === r.id} onClick={() => decide(r, 'approve')}
                          className="rounded-[6px] border border-[color:var(--color-semantic-safe)] px-3 py-1.5 transition-colors hover:bg-[color:var(--color-semantic-safe-bg)] disabled:opacity-50 cursor-pointer">
                          <span className="text-[12px] font-semibold text-[color:var(--color-semantic-safe)]">Approve</span>
                        </button>
                        <button type="button" disabled={busyId === r.id} onClick={() => decide(r, 'reject')}
                          className="rounded-[6px] border border-border-strong px-3 py-1.5 transition-colors hover:bg-surface-2 disabled:opacity-50 cursor-pointer">
                          <span className="text-[12px] font-semibold text-text-secondary">Reject</span>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Accountless-beneficiary on-behalf-of confirmation (Piece 2) —
              same placement convention as Pending Change Requests above:
              next to it, not a new location. Shows the submitting
              organization, beneficiary, assistance details, submission
              timestamp, and the actual photo (not a yes/no flag) so staff
              can review responsibly. */}
          <div className={CARD}>
            <PanelHead
              title="Pending On-Behalf-Of Confirmations" count={confirmationRequests.length}
            />
            {confirmationRequests.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] italic text-text-muted">
                No on-behalf-of confirmations waiting for review.
              </p>
            ) : (
              <ul>
                {confirmationRequests.map((r, i) => (
                  <li key={`${r.domain}-${r.id}`} className={`px-5 py-3.5 ${i === confirmationRequests.length - 1 ? '' : 'border-b border-border'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] font-semibold text-text-primary truncate">
                        {r.personName || `Request #${r.id}`}
                      </p>
                      <span className="text-[12px] text-text-muted shrink-0 tabular-nums">
                        {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-text-muted">
                      Submitted by <span className="font-medium text-text-secondary">{r.submitted_by_organization_name}</span>
                    </p>
                    <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex min-w-0 items-start gap-3">
                        {(r.photo_urls?.length > 0 || r.photo_url) ? (
                          // every proof photo can be opened (the older single photo first)
                          <PhotoLinks
                            className="max-w-[9.5rem] shrink-0"
                            legacy={r.photo_url ? resolveMediaUrl(r.photo_url) : null}
                            photos={(r.photo_urls || []).map((url, i) => ({ id: i, url: resolveMediaUrl(url) }))}
                          />
                        ) : (
                          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[8px] border border-dashed border-border-strong text-[10px] text-text-muted">
                            No photo
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-[13px] text-[color:var(--color-semantic-info)]">
                            {r.assistance_type || 'Assistance'}
                          </p>
                          <p className="mt-0.5 text-[12.5px] text-text-muted">
                            {new Date(r.date_given).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button type="button" disabled={busyId === `confirmation-${r.id}`} onClick={() => decideConfirmation(r, 'approve')}
                          className="rounded-[6px] border border-[color:var(--color-semantic-safe)] px-3 py-1.5 transition-colors hover:bg-[color:var(--color-semantic-safe-bg)] disabled:opacity-50 cursor-pointer">
                          <span className="text-[12px] font-semibold text-[color:var(--color-semantic-safe)]">Approve</span>
                        </button>
                        <button type="button" disabled={busyId === `confirmation-${r.id}`} onClick={() => decideConfirmation(r, 'reject')}
                          className="rounded-[6px] border border-border-strong px-3 py-1.5 transition-colors hover:bg-surface-2 disabled:opacity-50 cursor-pointer">
                          <span className="text-[12px] font-semibold text-text-secondary">Reject</span>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={CARD}>
            <PanelHead title="Recent Activity" action="View all →" onAction={() => navigate('/audit-log')} />
            {activity.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] italic text-text-muted">
                {isLoading ? 'Loading…' : 'No recorded activity yet.'}
              </p>
            ) : (
              <ul className="px-5">
                {activity.map((a, i) => {
                  const dom = domainOf(a.model_name)
                  return (
                    <li key={a.id} className={`flex gap-3 py-3.5 ${i === activity.length - 1 ? '' : 'border-b border-border'}`}>
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        a.action === 'DELETE' ? 'bg-[color:var(--color-semantic-critical)]'
                          : a.action === 'CREATE' ? 'bg-[color:var(--color-semantic-safe)]'
                          : 'bg-text-muted'
                      }`} aria-hidden="true" />
                      <div className="min-w-0">
                        {dom && <Pill kind={dom}>{dom === 'crop' ? 'Crop' : 'Fish'}</Pill>}
                        <p className="mt-1 text-[13px] leading-snug text-text-primary">
                          {a.action === 'CREATE' ? 'Created' : a.action === 'DELETE' ? 'Deleted' : 'Updated'}{' '}
                          {a.model_name} — {a.object_repr}
                        </p>
                        <p className="mt-0.5 text-[12px] text-text-muted">
                          {new Date(a.timestamp).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          {a.user?.full_name ? ` · ${a.user.full_name}` : ''}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
