import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { DetailTable, FormSection } from '../../components/UI/FormTable.jsx'
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx'
import { estimateText, fmtKg } from './emergencyForceHarvest.js'
import { fmtLong } from './stockingHelpers.js'

// The Forced Harvested status badge of an emergency Force Harvest (Aquaculture Monitoring ⋮ menu > Force Harvest) and the window it opens.
// Separate from the red HP / HC badges of the Health Log Force Harvest, which are unchanged. The window shows the SAVED record
// (GET /fisheries/force-harvest/<id>/), never state kept in the page, and everything in it is a table.

// One saved Force Harvest as its two tables: the details, then each affected pond / cage with its estimate and actual kg.
function ForcedHarvestTables({ d }) {
  const summary = [
    { label: 'Fisherfolk', value: d.fisherfolk_name },
    { label: 'Species', value: d.species },
    { label: 'Production Cycle', value: [d.cycle_number ? `Cycle ${d.cycle_number}` : null, d.cycle_name].filter(Boolean).join(' · ') },
    { label: 'Harvest Date', value: fmtLong(d.harvest_date) },
    { label: 'Reason for Force Harvest', value: d.reason_label, wide: true },
    { label: 'Recorded By', value: d.recorded_by_name },
  ]
  return (
    <div className="space-y-3" data-testid="forced-harvest-details">
      <DetailTable title="Force Harvest Details" fields={summary} />
      <FormSection title="Ponds and Cages">
        <EntryTable bare label="Ponds and cages harvested" testId="forced-harvest-units">
          <EntryHead>
            <EntryTh>Production Unit</EntryTh>
            <EntryTh className="md:text-right">Estimated Harvest (kg)</EntryTh>
            <EntryTh className="md:text-right">Actual Harvest (kg)</EntryTh>
          </EntryHead>
          <tbody>
            {d.units.map((u) => (
              <EntryRow key={u.id}>
                <EntryCell label="Production Unit" className="font-semibold text-[#1A2B1A]">{u.label}</EntryCell>
                <EntryCell label="Estimated Harvest (kg)" className={`tabular-nums md:text-right ${u.estimated_harvest_kg == null ? 'italic text-[#7A8E7A]' : ''}`}>{estimateText(u.estimated_harvest_kg)}</EntryCell>
                <EntryCell label="Actual Harvest (kg)" className="tabular-nums md:text-right">{fmtKg(u.actual_harvest_kg)}</EntryCell>
              </EntryRow>
            ))}
          </tbody>
          <tfoot>
            <EntryRow tone="bg-[#F9FAF9] font-bold">
              <EntryCell colSpan={2}>Total actual harvest (kg)</EntryCell>
              <EntryCell className="tabular-nums md:text-right" data-testid="forced-harvest-total">{fmtKg(d.total_actual_kg)}</EntryCell>
            </EntryRow>
          </tfoot>
        </EntryTable>
      </FormSection>
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
