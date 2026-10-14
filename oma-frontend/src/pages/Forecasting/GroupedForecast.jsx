import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import { STACK_TABLES } from '../../components/UI/ForecastCard.jsx'

// Shared grouped-by-person view for BOTH crop (by farmer) and fisheries
// (by fisherfolk) forecasting. Callers pass a normalized `records` array so
// this component stays domain-agnostic:
//   { id, person, commodity, landStatus, dateField, status, harvestDate,
//     variancePct, isTotalLoss }
// variancePct is null for anything not yet harvested; the row then reads
// "In progress" (or "Total Loss") — descriptive only, no causal wording.

function fmtDate(v) {
  if (!v) return '—'
  const d = new Date(String(v) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

function varianceTone(pct) {
  if (pct === null || pct === undefined) return 'slate'
  if (pct >= 0) return 'green'
  if (pct >= -20) return 'amber'
  return 'rose'
}

const TONE_CLS = {
  green: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  rose:  'text-rose-700 bg-rose-50 border-rose-200',
  slate: 'text-slate-500 bg-slate-100 border-slate-200',
}

function Pill({ pct, label }) {
  const tone = varianceTone(pct)
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE_CLS[tone]}`}>
      {label ?? (pct === null || pct === undefined ? 'N/A' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`)}
    </span>
  )
}

// Per-record variance cell: harvested → % badge; total loss / in-progress → label.
function RecordVariance({ rec }) {
  if (rec.isTotalLoss) return <Pill pct={null} label="Total Loss" />
  if (rec.variancePct === null || rec.variancePct === undefined) return <Pill pct={null} label="In progress" />
  return <Pill pct={rec.variancePct} />
}

const DISCLAIMER = 'This grouped view is descriptive. Variance compares each record’s actual harvest against its own planting-time estimate; in-progress records have no variance yet. Differences are shown descriptively, not as proven causes.'

export default function GroupedForecast({
  records,
  isLoading,
  personLabel = 'Farmer',
  commodityLabel = 'Crop',
  dateLabel = 'Date Planted',
}) {
  const groups = useMemo(() => {
    const map = new Map()
    for (const r of records) {
      const key = r.person || '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    return Array.from(map.entries())
      .map(([person, recs]) => {
        const harvested = recs.filter(r => r.variancePct !== null && r.variancePct !== undefined)
        const avgVar = harvested.length
          ? harvested.reduce((s, r) => s + r.variancePct, 0) / harvested.length
          : null
        return { person, recs, count: recs.length, harvestedCount: harvested.length, avgVar }
      })
      .sort((a, b) => a.person.localeCompare(b.person))
  }, [records])

  const [expanded, setExpanded] = useState(() => new Set())
  const toggle = (person) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(person) ? next.delete(person) : next.add(person)
    return next
  })

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[12px] text-amber-800 leading-relaxed">{DISCLAIMER}</p>
      </div>

      <div className={`overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-md:overflow-hidden ${STACK_TABLES}`}>
        <table className="min-w-full text-sm">
          <thead className="bg-[#1B4D2E] text-white">
            <tr>
              {['', personLabel, 'Records', 'Harvested', 'Avg Variance'].map((h, i) => (
                <th key={i} className="px-3 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="py-8 text-center text-[13px] text-[#7A8E7A]">Loading…</td></tr>
            ) : groups.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-[13px] text-[#7A8E7A]">No records found in scope.</td></tr>
            ) : groups.map(g => {
              const isOpen = expanded.has(g.person)
              return (
                <Fragment key={g.person}>
                  <tr onClick={() => toggle(g.person)} className="border-b border-[#F0F4F0] hover:bg-[#F9FAF9] cursor-pointer max-md:grid! max-md:grid-cols-3 max-md:gap-x-3">
                    <td className="px-3 py-[11px] text-[#7A8E7A] max-md:hidden!">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td className="max-md:col-span-3 max-md:flex! max-md:items-center max-md:justify-between gap-2 px-3 py-[11px] text-[13px] font-semibold text-[#1A2B1A] max-md:text-[15px] md:whitespace-nowrap">{g.person}<span className="text-[#7A8E7A] md:hidden">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span></td>
                    <td data-label="Records" className="px-3 py-[11px] text-[13px] text-[#1A2B1A]">{g.count}</td>
                    <td data-label="Harvested" className="px-3 py-[11px] text-[13px] text-[#1A2B1A]">{g.harvestedCount}</td>
                    <td data-label="Avg variance" className="px-3 py-[11px]">
                      <Pill pct={g.avgVar} label={g.avgVar === null ? 'N/A' : undefined} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-[#F0F4F0] bg-[#F9FAF9]">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="overflow-x-auto rounded-lg border border-[#E2E8E2] bg-white">
                          <table className="min-w-full text-[12px]">
                            <thead className="text-[#4A5E4A]">
                              <tr className="border-b border-[#F0F4F0]">
                                {[commodityLabel, 'Land Status', dateLabel, 'Status', 'Harvest Date', 'Variance'].map((h, i) => (
                                  <th key={i} className="px-3 py-2 text-left font-semibold uppercase tracking-[0.05em] text-[10px] whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {g.recs.map(r => (
                                <tr key={r.id} className="border-b border-[#F5F7F5] last:border-0 max-md:grid! max-md:grid-cols-2 max-md:gap-x-3">
                                  <td className="px-3 py-2 font-semibold text-[#1A2B1A] max-md:col-span-2 md:whitespace-nowrap">
                                    {r.commodity}
                                    {r.isTotalLoss && (
                                      <span className="ml-1.5 rounded-full bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">Total Loss</span>
                                    )}
                                  </td>
                                  <td data-label="Land status" className="px-3 py-2 text-[#4A5E4A] md:whitespace-nowrap">{r.landStatus || '—'}</td>
                                  <td data-label={dateLabel} className="px-3 py-2 text-[#4A5E4A] md:whitespace-nowrap">{fmtDate(r.dateField)}</td>
                                  <td data-label="Status" className="px-3 py-2 text-[#4A5E4A] md:whitespace-nowrap">{r.status}</td>
                                  <td data-label="Harvest date" className="px-3 py-2 text-[#4A5E4A] md:whitespace-nowrap">{r.status === 'Harvested' ? fmtDate(r.harvestDate) : '—'}</td>
                                  <td data-label="Variance" className="px-3 py-2 md:whitespace-nowrap"><RecordVariance rec={r} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
