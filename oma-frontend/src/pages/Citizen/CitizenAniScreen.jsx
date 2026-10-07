import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Leaf, Sprout, Wheat } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { DATE_LOCALE, labels } from './labels.js'
import { CROP_THEME, CitizenBody, CitizenScreen, CitizenSubHeader } from './citizenUI.jsx'

// ─── Harvest Results (frames 32-33) ────────────────────────────────────
// One card per harvested crop: a variance chip, the actual and estimated
// yields as paired bars, a plain-language verdict, and -- only when there
// are any -- the unlogged activities that fell in that cycle.
//
// Everything here is BACKWARD-looking. The same endpoint feeds the staff
// forecasting screens, but this screen deliberately shows no projection: the
// intro panel says as much in the reference's own words, because a farmer
// reading a number next to their crop will otherwise take it as a promise.
//
// The bars are proportional to the LARGER of the two values, so actual and
// estimated stay visually comparable to each other rather than each being
// scaled to its own width.

const MT = (kg) => {
  if (kg === null || kg === undefined) return null
  const n = Number(kg)
  if (!Number.isFinite(n)) return null
  return n / 1000
}

const fmtMT = (kg) => {
  const t = MT(kg)
  return t === null ? labels.common.unknown : `${t.toFixed(2)} MT`
}

const fmtSignedMT = (kg) => {
  const t = MT(kg)
  if (t === null) return null
  return `${t > 0 ? '+' : ''}${t.toFixed(2)} MT`
}

const fmtPct = (pct) => (pct === null || pct === undefined ? null : `${pct > 0 ? '+' : ''}${Math.round(pct)}%`)

const fmtLongDate = (iso) => {
  if (!iso) return null
  return new Intl.DateTimeFormat(DATE_LOCALE, { month: 'long', day: 'numeric', year: 'numeric' })
    .format(new Date(`${iso}T00:00:00`))
}

// The backend reports a missed activity as a day offset from planting. The
// reference shows the month it landed in, which is that offset applied to
// date_planted -- derived here rather than asking the API for a second
// representation of the same fact.
const monthOfOffset = (datePlanted, dayOffset) => {
  if (!datePlanted || dayOffset === null || dayOffset === undefined) return null
  const d = new Date(`${datePlanted}T00:00:00`)
  d.setDate(d.getDate() + Number(dayOffset))
  return new Intl.DateTimeFormat(DATE_LOCALE, { month: 'long' }).format(d)
}

const CROP_ICON = { Palay: Wheat, Rice: Wheat, Corn: Sprout, Mais: Sprout }

// Declared at module scope rather than picked inside HarvestCard: choosing a
// component during render remounts it whenever the branch changes.
function CropIcon({ name, ...rest }) {
  const Icon = CROP_ICON[name] || Leaf
  return <Icon {...rest} />
}

function Bar({ pct, tone }) {
  return (
    <div className="mt-1.5 h-[9px] w-full overflow-hidden rounded-full bg-cz-track">
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  )
}

function HarvestCard({ rec }) {
  const A = labels.ffNew.ani

  const above = rec.variance_pct !== null && rec.variance_pct > 0
  const below = rec.variance_pct !== null && rec.variance_pct < 0
  const noEstimate = rec.estimated_kg === null || rec.variance_pct === null

  const headTone = rec.is_total_loss ? 'bg-cz-danger-bg'
    : above ? 'bg-cz-crop-pale'
      : below ? 'bg-cz-warn-bg' : 'bg-cz-page'
  const chipTone = rec.is_total_loss ? 'bg-cz-danger-bg text-cz-danger-accent'
    : above ? 'bg-cz-crop-pale text-cz-crop-deeper'
      : below ? 'bg-cz-warn-bg text-cz-warn-accent' : 'bg-cz-page text-cz-text-2'
  const barTone = above ? 'bg-cz-crop-fill' : below ? 'bg-cz-warn-accent' : 'bg-cz-text-muted'

  const max = Math.max(Number(rec.actual_total_kg) || 0, Number(rec.estimated_kg) || 0) || 1
  const actualPct = ((Number(rec.actual_total_kg) || 0) / max) * 100
  const estPct = ((Number(rec.estimated_kg) || 0) / max) * 100

  const verdict = rec.is_total_loss ? A.verdictTotalLoss
    : noEstimate ? A.verdictNoEstimate
      : above ? A.verdictAbove
        : below ? A.verdictBelow : A.verdictOnTarget

  const factors = (rec.missed_high_priority || []).map((m) => ({
    activity: m.activity,
    month: monthOfOffset(rec.date_planted || rec.date_stocked, m.scheduled_day),
  }))

  return (
    <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface">
      <div className={`flex items-start gap-3 px-4 py-3.5 ${headTone}`}>
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-cz-surface/70">
          <CropIcon name={rec.crop_type || rec.species} size={19} className="text-cz-text-2" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-[1.2] text-cz-text">{rec.crop_type || rec.species}</p>
          <p className="mt-0.5 text-[12.5px] leading-[1.4] text-cz-text-2">
            {A.meta(
              rec.area_planted_ha,
              rec.barangay && rec.barangay !== '—' ? rec.barangay : null,
              fmtLongDate(rec.harvest_dates?.[rec.harvest_dates.length - 1]),
            )}
          </p>
        </div>
        {!noEstimate && (
          <div className={`shrink-0 rounded-[8px] px-2.5 py-1.5 text-right ${chipTone}`}>
            <p className="text-[15px] font-bold leading-[1.15] tabular-nums">{fmtSignedMT(rec.variance_kg)}</p>
            <p className="text-[12px] leading-[1.2] tabular-nums">{fmtPct(rec.variance_pct)}</p>
          </div>
        )}
      </div>

      <div className="px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13.5px] text-cz-text-2">{A.actual}</p>
          <p className={`text-[16px] font-bold tabular-nums ${above ? 'text-cz-crop-deeper' : below ? 'text-cz-warn-accent' : 'text-cz-text'}`}>
            {fmtMT(rec.actual_total_kg)}
          </p>
        </div>
        <Bar pct={actualPct} tone={barTone} />

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <p className="text-[13.5px] text-cz-text-2">{A.estimated}</p>
          <p className="text-[16px] font-bold tabular-nums text-cz-text">
            {rec.estimated_kg === null ? labels.common.unknown : fmtMT(rec.estimated_kg)}
          </p>
        </div>
        <Bar pct={estPct} tone="bg-cz-text-muted/45" />

        <div className={`mt-3.5 rounded-[10px] border-[0.5px] px-3.5 py-3 ${
          above ? 'border-cz-crop-deep/25 bg-cz-crop-pale' : 'border-cz-border bg-cz-surface'
        }`}
        >
          <div className="flex gap-2">
            {above && <CheckCircle2 size={16} className="mt-[2px] shrink-0 text-cz-crop-deeper" aria-hidden="true" />}
            <p className="text-[13.5px] leading-[1.5] text-cz-text">{verdict}</p>
          </div>
        </div>

        {factors.length > 0 && (
          <div className="mt-3 rounded-[10px] border-[0.5px] border-cz-warn-accent/25 bg-cz-warn-bg px-3.5 py-3">
            <p className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.04em] text-cz-warn-accent">
              <AlertTriangle size={14} aria-hidden="true" />
              {A.factorsHeading}
            </p>
            <ul className="space-y-1">
              {factors.map((f, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-[1.5] text-cz-text">
                  <span aria-hidden="true" className="text-cz-text-muted">&middot;</span>
                  <span className="min-w-0 flex-1">{A.factorItem(f.activity, f.month)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] italic leading-[1.5] text-cz-text-2">{A.factorsFootnote}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CitizenAniScreen({ endpoint, onBack, tabBar, bare = false }) {
  const A = labels.ffNew.ani
  const [records, setRecords] = useState(null)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.get(endpoint)
      .then((r) => { if (!cancelled) setRecords(r.data?.records || []) })
      .catch(() => { if (!cancelled) { setRecords([]); setHasError(true) } })
    return () => { cancelled = true }
  }, [endpoint])

  const body = (
    <>
      <div className="mb-4 rounded-[10px] border-[0.5px] border-cz-crop-deep/20 bg-cz-crop-pale px-4 py-3.5">
        <p className="text-[13px] leading-[1.55] text-cz-text-2">{A.intro}</p>
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

      {/* Desktop reference draws a 3-up grid, not a stacked list -- cheap to
          honour since the cards were already fixed-width-agnostic. */}
      <div className={bare ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>
        {(records || []).map((rec) => <HarvestCard key={rec.id} rec={rec} />)}
      </div>
    </>
  )

  // Desktop mode: no CitizenScreen/SubHeader/tab bar -- the parent's
  // DesktopShell supplies the sidebar, topbar and right rail around this.
  if (bare) return body

  return (
    <CitizenScreen hasTabBar>
      <CitizenSubHeader theme={CROP_THEME} title={A.title} subtitle={A.subtitle} onBack={onBack} />
      <CitizenBody>{body}</CitizenBody>
      {tabBar}
    </CitizenScreen>
  )
}
