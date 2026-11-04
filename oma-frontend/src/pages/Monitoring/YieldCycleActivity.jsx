import { hasRecordedActivity, factorLines } from '../../utils/fisheriesYieldLogs.js'
import { LogCell, LogHead, LogRow, LogTable, LogTh } from './LogFormTable.jsx'

// The saved Feeding Logs and Health Logs of a harvested stocking's production cycle, in the expanded row of Fisheries Yield Analysis (and the
// phone card): the recorded facts as possible contributing factors, a summary per pond/cage, and the logs themselves with their dates and
// observations. Read from rec.cycle_activity (fisheries/yield_cycle_logs.py); nothing here is invented or claimed as a cause.
const fmtKg = (v) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v)

function Heading({ children }) {
  return <p className="mb-1.5 text-[12px] font-semibold text-[#1A2B1A]">{children}</p>
}

export default function YieldCycleActivity({ rec }) {
  const activity = rec.cycle_activity
  if (!activity) return null
  if (!hasRecordedActivity(activity)) {
    return (
      <p className="text-[12px] text-[#7A8E7A]" data-testid="yield-no-logs">
        No Feeding Log or Health Log has been recorded for this production cycle.
      </p>
    )
  }
  const factors = factorLines(rec)
  const { feeding, health, units } = activity
  return (
    <div className="space-y-4" data-testid="yield-cycle-activity">
      <div>
        <Heading>Recorded factors <span className="font-normal text-[#7A8E7A]">— what was logged for this production cycle; possible contributing factors, not proven causes</span></Heading>
        <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-[#4A5E4A]" data-testid="yield-factor-lines">
          {factors.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>

      {units.length > 0 && (
        <div>
          <Heading>By pond/cage</Heading>
          <LogTable label="Activity by pond or cage" testId="yield-unit-summary">
            <LogHead>
              <LogTh>Pond/Cage</LogTh><LogTh className="md:text-right">Feed given (kg)</LogTh><LogTh className="md:text-right">Health Logs</LogTh>
              <LogTh className="md:text-right">Mortality</LogTh><LogTh>Force Harvest</LogTh>
            </LogHead>
            <tbody>
              {units.map((u) => (
                <LogRow key={u.unit_label}>
                  <LogCell label="Pond/Cage" className="font-semibold text-[#1A2B1A]">{u.unit_label}</LogCell>
                  <LogCell label="Feed given (kg)" className="md:text-right">{fmtKg(u.feeding_kg)}</LogCell>
                  <LogCell label="Health Logs" className="md:text-right">{u.health_logs}</LogCell>
                  <LogCell label="Mortality" className="md:text-right">{u.mortality || '—'}</LogCell>
                  <LogCell label="Force Harvest">{u.force_harvest ? <span className="font-semibold text-rose-700">Recorded</span> : '—'}</LogCell>
                </LogRow>
              ))}
            </tbody>
          </LogTable>
        </div>
      )}

      {health.count > 0 && (
        <div>
          <Heading>Health Logs ({health.count})</Heading>
          <LogTable label="Health Logs of the production cycle" testId="yield-health-logs">
            <LogHead>
              <LogTh>Date</LogTh><LogTh>Pond/Cage</LogTh><LogTh>Observation</LogTh><LogTh className="md:text-right">Mortality</LogTh><LogTh>Treatment</LogTh><LogTh>Notes</LogTh>
            </LogHead>
            <tbody>
              {health.logs.map((l) => (
                <LogRow key={l.id}>
                  <LogCell label="Date" className="whitespace-nowrap">{l.date}</LogCell>
                  <LogCell label="Pond/Cage">{dash(l.unit_label)}</LogCell>
                  <LogCell label="Observation">{l.observation}{l.force_harvest && <span className="ml-1.5 text-[10px] font-semibold text-rose-700">⚠ Force Harvest</span>}</LogCell>
                  <LogCell label="Mortality" className="md:text-right">{l.mortality_count || '—'}</LogCell>
                  <LogCell label="Treatment">{dash(l.treatment_applied)}</LogCell>
                  <LogCell label="Notes">{dash(l.notes)}</LogCell>
                </LogRow>
              ))}
            </tbody>
          </LogTable>
        </div>
      )}

      {feeding.count > 0 && (
        <div>
          <Heading>Feeding Logs ({feeding.count}) — {fmtKg(feeding.total_kg)} kg in all</Heading>
          <LogTable label="Feeding Logs of the production cycle" testId="yield-feeding-logs">
            <LogHead>
              <LogTh>Date</LogTh><LogTh>Feed type</LogTh><LogTh className="md:text-right">Quantity (kg)</LogTh><LogTh>Per pond/cage</LogTh><LogTh>Notes</LogTh>
            </LogHead>
            <tbody>
              {feeding.logs.map((l) => (
                <LogRow key={l.id}>
                  <LogCell label="Date" className="whitespace-nowrap">{l.date}</LogCell>
                  <LogCell label="Feed type">{l.feed_type}</LogCell>
                  <LogCell label="Quantity (kg)" className="md:text-right">{fmtKg(l.quantity_kg)}</LogCell>
                  <LogCell label="Per pond/cage">{l.units.length ? l.units.map((u) => `${u.unit_label}: ${fmtKg(u.quantity_kg)} kg`).join(' · ') : '—'}</LogCell>
                  <LogCell label="Notes">{dash(l.notes)}</LogCell>
                </LogRow>
              ))}
            </tbody>
          </LogTable>
        </div>
      )}
    </div>
  )
}
