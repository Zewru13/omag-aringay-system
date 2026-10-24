import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { estimateText, fmtKg } from './emergencyForceHarvest.js'
import { fmtLong } from './stockingHelpers.js'

// The FORCED HARVEST label of an emergency Force Harvest (Aquaculture Monitoring ⋮ menu > Force Harvest) and the window it opens.
// Separate from the red HP / HC badges of the Health Log Force Harvest, which are unchanged. The window shows the SAVED record
// (GET /fisheries/force-harvest/<id>/), never state kept in the page, and everything in it is a table.

const HEAD = 'bg-[#1B4D2E] text-white'
const TH = 'whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em]'

// One saved Force Harvest as its two tables: the details, then each affected pond / cage with its estimate and actual kg.
function ForcedHarvestTables({ d }) {
  const summary = [
    ['Fisherfolk', d.fisherfolk_name || '—'],
    ['Species', d.species || '—'],
    ['Production Cycle', [d.cycle_number ? `Cycle ${d.cycle_number}` : null, d.cycle_name].filter(Boolean).join(' · ') || '—'],
    ['Harvest Date', fmtLong(d.harvest_date)],
    ['Reason for Force Harvest', d.reason_label || '—'],
    ['Recorded By', d.recorded_by_name || '—'],
  ]
  return (
    <div className="space-y-4" data-testid="forced-harvest-details">
      <div className="overflow-x-auto rounded-xl border border-[#E2E8E2]">
        <table className="min-w-full text-[13px]">
          <thead className={HEAD}><tr><th className={TH}>Detail</th><th className={TH}>Value</th></tr></thead>
          <tbody>
            {summary.map(([label, value]) => (
              <tr key={label} className="border-t border-[#F0F4F0] align-top">
                <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-[#4A5E4A]">{label}</th>
                <td className="px-3 py-2 font-semibold text-[#1A2B1A]">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E2E8E2]">
        <table className="min-w-full text-[13px]" data-testid="forced-harvest-units">
          <thead className={HEAD}>
            <tr>
              <th className={TH}>Production Unit</th>
              <th className={`${TH} text-right`}>Estimated Harvest (kg)</th>
              <th className={`${TH} text-right`}>Actual Harvest (kg)</th>
            </tr>
          </thead>
          <tbody>
            {d.units.map((u) => (
              <tr key={u.id} className="border-t border-[#F0F4F0]">
                <td className="px-3 py-2 font-semibold text-[#1A2B1A]">{u.label}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${u.estimated_harvest_kg == null ? 'italic text-[#7A8E7A]' : ''}`}>{estimateText(u.estimated_harvest_kg)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtKg(u.actual_harvest_kg)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#E2E8E2] bg-[#F9FAF9] font-bold">
              <td className="px-3 py-2" colSpan={2}>Total actual harvest (kg)</td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="forced-harvest-total">{fmtKg(d.total_actual_kg)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// `harvestIds`: every saved Force Harvest to show (a cycle can have more than one; each gets its own two tables, oldest first).
export function ForcedHarvestDetailsModal({ harvestId, harvestIds, onClose }) {
  const ids = harvestIds && harvestIds.length ? harvestIds : [harvestId]
  const key = ids.join(',')
  const [state, setState] = useState({ key: null, list: null, failed: false })

  useEffect(() => {
    let alive = true
    Promise.all(key.split(',').map((id) => api.get(`/fisheries/force-harvest/${id}/`).then((r) => r.data)))
      .then((list) => { if (alive) setState({ key, list, failed: false }) })
      .catch(() => { if (alive) setState({ key, list: null, failed: true }) })
    return () => { alive = false }
  }, [key])

  const loading = state.key !== key
  const list = loading ? null : state.list

  return (
    <ModalShell
      title="Forced Harvest Details"
      subtitle="Emergency Force Harvest, as saved"
      icon={AlertTriangle}
      iconBg="bg-red-50"
      iconColor="text-red-600"
      maxWidth="max-w-3xl"
      onClose={onClose}
    >
      {loading && <p className="py-6 text-center text-[13px] italic text-[#7A8E7A]" role="status">Loading…</p>}
      {!loading && state.failed && (
        <p className="py-6 text-center text-[13px] text-rose-600" role="alert">The Force Harvest details could not be loaded.</p>
      )}
      {list && (
        <div className="space-y-6">
          {list.map((d) => <ForcedHarvestTables key={d.id} d={d} />)}
        </div>
      )}
    </ModalShell>
  )
}

// The status badge "Forced Harvested" itself, as a button: it replaces the pond / cage's (or the cycle's) normal status instead of
// sitting beside it, and clicking it opens the saved details of the Force Harvest(s). Same pill as every other status. The wrapper
// stops the click from reaching a table row that would expand or collapse.
export function ForcedHarvestedStatus({ harvestId, harvestIds }) {
  const [open, setOpen] = useState(false)
  const ids = (harvestIds && harvestIds.length ? harvestIds : [harvestId]).filter(Boolean)
  return (
    <span onClick={(e) => e.stopPropagation()}>
      {ids.length > 0 ? (
        <button
          type="button"
          data-testid="forced-harvested-status"
          title="Forced Harvested. View details"
          aria-label="Forced Harvested, view details"
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        >
          <StatusPill tone="rose">Forced Harvested</StatusPill>
        </button>
      ) : <StatusPill tone="rose">Forced Harvested</StatusPill>}
      {open && <ForcedHarvestDetailsModal harvestIds={ids} onClose={() => setOpen(false)} />}
    </span>
  )
}

// The label beside an affected pond / cage in Cycle Details and on the cycle row: a red rounded pill with white, bold, uppercase text. ONE label
// stands for the unit's (or the cycle's) Force Harvest(s); clicking it opens the saved details. The wrapper stops the click and the
// window's own clicks from reaching a table row that would expand or collapse.
export function ForcedHarvestLabel({ harvestId, harvestIds, className = '' }) {
  const [open, setOpen] = useState(false)
  const ids = (harvestIds && harvestIds.length ? harvestIds : [harvestId]).filter(Boolean)
  if (ids.length === 0) return null
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        data-testid="forced-harvest-label"
        title="Forced harvest. View details"
        aria-label="FORCED HARVEST, view details"
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full bg-red-600 px-2.5 py-[3px] text-[10px] font-bold uppercase leading-none tracking-wide text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 ${className}`}
      >
        FORCED HARVEST
      </button>
      {open && <ForcedHarvestDetailsModal harvestIds={ids} onClose={() => setOpen(false)} />}
    </span>
  )
}
