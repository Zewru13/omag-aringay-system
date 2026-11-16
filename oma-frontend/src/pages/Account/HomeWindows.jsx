import { ReportNotReceivedModal } from '../AssistanceManagement/AssistanceFollowUpModals.jsx'
import ConfirmReceivedDialog from '../AssistanceManagement/ConfirmReceivedDialog.jsx'
import ConfirmReceivedModal from '../AssistanceManagement/ConfirmReceivedModal.jsx'
import { RecordStockingHarvestModal } from '../FisheriesRecords/StockingMonitoringModals.jsx'
import { RecordHarvestFromMonitoringModal, ViewLogsModal } from '../Monitoring/CropMonitoringPage.jsx'

// The windows the to-do buttons open on Home itself, the same ones the person's own pages open:
//   a farmer (domain 'crop'):         Log Activity, Record Harvest, Confirm Received, Report Not Received
//   a fisherfolk (domain 'fisheries'): Record Harvest of a cycle, Confirm Received, Report Not Received
// Kept apart from Home so they are downloaded only when a button is pressed (an organization never needs them). `open` is
// { kind, record, domain } from the pressed button; `onDone` reloads Home after a save.
export default function HomeWindows({ open, onClose, onDone }) {
  const { kind, record, domain } = open
  const finish = () => { onClose(); onDone() }
  if (domain === 'fisheries') {
    if (kind === 'harvest') return <RecordStockingHarvestModal record={record} onClose={onClose} onSuccess={finish} />
    if (kind === 'received') {
      return <ConfirmReceivedDialog record={record} url={`/interventions/fisherfolk-beneficiaries/${record.id}/confirm-received/`} domain="fisheries" onClose={onClose} onDone={finish} />
    }
    if (kind === 'not-received') return <ReportNotReceivedModal domain="fisheries" record={record} onClose={onClose} onDone={finish} />
    return null
  }
  if (kind === 'activity') return <ViewLogsModal record={record} onClose={onClose} onLogAdded={onDone} />
  if (kind === 'harvest') return <RecordHarvestFromMonitoringModal record={record} onClose={onClose} onSuccess={onDone} />
  if (kind === 'received') return <ConfirmReceivedModal record={record} onClose={onClose} onDone={finish} />
  if (kind === 'not-received') return <ReportNotReceivedModal record={record} onClose={onClose} onDone={finish} />
  return null
}
