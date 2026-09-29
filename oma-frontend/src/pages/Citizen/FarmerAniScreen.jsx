import { useEffect, useState } from 'react'
import { Leaf, Sprout, Wheat } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { DATE_LOCALE, labels } from './labels.js'
import { CROP_THEME, CitizenBody, CitizenHomeHeader, CitizenScreen } from './citizenUI.jsx'
import { dayFirstLong } from './farmerDates.js'

// Farmer "Resulta ng ani" screen, rebuilt to UPDATED FARMER CITIZEN UI.docx.
// A Farmer-only copy of CitizenAniScreen: that component is also what
// Fisherfolk's desktop Ani screen renders, so it is left exactly as it was.
//
// Same endpoint, same numbers, same backward-looking rule as before — nothing
// here projects the future. What changed is presentation and one addition:
// each card links to that crop's history.
//
// Tone rule from the reference: a result at or above the estimate is "good"
// (green header/bar), below it is "below" (amber), a total loss is red, and a
// crop with no estimate stays neutral. Zero variance counts as good.

const MT = (kg) => {
  if (kg === null || kg === undefined) return null
  const n = Number(kg)
  return Number.isFinite(n) ? n / 1000 : null
}

const fmtMT = (kg) => {
  const t = MT(kg)
  return t === null ? labels.common.unknown : `${t.toFixed(2)} MT`
}

const fmtSignedMT = (kg) => {
  const t = MT(kg)
  return t === null ? null : `${t >= 0 ? '+' : ''}${t.toFixed(2)} MT`
}

const fmtPct = (pct) => (pct === null || pct === undefined ? null : `${pct >= 0 ? '+' : ''}${Math.round(pct)}%`)

// Backend reports a missed activity as a day offset from planting; the card
// shows the month it landed in.
const monthOfOffset = (datePlanted, dayOffset) => {
  if (!datePlanted || dayOffset === null || dayOffset === undefined) return null
  const d = new Date(`${datePlanted}T00:00:00`)
  d.setDate(d.getDate() + Number(dayOffset))
  return new Intl.DateTimeFormat(DATE_LOCALE, { month: 'long' }).format(d)
}

const CROP_ICON = { Palay: Wheat, Rice: Wheat, Corn: Sprout, Mais: Sprout }

function CropIcon({ name, ...rest }) {
  const Icon = CROP_ICON[name] || Leaf
  return <Icon {...rest} />
}

// Fill only, no track: the reference draws the bar as a bare rounded fill, so
// an empty (0) actual bar simply leaves a blank row.
function Bar({ pct, tone }) {
  return (
    <div className="mt-1.5 h-2 w-full">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

function VarianceChip({ rec, bare }) {
  return (
    <div className={`rounded-[10px] bg-cz-surface px-3 py-1.5 leading-[1.3] tabular-nums ${bare ? 'shrink-0 text-right' : 'inline-block'}`}>
      <p className="text-[12px] font-bold text-cz-crop-header">{fmtSignedMT(rec.variance_kg)}</p>
      <p className="text-[12px] font-medium text-cz-text-2">{fmtPct(rec.variance_pct)}</p>
    </div>
  )
}

function ResultCard({ rec, bare, onViewHistory }) {
  const A = labels.ffNew.ani
  const F = labels.farmerAni

  const noEstimate = rec.estimated_kg === null || rec.variance_pct === null
  const good = !noEstimate && rec.variance_pct >= 0
  const below = !noEstimate && rec.variance_pct < 0

  const headTone = rec.is_total_loss ? 'bg-cz-danger-bg'
    : good ? 'bg-cz-crop-pale'
      : below ? 'bg-cz-warn-bg' : 'bg-cz-page'
  const actualTone = good ? 'bg-cz-crop-fill' : below ? 'bg-cz-warn-accent' : 'bg-cz-text-muted'

  const max = Math.max(Number(rec.actual_total_kg) || 0, Number(rec.estimated_kg) || 0) || 1
  const actualPct = ((Number(rec.actual_total_kg) || 0) / max) * 100
  const estPct = ((Number(rec.estimated_kg) || 0) / max) * 100

  const verdict = rec.is_total_loss ? A.verdictTotalLoss
    : noEstimate ? A.verdictNoEstimate
      : rec.variance_pct > 0 ? A.verdictAbove
        : rec.variance_pct < 0 ? A.verdictBelow : A.verdictOnTarget

  const factors = (rec.missed_high_priority || []).map((m) => ({
    activity: m.activity,
    month: monthOfOffset(rec.date_planted, m.scheduled_day),
  }))

  const chip = !noEstimate && <VarianceChip rec={rec} bare={bare} />

  return (
    <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface">
      <div className={`flex items-start gap-3 px-3 py-[14px] ${headTone}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-cz-surface/70">
          <CropIcon name={rec.crop_type} size={18} className="text-cz-crop-header" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-[1.25] text-cz-text">{rec.crop_type}</p>
          <p className="mt-0.5 text-[11px] leading-[1.4] text-cz-text-2">
            {A.meta(
              rec.area_planted_ha,
              rec.barangay && rec.barangay !== '—' ? rec.barangay : null,
              dayFirstLong(rec.harvest_dates?.[rec.harvest_dates.length - 1]),
            )}
          </p>
          {!bare && chip && <div className="mt-2.5">{chip}</div>}
        </div>
        {bare && chip}
      </div>

      <div className="px-3 pb-4 pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[12px] text-cz-text-2">{A.actual}</p>
          <p className="text-[12px] font-bold tabular-nums text-cz-text-2">{fmtMT(rec.actual_total_kg)}</p>
        </div>
        <Bar pct={actualPct} tone={actualTone} />

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <p className="text-[12px] text-cz-text-2">{A.estimated}</p>
          <p className="text-[12px] font-bold tabular-nums text-cz-text-2">
            {rec.estimated_kg === null ? F.none : fmtMT(rec.estimated_kg)}
          </p>
        </div>
        {rec.estimated_kg !== null && <Bar pct={estPct} tone="bg-cz-border-strong" />}

        <p className="mt-3.5 rounded-[10px] bg-cz-page px-2.5 py-2 text-[13px] leading-[18px] text-cz-text-2">{verdict}</p>

        {factors.length > 0 && (
          <div className="mt-3 rounded-[10px] border-[0.5px] border-cz-border bg-cz-surface px-3 py-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-cz-text">{A.factorsHeading}</p>
            <ul className="space-y-1">
              {factors.map((f, i) => (
                <li key={i} className="text-[12.5px] leading-[1.5] text-cz-text">{A.factorItem(f.activity, f.month)}</li>
              ))}
            </ul>
            <p className="mt-2 text-[9.5px] leading-[1.5] text-cz-text-2">{A.factorsFootnote}</p>
          </div>
        )}

        <button type="button" onClick={() => onViewHistory?.(rec)} className="mt-4 block text-left">
          <span className="text-[13px] text-cz-crop-header underline underline-offset-4">{F.viewHistory}</span>
        </button>
      </div>
    </div>
  )
}

export default function FarmerAniScreen({ onViewHistory, tabBar, bare = false }) {
  const A = labels.ffNew.ani
  const [records, setRecords] = useState(null)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.get('/production/yield-analysis/')
      .then((r) => { if (!cancelled) setRecords(r.data?.records || []) })
      .catch(() => { if (!cancelled) { setRecords([]); setHasError(true) } })
    return () => { cancelled = true }
  }, [])

  const body = (
    <>
      <div className="mb-3 rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-3.5 py-3">
        <p className="text-[13px] leading-[1.4] text-cz-text-2">{A.intro}</p>
      </div>

      {records === null && (
        <p className="py-6 text-center text-[13px] italic text-cz-text-2">{labels.common.loading}</p>
      )}
      {hasError && (
        <p className="py-6 text-center text-[13px] text-cz-danger-accent">{A.loadError}</p>
      )}
      {records !== null && !hasError && records.length === 0 && (
        <p className="px-2 py-8 text-center text-[13px] italic leading-[1.6] text-cz-text-muted">{A.empty}</p>
      )}

      <div className={bare ? 'grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>
        {(records || []).map((rec) => (
          <ResultCard key={rec.id} rec={rec} bare={bare} onViewHistory={onViewHistory} />
        ))}
      </div>
    </>
  )

  // Desktop: the parent's shell supplies sidebar and topbar. The reference
  // centres the content at 980px, with no page-title row.
  if (bare) return <div className="mx-auto w-full max-w-[1028px] px-6 py-5">{body}</div>

  // Phone: the reference goes straight from the app header to the intro card,
  // so there is no back link or title row.
  return (
    <CitizenScreen hasTabBar>
      <CitizenHomeHeader theme={CROP_THEME} />
      <CitizenBody className="!pt-3">{body}</CitizenBody>
      {tabBar}
    </CitizenScreen>
  )
}
