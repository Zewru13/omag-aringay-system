import ActivityTypePageBase from './ActivityTypePageBase.jsx'

// Names with bespoke conditional fields in StockingMonitoringModals' ViewStockingLogsModal —
// kept in sync manually since that logic is string-matched, not data-driven.
const BUILT_IN_NAMES = [
  'Pond Preparation', 'Stocking', 'Feed Monitoring', 'Water Quality Check',
  'Sampling', 'Disease Control', 'Pre-Harvest Inspection', 'Harvesting', 'Disaster Remedy',
]

export default function FisheriesActivityTypePage({ asTab = false }) {
  return (
    <ActivityTypePageBase
      asTab={asTab}
      endpoint="/fisheries/activity-types/"
      dropdownLabel="Add Stocking Activity Log"
      builtInNames={BUILT_IN_NAMES}
    />
  )
}
