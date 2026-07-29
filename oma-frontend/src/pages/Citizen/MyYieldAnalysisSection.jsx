import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { labels } from './labels.js'

// Batch 11: read-only, own-record-level yield analysis for a CITIZEN.
// Deliberately no aggregate/barangay-comparison view (that stays
// IsAdminOrEvaluator-only server-side) — just the same per-record numbers
// an Evaluator would see, scoped to the caller's own records by the API.
export default function MyYieldAnalysisSection({ endpoint, cropLabel, cropKey, dateLabel, dateKey }) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    api.get(endpoint).then((r) => { if (!cancelled) setData(r.data) }).finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [endpoint])

  if (isLoading) return <p className="text-[13px] text-[#7A8E7A] italic">{labels.yieldAnalysis.loading}</p>
  if (!data || data.count === 0) {
    return <p className="rounded-xl border border-[#E2E8E2] bg-white p-6 text-[13px] italic text-[#A8BCA8]">{labels.yieldAnalysis.empty}</p>
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#A8BCA8]">{data.disclaimer}</p>
      <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#E2E8E2] text-left text-[11px] uppercase tracking-wider text-[#7A8E7A]">
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
              <tr key={rec.id} className="border-b border-[#F0F4F0] last:border-0">
                <td className="px-4 py-2 text-[#1A2B1A]">
                  {rec[cropKey]}
                  {rec.is_total_loss && <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">{labels.yieldAnalysis.totalLossBadge}</span>}
                </td>
                <td className="px-4 py-2 text-[#4A5E4A]">{rec[dateKey] || '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums text-[#4A5E4A]">{rec.estimated_kg ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums text-[#4A5E4A]">{rec.actual_total_kg}</td>
                <td className="px-4 py-2 text-right tabular-nums text-[#4A5E4A]">
                  {rec.variance_pct !== null ? `${rec.variance_pct > 0 ? '+' : ''}${rec.variance_pct}%` : '—'}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[#4A5E4A]">
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
