import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { canForceHarvest } from '../FisheriesRecords/emergencyForceHarvest.js'
import { CycleInfoSummary } from '../Monitoring/AquacultureCycleDetailModal.jsx'
import { LoadFailed } from './ListStates.jsx'
import { cycleTitle } from './myCycles.js'

// Details of one of a fisherfolk's cycles: the cycle's facts with its ponds and cages (the office's own CycleInfoSummary), then the
// rest of what the fisherfolk can do with it. Each button hands the work back to the page, which opens the existing window for it.
//   rec      the cycle's row (a stocking record of the list)
//   actions  { onActivityLogs, onEdit, onPrint, onForceHarvest, onHarvestDetails }
export default function CycleDetailsWindow({ rec, onClose, actions }) {
  const [cycle, setCycle] = useState(null)
  const [state, setState] = useState(rec.production_cycle ? 'loading' : 'ready')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!rec.production_cycle) return undefined
    let cancelled = false
    api.get(`/monitoring/aquaculture-cycles/${rec.production_cycle}/`)
      .then((res) => { if (!cancelled) { setCycle(res.data); setState('ready') } })
      .catch(() => { if (!cancelled) setState('failed') })
    return () => { cancelled = true }
  }, [rec.production_cycle, attempt])

  const ended = rec.status === 'Harvested' || rec.status === 'Total Loss'
  const buttons = [
    rec.production_cycle && { key: 'logs', label: 'Activity logs', onClick: actions.onActivityLogs },
    !ended && { key: 'edit', label: 'Edit', onClick: actions.onEdit },
    { key: 'print', label: 'Print', onClick: actions.onPrint },
    rec.harvest_count > 0 && { key: 'harvests', label: 'Harvest details', onClick: actions.onHarvestDetails },
    canForceHarvest(rec) && { key: 'force', label: 'Force harvest', danger: true, onClick: actions.onForceHarvest },
  ].filter(Boolean)

  return (
    <ModalShell
      title={cycleTitle(rec)}
      subtitle={[rec.culture_type, rec.pond_location_barangay].filter(Boolean).join(' · ')}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={(
        // Two per row on a phone (each 44px tall), one row on a larger screen.
        <div className="grid w-full grid-cols-2 gap-2 max-sm:[&>*]:min-h-[44px] sm:flex sm:flex-wrap sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          {buttons.map((b) => (
            <Button key={b.key} type="button" variant={b.danger ? 'danger' : 'outline'} onClick={b.onClick}>{b.label}</Button>
          ))}
        </div>
      )}
    >
      {state === 'loading' && <div className="flex justify-center py-10"><LoadingSpinner /></div>}
      {state === 'failed' && <LoadFailed what="this cycle" onRetry={() => { setState('loading'); setAttempt((n) => n + 1) }} />}
      {state === 'ready' && cycle && <CycleInfoSummary cycle={cycle} />}
      {state === 'ready' && !cycle && (
        <p className="text-[14px] text-text-secondary">This stocking has no production cycle on record, so there are no ponds or cages to show.</p>
      )}
    </ModalShell>
  )
}
