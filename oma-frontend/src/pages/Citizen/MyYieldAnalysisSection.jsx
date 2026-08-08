import { useEffect, useState } from 'react'
import { AlertCircle, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { DATE_LOCALE, labels } from './labels.js'

// Batch 11: read-only, own-record-level yield analysis for a CITIZEN.
// Deliberately no aggregate/barangay-comparison view (that stays
// IsAdminOrEvaluator-only server-side) — just the same per-record numbers
// an Evaluator would see, scoped to the caller's own records by the API.
//
// UI-basis pass: the 6-column table this used to render became cards. The
// table was the reason this screen needed horizontal scrolling on a phone,
// which is where it is actually read. Nothing about WHAT is fetched or
// which endpoint is called changed — same request, same own-record scoping.
//
// The activities-completed count was NOT dropped in the conversion: it moved
// from its own column to a quiet footer line, so the card keeps the full
// information the table carried.

// kg → t once the number gets long enough to be hard to read. This is the
// one unit conversion in this app that is safe to do client-side: it is a
// fixed 1000:1 SI relationship, unlike the per-crop volume→weight factors
// (cavan, bundles, heads) that were correctly left to the server because
// they vary by commodity and have no single correct multiplier.
function formatMass(kg) {
  if (kg === null || kg === undefined) return labels.common.unknown
  const n = Number(kg)
  if (!Number.isFinite(n)) return labels.common.unknown
  if (Math.abs(n) >= 1000) {
    const t = n / 1000
    // One decimal reads naturally at this scale ("3.0 t"); two would imply
    // a precision the harvest figures don't actually carry.
    return `${t.toFixed(1)} t`
  }
  // Whole kg unless the value genuinely has a fractional part.
  return `${Number.isInteger(n) ? n : n.toFixed(2)} kg`
}

function formatDate(iso) {
  if (!iso) return null
  return new Intl.DateTimeFormat(DATE_LOCALE, { month: 'short', year: 'numeric' })
    .format(new Date(iso + 'T00:00:00'))
}

// Status is carried by pill text + trend icon + colour together, never by
// colour alone — same rule the rest of the citizen screens follow.
function statusOf(rec) {
  if (rec.is_total_loss) return 'totalLoss'
  if (rec.variance_pct === null || rec.variance_pct === undefined) return 'none'
  if (rec.variance_pct > 0) return 'above'
  if (rec.variance_pct < 0) return 'below'
  return 'onTarget'
}

const PILL = {
  totalLoss: 'bg-cz-danger-bg text-cz-danger-accent',
  above: 'bg-cz-crop-pale text-cz-crop-deep',
  below: 'bg-cz-warn-bg text-cz-warn-accent',
  onTarget: 'bg-cz-page text-cz-text-2',
}

// `dateLabel` was dropped with the table: the card shows the date inline in
// the meta line rather than under a column header, so there is nothing left
// for a column caption to label.
export default function MyYieldAnalysisSection({
  endpoint, cropLabel, cropKey, dateKey, isFisheries = false,
}) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  // `hasError` is tracked separately from `data` on purpose. Keying the
  // empty state off `!data` alone conflated two very different situations —
  // "the request failed" and "you genuinely have no harvested cycles yet" —
  // because a rejected promise simply left `data` at its initial null.
  const [hasError, setHasError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setHasError(false)
    api.get(endpoint)
      .then((r) => { if (!cancelled) setData(r.data) })
      .catch(() => { if (!cancelled) { setData(null); setHasError(true) } })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [endpoint, reloadKey])

  if (isLoading) return <p className="text-[13px] italic text-cz-text-2">{labels.yieldAnalysis.loading}</p>

  if (hasError) {
    return (
      <div className="rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-4">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="mt-px shrink-0 text-cz-danger-accent" aria-hidden="true" />
          <p className="text-[13px] leading-[1.5] text-cz-danger-body">{labels.yieldAnalysis.loadError}</p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[8px] border-[0.5px] border-cz-danger-accent px-3 py-[11px] text-cz-danger-body transition-opacity hover:opacity-90"
        >
          <span className="text-[14px] font-medium">{labels.yieldAnalysis.retry}</span>
        </button>
      </div>
    )
  }

  if (!data || data.count === 0) {
    return (
      <p className="rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface p-6 text-[13px] italic text-cz-text-muted">
        {labels.yieldAnalysis.empty}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Still the SERVER's disclaimer, not the basis's hardcoded intro
          paragraph — the wording is a policy statement the API owns, and
          replacing it with fixed client text would silently drift from
          whatever the office actually approved. */}
      <p className="text-[12px] leading-[1.5] text-cz-text-2">{data.disclaimer}</p>

      <div className="sm:grid sm:grid-cols-2 sm:items-start sm:gap-[10px]">
        {data.records.map((rec) => {
          const status = statusOf(rec)
          const pct = rec.variance_pct
          const absPct = pct === null || pct === undefined ? null : Math.abs(pct)

          const metaParts = [rec.barangay, formatDate(rec[dateKey])].filter(
            (p) => p && p !== labels.common.unknown,
          )

          let TrendIcon = Minus
          let trendClass = 'text-cz-text-2'
          let trendText = null
          if (status === 'totalLoss') {
            TrendIcon = TrendingDown
            trendClass = 'text-cz-danger-accent'
            trendText = isFisheries
              ? labels.yieldAnalysis.totalLossTrendFisheries
              : labels.yieldAnalysis.totalLossTrendCrop
          } else if (status === 'above') {
            TrendIcon = TrendingUp
            trendClass = 'text-cz-crop-deep'
            trendText = labels.yieldAnalysis.aboveTrend(absPct)
          } else if (status === 'below') {
            TrendIcon = TrendingDown
            trendClass = 'text-cz-warn-accent'
            trendText = labels.yieldAnalysis.belowTrend(absPct)
          } else if (status === 'onTarget') {
            trendText = labels.yieldAnalysis.onTargetTrend
          }

          return (
            <div
              key={rec.id}
              className="mb-[10px] rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface sm:mb-0"
            >
              <div className="flex items-start justify-between gap-3 p-[14px] pb-[10px]">
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-medium text-cz-text">
                    {rec[cropKey] || cropLabel}
                  </p>
                  {metaParts.length > 0 && (
                    <p className="mt-[2px] truncate text-[12px] text-cz-text-2">
                      {metaParts.join(' · ')}
                    </p>
                  )}
                </div>
                {status !== 'none' && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-[3px] text-[11px] font-medium ${PILL[status]}`}
                  >
                    {status === 'totalLoss'
                      ? labels.yieldAnalysis.totalLossBadge
                      : status === 'above'
                        ? labels.yieldAnalysis.aboveEstimateBadge
                        : status === 'below'
                          ? labels.yieldAnalysis.belowEstimateBadge
                          : labels.yieldAnalysis.onTargetTrend}
                  </span>
                )}
              </div>

              {/* ESTIMATED | ACTUAL split panel */}
              <div className="mx-[14px] flex rounded-[8px] border-[0.5px] border-cz-border">
                <div className="flex-1 border-r-[0.5px] border-cz-border px-3 py-2">
                  <p className="text-[10px] font-medium tracking-[0.04em] text-cz-text-2">
                    {labels.yieldAnalysis.estimatedLabel}
                  </p>
                  <p className="mt-[2px] text-[17px] font-medium tabular-nums text-cz-text">
                    {formatMass(rec.estimated_kg)}
                  </p>
                </div>
                <div className="flex-1 px-3 py-2">
                  <p className="text-[10px] font-medium tracking-[0.04em] text-cz-text-2">
                    {labels.yieldAnalysis.actualLabel}
                  </p>
                  <p
                    className={`mt-[2px] text-[17px] font-medium tabular-nums ${
                      status === 'totalLoss'
                        ? 'text-cz-danger-accent'
                        : status === 'above'
                          ? 'text-cz-crop-deep'
                          : 'text-cz-text'
                    }`}
                  >
                    {formatMass(rec.actual_total_kg)}
                  </p>
                </div>
              </div>

              <div className="px-[14px] pb-[12px] pt-[10px]">
                {trendText && (
                  <div className="flex items-center gap-1.5">
                    <TrendIcon size={14} className={`shrink-0 ${trendClass}`} aria-hidden="true" />
                    <span className={`text-[12px] ${trendClass}`}>{trendText}</span>
                  </div>
                )}
                {/* Kept from the table: activities completed / total. */}
                <p className="mt-1 text-[11px] text-cz-text-muted">
                  {labels.yieldAnalysis.activitiesLine(
                    rec.activities_completed_count,
                    rec.activities_total_count,
                  )}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
