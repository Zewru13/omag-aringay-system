import StatusPill from '../../components/UI/StatusPill.jsx'
import { ForcedHarvestLabel } from './ForcedHarvestDetails.jsx'
import { fmtLong } from './stockingHelpers.js'

// The ponds/cages of ONE stocking record's production cycle, shown under its row in Fisheries Monitoring and
// Fisheries Forecasting. Data: GET /fisheries/stocking/<id>/production-units/ (StockingProductionUnitsView),
// loaded by useExpandableProductionUnits - every value is a recorded one; anything missing renders as "—".
//
// forecast: Fisheries Forecasting's variant - adds an Estimated Harvest Date column (`estimatedHarvestDate`,
// the record's own backend expected_harvest_date: the units share the record's stocking date and species, so
// no per-unit date is computed) and labels the harvest date "Actual Harvest Date".
// headerAction: optional element shown at the top-right of the panel (Fisheries Monitoring passes its
// "View Cycle Details & Logs" button; Fisheries Forecasting passes none).

const UNIT_STATUS = {
  in_progress:            { label: 'In Progress',            tone: 'green' },
  awaiting_force_harvest: { label: 'Awaiting Force Harvest', tone: 'rose' },
  harvested:              { label: 'Harvested',              tone: 'teal' },
  force_harvested:        { label: 'Force Harvested',        tone: 'rose' },
  forced_harvest:         { label: 'Forced Harvested',       tone: 'rose' },   // the emergency Force Harvest (⋮ menu); the Health Log one stays 'Force Harvested'
  cycle_harvested:        { label: 'Cycle Harvested (not itemized)', tone: 'slate' },
  total_loss:             { label: 'Total Loss',             tone: 'rose' },
}

const HARVESTED_STATUSES = new Set(['harvested', 'force_harvested', 'forced_harvest'])

const fmtKg = (v) => (v == null ? '—'
  : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const fmtM = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
const fmtDims = (u) => (u.length_m != null && u.width_m != null ? `${fmtM(u.length_m)} m × ${fmtM(u.width_m)} m` : '—')
const fmtCount = (v) => (v == null ? '—' : Number(v).toLocaleString())
const fmtDates = (dates) => (dates?.length ? dates.map(fmtLong).join(', ') : '—')

function actualKgCell(u) {
  if (u.actual_harvest_kg != null) return fmtKg(u.actual_harvest_kg)
  // Harvested inside an older combined record: only the record's total exists, so no own kg is shown.
  if (u.in_combined_harvest) return <span className="text-[#7A8E7A]" title="Recorded only as a combined total with other units">— (combined)</span>
  return '—'
}

// The pond / cage name; an emergency-force-harvested one carries the clickable FORCED HARVEST label (its saved details).
function UnitName({ unit }) {
  return (
    <span className="inline-flex items-center gap-2">
      {unit.label}
      {unit.forced_harvest && <ForcedHarvestLabel harvestId={unit.forced_harvest.id} />}
    </span>
  )
}

function UnitStatus({ unit }) {
  const s = UNIT_STATUS[unit.status] || { label: unit.status || '—', tone: 'slate' }
  const title = unit.force_harvest_reasons?.length ? `Health Log: ${unit.force_harvest_reasons.join('; ')}` : undefined
  return <span title={title}><StatusPill tone={s.tone}>{s.label}</StatusPill></span>
}

// "2 of 3 ponds harvested" - a cycle is never shown as harvested because one unit was.
function summaryText(units) {
  const noun = units[0]?.unit_type === 'cage' ? 'cage' : 'pond'
  const done = units.filter(u => HARVESTED_STATUSES.has(u.status)).length
  return `${units.length} ${noun}${units.length === 1 ? '' : 's'} · ${done} of ${units.length} harvested`
}

function StateMessage({ state, onRetry, compact }) {
  const cls = compact ? 'px-1 py-2 text-[12px]' : 'px-4 py-4 text-[13px]'
  if (!state || state.status === 'loading') {
    return <p className={`${cls} text-[#7A8E7A]`} role="status">Loading ponds/cages…</p>
  }
  if (state.status === 'error') {
    return (
      <p className={`${cls} text-rose-600`} role="alert">
        Failed to load the ponds/cages of this cycle.{' '}
        <button type="button" onClick={onRetry} className="font-semibold underline">Retry</button>
      </p>
    )
  }
  return (
    <p className={`${cls} text-[#7A8E7A]`}>
      {state.hasCycle ? 'No ponds or cages are recorded for this production cycle.'
        : 'This stocking record is not linked to a production cycle, so it has no ponds or cages.'}
    </p>
  )
}

// Column definitions shared by the table and the cards; `forecast` adds the estimated date column.
function unitFields({ speciesName, forecast, estimatedHarvestDate }) {
  return [
    { label: 'Production Unit', align: 'text-left', cell: u => <UnitName unit={u} />, card: false, strong: true },
    { label: 'Species', align: 'text-left', cell: () => speciesName || '—' },
    { label: forecast ? 'Fingerlings Count' : 'Fingerlings', align: 'text-right', cell: u => fmtCount(u.fingerling_count) },
    { label: 'Dimensions', align: 'text-left', cell: fmtDims },
    { label: 'Area (m²)', align: 'text-right', cell: u => fmtKg(u.size_sqm) },
    { label: 'Est. Harvest (kg)', align: 'text-right', cell: u => fmtKg(u.estimated_harvest_kg) },
    { label: 'Actual Harvest (kg)', align: 'text-right', cell: actualKgCell },
    forecast && { label: 'Est. Harvest Date', align: 'text-left', cell: () => fmtLong(estimatedHarvestDate) },
    { label: forecast ? 'Actual Harvest Date' : 'Date Harvested', align: 'text-left', cell: u => fmtDates(u.harvest_dates) },
    { label: 'Status', align: 'text-left', cell: u => <UnitStatus unit={u} />, card: false },
  ].filter(Boolean)
}

function PanelHeader({ units, headerAction }) {
  if (!units?.length && !headerAction) return null
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <p className="text-[12px] font-semibold text-[#1B4D2E]">{units?.length ? summaryText(units) : ''}</p>
      {headerAction}
    </div>
  )
}

// Desktop: a nested table inside the expanded row (its own horizontal scroll on narrow screens).
export function ProductionUnitsTable({ state, speciesName, onRetry, forecast = false, estimatedHarvestDate, headerAction }) {
  const units = state?.status === 'ok' ? state.units : null
  const fields = unitFields({ speciesName, forecast, estimatedHarvestDate })
  return (
    <div className="border-l-4 border-[#1B4D2E] bg-[#F5F8F5] px-4 py-3" data-testid="production-units-panel">
      <PanelHeader units={units} headerAction={headerAction} />
      {units?.length ? (
        <div className="overflow-x-auto rounded-lg border border-[#E2E8E2] bg-white">
          <table className="min-w-full text-[13px]" data-testid="production-units-table">
            <thead className="bg-[#F9FAF9] text-[11px] uppercase tracking-[0.06em] text-[#7A8E7A]">
              <tr>
                {fields.map(f => (
                  <th key={f.label} className={`whitespace-nowrap px-3 py-2 font-semibold ${f.align}`}>{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {units.map(u => (
                <tr key={u.id} className="border-t border-[#F0F4F0]" data-testid="production-unit-row">
                  {fields.map(f => (
                    <td key={f.label} className={`whitespace-nowrap px-3 py-2 ${f.align === 'text-right' ? 'text-right tabular-nums' : ''} ${f.strong ? 'font-semibold text-[#1A2B1A]' : ''}`}>
                      {f.cell(u)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <StateMessage state={state} onRetry={onRetry} />
      )}
    </div>
  )
}

// Phones: one compact card per pond/cage instead of the wide nested table.
export function ProductionUnitsCards({ state, speciesName, onRetry, forecast = false, estimatedHarvestDate, headerAction }) {
  const units = state?.status === 'ok' ? state.units : null
  const fields = unitFields({ speciesName, forecast, estimatedHarvestDate }).filter(f => f.card !== false)
  return (
    <div className="space-y-2" data-testid="production-units-cards">
      <PanelHeader units={units} headerAction={headerAction} />
      {!units?.length ? <StateMessage state={state} onRetry={onRetry} compact /> : units.map(u => (
        <div key={u.id} className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] p-3" data-testid="production-unit-card">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-[#1A2B1A]"><UnitName unit={u} /></span>
            <UnitStatus unit={u} />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
            {fields.map(f => (
              <div key={f.label} className="min-w-0">
                <dt className="text-[10px] font-medium uppercase tracking-wide text-[#7A8E7A]">{f.label}</dt>
                <dd className="break-words text-[#1A2B1A]">{f.cell(u)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}
