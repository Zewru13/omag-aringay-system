import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { labels } from './labels.js'
import { ORG_SURFACE, useOrgIntro } from './orgStyles.js'
import { OrgListSkeleton, OrgShell } from './OrgDashboardParts.jsx'

// Reference image9. The endpoint returns ONE ROW PER PERSON — a distribution
// to seven members is seven beneficiary records — but the reference reads
// back one card per distribution ("Ibinigay sa 7 kasapi"). So the rows are
// grouped here by what actually makes them one distribution: same assistance
// type, same quantity, same date, same reporter. The recipient count on
// each card is the size of that real group, never a literal.
//
// PINAKABAGO ("latest") is conditional and earned: the endpoint already
// orders by -date_given, -id, so the first group is genuinely the most
// recent, and only that one is tagged. With a single entry there is nothing
// to be "latest" among, so the tag is suppressed entirely.
//
// Phase 1 re-verification (2026-09-07) against images 8-12/18 found three
// real structural mismatches this rewrite fixes: (1) the header count sits
// beside the title, not below it; (2) type/status badges are OUTLINED pills
// with a leading dot/icon, not solid fills; (3) a group of exactly ONE
// recipient renders as a single-person row — the person's name as the
// headline and an inline status pill — with NO "Tatanggap" expand toggle at
// all, since there is nothing to expand. Multi-recipient groups keep the
// toggle, but now headline the recipient count (reference's emphasis),
// demoting quantity to the detail line below it.

const BADGE = {
  Training: 'border-cz-tile-blue-fg/40 bg-cz-tile-blue-bg text-cz-tile-blue-fg',
  Fertilizer: 'border-[#854D0E]/30 bg-cz-badge-yellow text-[#854D0E]',
  'Cash Assistance': 'border-[#6D28D9]/30 bg-cz-badge-violet text-[#6D28D9]',
  Seeds: 'border-[#15803D]/30 bg-cz-badge-green text-[#15803D]',
  'Fingerlings/Seeds': 'border-[#15803D]/30 bg-cz-badge-green text-[#15803D]',
  Feed: 'border-[#854D0E]/30 bg-cz-badge-yellow text-[#854D0E]',
  Equipment: 'border-cz-tile-blue-fg/40 bg-cz-tile-blue-bg text-cz-tile-blue-fg',
  'Fishing Gear': 'border-cz-tile-blue-fg/40 bg-cz-tile-blue-bg text-cz-tile-blue-fg',
  'Boat/Vessel': 'border-cz-tile-blue-fg/40 bg-cz-tile-blue-bg text-cz-tile-blue-fg',
}
// Anything unmapped (including free-text "Other" types) falls back to the
// slate tile rather than inventing a colour at runtime.
const BADGE_FALLBACK = 'border-cz-tile-slate-fg/30 bg-cz-tile-slate-bg text-cz-tile-slate-fg'
// Neutral, deliberately OUTSIDE the colour-coded type palette — a system
// marker, not an assistance category (image8's near-black "PINAKABAGO").
const LATEST_BADGE = 'border-transparent bg-[#3A3A2E] text-white'

const PILL = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.05em]'

// Scheduled distribution + confirmation lifecycle (interventions.models.
// DistributionStatus) — the organization gets visibility only, no
// confirm-on-behalf-of action, so this is display-only per member.
const STATUS_PILL = {
  PENDING:               { cls: 'border-cz-tile-slate-fg/30 bg-cz-tile-slate-bg text-cz-tile-slate-fg', dot: '○' },
  AWAITING_CONFIRMATION: { cls: 'border-[#854D0E]/30 bg-cz-badge-yellow text-[#854D0E]', dot: '○' },
  CONFIRMED:             { cls: 'border-[#15803D]/30 bg-cz-badge-green text-[#15803D]', dot: '●' },
  NOT_RECEIVED:          { cls: 'border-[#BE185D]/30 bg-cz-badge-pink text-[#BE185D]', dot: '✕' },
  RESOLVED:              { cls: 'border-cz-tile-blue-fg/40 bg-cz-tile-blue-bg text-cz-tile-blue-fg', dot: '●' },
}
const STATUS_LABELS = {
  PENDING: 'Pending',
  AWAITING_CONFIRMATION: 'Awaiting Confirmation',
  CONFIRMED: 'Confirmed',
  NOT_RECEIVED: 'Not Received',
  RESOLVED: 'Resolved',
}

function StatusPill({ status }) {
  const s = STATUS_PILL[status] || STATUS_PILL.CONFIRMED
  return (
    <span className={`${PILL} ${s.cls}`}>
      <span aria-hidden="true">{s.dot}</span> {STATUS_LABELS[status] || status}
    </span>
  )
}

// Cash distributions are STORED as "₱2000 per head" — that is the existing
// record contract and staff screens read it, so it is not changed here.
// The card title already says "bawat kasapi", so the stored suffix is
// dropped for display only, giving image9's "₱3,000 bawat kasapi" instead
// of a doubled "per head bawat kasapi".
const stripPerHead = (amount) => amount.replace(/\s*per head\s*$/i, '').trim()

export default function OrgReportHistoryScreen({ domain, orgName, onBack, tabBar, active, onNav }) {
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [openKey, setOpenKey] = useState(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setHasError(false)
    api.get(domain.historyUrl)
      .then((r) => { if (!cancelled) setRows(Array.isArray(r.data) ? r.data : (r.data?.results || [])) })
      .catch(() => { if (!cancelled) setHasError(true) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [domain])

  const nameOf = (rec) => (domain.key === 'farmers_org' ? rec.farmer_full_name : rec.fisherfolk_full_name)

  const groups = useMemo(() => {
    const map = new Map()
    rows.forEach((rec) => {
      const type = rec.assistance_type || labels.common.unknown
      const amount = rec.quantity || ''
      const key = [type, amount, rec.date_given, rec.recorded_by_name || ''].join('|')
      if (!map.has(key)) {
        map.set(key, {
          key, type, amount, dateGiven: rec.date_given,
          reporter: rec.recorded_by_name || '', recipients: [],
        })
      }
      map.get(key).recipients.push({
        name: nameOf(rec) || labels.common.unknown,
        status: rec.status || 'CONFIRMED',
        reason: rec.non_receipt_reason || '',
      })
    })
    return [...map.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, domain.key])

  const H = labels.orgReportHistory
  const theme = domain.dashboardTheme
  const intro = useOrgIntro(!isLoading)

  return (
    <OrgShell theme={theme} chipLabel={orgName} active={active} onNav={(key) => (key === 'home' ? onBack() : onNav(key))} tabBar={tabBar} wide>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[22px] font-bold text-cz-text">{H.title}</h1>
        <p className="text-[13px] text-cz-text-2">{H.countLine(groups.length)}</p>
      </div>

      {isLoading && (
        <>
          <OrgListSkeleton />
          <p className="sr-only">{labels.orgReporting.loading}</p>
        </>
      )}

      {!isLoading && hasError && (
        <p className="rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-4 text-[13px] text-cz-danger-body">
          {labels.orgReporting.errors.loadHistoryFailed}
        </p>
      )}

      {!isLoading && !hasError && groups.length === 0 && (
        <p className="rounded-[14px] bg-white p-6 text-center text-[13px] italic text-cz-text-muted shadow-[var(--shadow-xs)]">
          {labels.orgReporting.historyEmpty}
        </p>
      )}

      {!isLoading && !hasError && groups.length > 0 && (
        <div className="space-y-3">
          {groups.map((g, i) => {
            const isOpen = openKey === g.key
            // Only meaningful when there is something to be latest among.
            const isLatest = i === 0 && groups.length > 1
            const isSingle = g.recipients.length === 1
            const badgeCls = BADGE[g.type] || BADGE_FALLBACK
            return (
              <article
                key={g.key}
                style={intro && i < 6 ? { '--i': i } : undefined}
                className={`${ORG_SURFACE} p-4${intro && i < 6 ? ' org-rise' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className={`${PILL} ${badgeCls}`}>{g.type}</span>
                    {isLatest && <span className={`${PILL} ${LATEST_BADGE}`}>{H.latest}</span>}
                    <h3 className="text-[16px] font-bold leading-[1.3] text-cz-text">
                      {isSingle ? g.recipients[0].name : H.givenTo(g.recipients.length)}
                    </h3>
                  </div>
                  {isSingle ? (
                    <StatusPill status={g.recipients[0].status} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenKey(isOpen ? null : g.key)}
                      aria-expanded={isOpen}
                      className="flex shrink-0 items-center gap-1 rounded-[8px] border-[0.5px] border-cz-border px-2.5 py-1 text-[12px] font-medium text-cz-text-2 transition-colors hover:bg-[#F6F5F1]"
                    >
                      {isOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                      {isOpen ? H.hideRecipients : H.showRecipients}
                    </button>
                  )}
                </div>

                <p className="mt-1.5 text-[13px] text-cz-text-2">
                  {g.amount ? stripPerHead(g.amount) : g.type} · {labels.common.formatDate(g.dateGiven)}
                  {g.reporter ? ` · ${H.reportedBy(g.reporter)}` : ''}
                </p>

                {isSingle && g.recipients[0].status === 'NOT_RECEIVED' && g.recipients[0].reason && (
                  <p className="mt-0.5 text-[12px] italic leading-[1.4] text-cz-text-2">
                    {H.notReceivedReason(g.recipients[0].reason)}
                  </p>
                )}

                {/* Always mounted, height + opacity animated through a 0fr -> 1fr
                    grid row, so opening a group's recipients no longer snaps. */}
                {!isSingle && (
                  <div
                    className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
                    style={{ gridTemplateRows: isOpen ? '1fr' : '0fr', opacity: isOpen ? 1 : 0 }}
                    aria-hidden={!isOpen}
                  >
                  <div className="min-h-0 overflow-hidden">
                  <div className="mt-3 border-t-[0.5px] border-cz-border pt-3">
                    <p className="mb-2 text-[13px] font-semibold text-cz-text">
                      {H.recipientsHeading(g.recipients.length)}
                    </p>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      {g.recipients.map((r, n) => (
                        <div key={`${g.key}-${n}`}>
                          <div className="flex items-center justify-between gap-2 text-[13px] text-cz-text">
                            <span className="truncate">{r.name}</span>
                            <StatusPill status={r.status} />
                          </div>
                          {r.status === 'NOT_RECEIVED' && r.reason && (
                            <p className="mt-0.5 text-[12px] italic leading-[1.4] text-cz-text-2">
                              {H.notReceivedReason(r.reason)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </OrgShell>
  )
}
