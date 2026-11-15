import { ReportNotReceivedModal } from '../AssistanceManagement/AssistanceFollowUpModals.jsx'
import ConfirmReceivedModal from '../AssistanceManagement/ConfirmReceivedModal.jsx'
import { RecordHarvestFromMonitoringModal, ViewLogsModal } from '../Monitoring/CropMonitoringPage.jsx'

// The windows a farmer's to-do buttons open on Home itself: Log Activity, Record Harvest, Confirm Received and Report Not Received,
// the same ones their own pages open. Kept apart from Home so they are downloaded only when a button is pressed (a fisherfolk or an
// organization never needs them). `open` is { kind, record } from the pressed button; `onDone` reloads Home after a save.
export default function HomeWindows({ open, onClose, onDone }) {
  const { kind, record } = open
  const finish = () => { onClose(); onDone() }
  if (kind === 'activity') return <ViewLogsModal record={record} onClose={onClose} onLogAdded={onDone} />
  if (kind === 'harvest') return <RecordHarvestFromMonitoringModal record={record} onClose={onClose} onSuccess={onDone} />
  if (kind === 'received') return <ConfirmReceivedModal record={record} onClose={onClose} onDone={finish} />
  if (kind === 'not-received') return <ReportNotReceivedModal record={record} onClose={onClose} onDone={finish} />
  return null
}
