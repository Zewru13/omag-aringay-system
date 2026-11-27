import { RecordStockingHarvestModal } from '../FisheriesRecords/StockingMonitoringModals.jsx'
import { RecordHarvestFromMonitoringModal, ViewLogsModal } from '../Monitoring/CropMonitoringPage.jsx'

// The windows the to-do buttons open on Home itself, the same ones the person's own pages open:
//   a farmer (domain 'crop'):         Log Activity, Record Harvest
//   a fisherfolk (domain 'fisheries'): Record Harvest of a cycle
// Kept apart from Home so they are downloaded only when a button is pressed (an organization never needs them). `open` is
// { kind, record, domain } from the pressed button; `onDone` reloads Home after a save.
export default function HomeWindows({ open, onClose, onDone }) {
  const { kind, record, domain } = open
  const finish = () => { onClose(); onDone() }
  if (domain === 'fisheries') {
    return kind === 'harvest' ? <RecordStockingHarvestModal record={record} onClose={onClose} onSuccess={finish} /> : null
  }
  if (kind === 'activity') return <ViewLogsModal record={record} onClose={onClose} onLogAdded={onDone} />
  if (kind === 'harvest') return <RecordHarvestFromMonitoringModal record={record} onClose={onClose} onSuccess={onDone} />
  return null
}
