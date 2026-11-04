import { ClipboardList } from 'lucide-react'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { FeedingLogTab, HealthLogTab } from './AquacultureCycleDetailModal.jsx'

// The window of Log Activity (Fisheries Monitoring): the cycle's own Feeding Log or Health Log form, in table format, with one row per pond/cage.
// It is the same form, API and validation as the cycle window's Feeding Log / Health Log tabs (AquacultureCycleDetailModal.jsx), shown on its own;
// the log is saved to this production cycle (and so to its fisherfolk) and to the ponds/cages ticked or filled in the table.
//   kind: 'feeding' | 'health'    cycle: the production cycle as GET /monitoring/aquaculture-cycles/<id>/ gives it (its units come with it)
//   subtitle: who and which cycle (shown under the title)    onSaved(): after a save (the page refreshes its rows)    onClose(): Cancel / close
const TITLES = { feeding: 'Log Feeding', health: 'Log Health' }

export default function LogActivityModal({ kind, cycle, subtitle, onClose, onSaved, onHealthChanged }) {
  return (
    <ModalShell title={TITLES[kind]} subtitle={subtitle} icon={ClipboardList} onClose={onClose} maxWidth="max-w-5xl">
      {kind === 'feeding' ? (
        <FeedingLogTab formOnly cycleId={cycle.id} units={cycle.units || []} cycle={cycle} onSaved={onSaved} onCancel={onClose} />
      ) : (
        <HealthLogTab formOnly cycleId={cycle.id} units={cycle.units || []} onChanged={onHealthChanged} onSaved={onSaved} onCancel={onClose} />
      )}
    </ModalShell>
  )
}
