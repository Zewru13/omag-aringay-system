import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { labels } from './labels.js'

// Batch 11: read-only, own-record-level yield analysis for a CITIZEN.
// Deliberately no aggregate/barangay-comparison view (that stays
// IsAdminOrEvaluator-only server-side) — just the same per-record numbers
// an Evaluator would see, scoped to the caller's own records by the API.
export default function MyYieldAnalysisSection({ endpoint, cropLabel, cropKey, dateLabel, dateKey }) {
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
      <p className="text-[11px] text-cz-text-muted">{data.disclaimer}</p>
      <div className="overflow-x-auto rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-[0.5px] border-cz-border text-left text-[11px] uppercase tracking-wider text-cz-text-2">
              <th className="px-4 py-2">{cropLabel}</th>
              <th className="px-4 py-2">{dateLabel}</th>
              <th className="px-4 py-2 text-right">{labels.yieldAnalysis.columns.estimatedKg}</th>
              <th className="px-4 py-2 text-right">{labels.yieldAnalysis.columns.actualKg}</th>
              <th className="px-4 py-2 text-right">{labels.yieldAnalysis.columns.variance}</th>
              <th className="px-4 py-2 text-right">{labels.yieldAnalysis.columns.activities}</th>
            </tr>
          </thead>
          <tbody>
            {data.records.map((rec) => (
              <tr key={rec.id} className="border-b-[0.5px] border-cz-border last:border-0">
                <td className="px-4 py-2 text-cz-text">
                  {rec[cropKey]}
                  {rec.is_total_loss && <span className="ml-2 rounded-full bg-cz-danger-bg px-2 py-0.5 text-[10px] font-semibold text-cz-danger-accent">{labels.yieldAnalysis.totalLossBadge}</span>}
                </td>
                <td className="px-4 py-2 text-cz-text-2">{rec[dateKey] || '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums text-cz-text-2">{rec.estimated_kg ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums text-cz-text-2">{rec.actual_total_kg}</td>
                <td className="px-4 py-2 text-right tabular-nums text-cz-text-2">
                  {rec.variance_pct !== null ? `${rec.variance_pct > 0 ? '+' : ''}${rec.variance_pct}%` : '—'}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-cz-text-2">
                  {rec.activities_completed_count}/{rec.activities_total_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
