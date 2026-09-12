import { AlertTriangle, CheckCircle2 } from 'lucide-react'

// Compact, icon-only — deliberately no text, so it costs almost no table
// width. Renders nothing at all (not a neutral placeholder) when a record
// has no disaster history, so it never asks the eye to interpret an empty
// icon. Active takes precedence over a past recovery: a record currently
// mid-disaster is the one that needs attention, not its own history.
// Shared between Crop Monitoring and Fisheries Monitoring — both domains'
// disaster_reports concept is the same shape (an Active/Recovered status
// on a linked report), so this one component covers both.
function DisasterIndicator({ disastersCount, hasRecoveredDisaster }) {
  if (disastersCount > 0) {
    const label = `${disastersCount} active disaster${disastersCount > 1 ? 's' : ''} reported`
    return (
      <span title={label} aria-label={label} className="inline-flex flex-shrink-0">
        <AlertTriangle className="w-4 h-4 text-rose-600" aria-hidden="true" />
      </span>
    )
  }
  if (hasRecoveredDisaster) {
    return (
      <span title="Recovered from a past disaster" aria-label="Recovered from a past disaster" className="inline-flex flex-shrink-0">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
      </span>
    )
  }
  return null
}

export default DisasterIndicator
