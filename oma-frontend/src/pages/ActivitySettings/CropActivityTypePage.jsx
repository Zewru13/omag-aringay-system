import ActivityTypePageBase from './ActivityTypePageBase.jsx'

// Names with bespoke conditional fields in CropMonitoringPage's ViewLogsModal —
// kept in sync manually since that logic is string-matched, not data-driven.
const BUILT_IN_NAMES = [
  'Land Preparation', 'Planting', 'Fertilizer Application', 'Irrigation / Watering',
  'Weeding', 'Pest Control', 'Disease Control', 'Field Monitoring',
  'Pre-Harvest Inspection', 'Harvesting', 'Disaster Remedy',
]

export default function CropActivityTypePage({ asTab = false }) {
  return (
    <ActivityTypePageBase
      asTab={asTab}
      endpoint="/production/activity-types/"
      dropdownLabel="Add Crop Activity Log"
      builtInNames={BUILT_IN_NAMES}
    />
  )
}
