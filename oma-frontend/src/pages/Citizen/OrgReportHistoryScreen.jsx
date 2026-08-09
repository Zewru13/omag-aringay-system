import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { labels } from './labels.js'
import { OrgScreen } from './OrgDashboardParts.jsx'

// Reference image9. The endpoint returns ONE ROW PER PERSON — a distribution
// to seven members is seven beneficiary records — but the reference reads
// back one card per distribution ("Ibinigay sa 7 kasapi"). So the rows are
// grouped here by what actually makes them one distribution: same assistance
// type, same quantity, same date, same program, same reporter. The recipient
// count on each card is the size of that real group, never a literal.
//
// PINAKABAGO ("latest") is conditional and earned: the endpoint already
// orders by -date_given, -id, so the first group is genuinely the most
// recent, and only that one is tagged. With a single entry there is nothing
// to be "latest" among, so the tag is suppressed entirely.

const BADGE = {
  Training: 'bg-cz-badge-violet text-[#6D28D9]',
  Fertilizer: 'bg-cz-badge-yellow text-[#854D0E]',
  'Cash Assistance': 'bg-cz-badge-pink text-[#BE185D]',
  Seeds: 'bg-cz-badge-green text-[#15803D]',
  'Fingerlings/Seeds': 'bg-cz-badge-green text-[#15803D]',
  Feed: 'bg-cz-badge-yellow text-[#854D0E]',
  Equipment: 'bg-cz-badge-sky text-cz-tile-blue-fg',
  'Fishing Gear': 'bg-cz-badge-sky text-cz-tile-blue-fg',
  'Boat/Vessel': 'bg-cz-badge-sky text-cz-tile-blue-fg',
}
// Anything unmapped (including free-text "Other" types) falls back to the
// slate tile rather than inventing a colour at runtime.
const BADGE_FALLBACK = 'bg-cz-tile-slate-bg text-cz-tile-slate-fg'
const LATEST_BADGE = 'bg-cz-badge-pink text-[#BE185D]'

const PILL = 'inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.05em]'

// Cash distributions are STORED as "₱2000 per head" — that is the existing
// record contract and staff screens read it, so it is not changed here.
// The card title already says "bawat kasapi", so the stored suffix is
// dropped for display only, giving image9's "₱3,000 bawat kasapi" instead
// of a doubled "per head bawat kasapi".
const stripPerHead = (amount) => amount.replace(/\s*per head\s*$/i, '').trim()

export default function OrgReportHistoryScreen({ domain, orgName, onBack, tabBar }) {
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
      const type = rec.assistance_type || (rec.program ? labels.orgReporting.programDistribution : labels.common.unknown)
      const amount = rec.quantity || (rec.quantity_given ? `${rec.quantity_given} ${rec.unit || ''}`.trim() : '')
      const key = [type, amount, rec.date_given, rec.program || '', rec.recorded_by_name || ''].join('|')
      if (!map.has(key)) {
        map.set(key, {
          key, type, amount, dateGiven: rec.date_given,
          reporter: rec.recorded_by_name || '', recipients: [],
        })
      }
      map.get(key).recipients.push(nameOf(rec) || labels.common.unknown)
    })
    return [...map.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, domain.key])

  const H = labels.orgReportHistory

  return (
    <OrgScreen title={H.title} chipLabel={orgName} onBack={onBack} tabBar={tabBar}>
      {isLoading && <p className="text-[13px] italic text-cz-text-2">{labels.orgReporting.loading}</p>}

      {!isLoading && hasError && (
        <p className="rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-4 text-[13px] text-cz-danger-body">
          {labels.orgReporting.errors.loadHistoryFailed}
        </p>
      )}

      {!isLoading && !hasError && groups.length === 0 && (
        <p className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-6 text-center text-[13px] italic text-cz-text-muted">
          {labels.orgReporting.historyEmpty}
        </p>
      )}

      {!isLoading && !hasError && groups.length > 0 && (
        <div className="space-y-3">
          {groups.map((g, i) => {
            const isOpen = openKey === g.key
            // Only meaningful when there is something to be latest among.
            const isLatest = i === 0 && groups.length > 1
            return (
              <article
                key={g.key}
                className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`${PILL} ${BADGE[g.type] || BADGE_FALLBACK}`}>{g.type}</span>
                    {isLatest && <span className={`${PILL} ${LATEST_BADGE}`}>{H.latest}</span>}
                  </div>
                  <span className="shrink-0 pt-0.5 text-[12px] text-cz-text-2">
                    {labels.common.formatDate(g.dateGiven)}
                  </span>
                </div>

                <h3 className="mt-2.5 text-[17px] font-bold leading-[1.3] text-cz-text">
                  {g.amount ? H.perMember(stripPerHead(g.amount)) : g.type}
                </h3>

                <p className="mt-1 text-[13px] text-cz-text-2">
                  {H.givenTo(g.recipients.length)}
                  {g.reporter ? ` · ${H.reportedBy(g.reporter)}` : ''}
                </p>

                <button
                  type="button"
                  onClick={() => setOpenKey(isOpen ? null : g.key)}
                  aria-expanded={isOpen}
                  className="mt-2 flex items-center gap-1 text-[13px] font-medium text-cz-tile-blue-fg"
                >
                  <ChevronRight
                    size={15}
                    className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                  />
                  {H.viewRecipients(g.recipients.length)}
                </button>

                {isOpen && (
                  <ul className="mt-2 space-y-1 border-t-[0.5px] border-cz-border pt-2">
                    {g.recipients.map((name, n) => (
                      <li key={`${g.key}-${n}`} className="text-[13px] text-cz-text">{name}</li>
                    ))}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
      )}
    </OrgScreen>
  )
}
