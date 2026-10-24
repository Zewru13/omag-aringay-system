import FormField, { baseInputClasses } from './FormField.jsx'
import { OWNERSHIP_OPTIONS, chooseOwnership, needsOwnerDetails } from '../../utils/ownership.js'

// Ownership of an aquaculture production cycle: a required dropdown (Tenant / Lease / Owner) and, for Tenant and Lease, the owner's
// name and RSBSA / FishR number. Owner shows nothing more. `value` is { ownership, ownerName, ownerNo } (utils/ownership.js);
// `onChange` receives the next state, with the rules for switching (Owner clears the owner details) already applied.
// The fields render as siblings (a fragment) so the form's own grid places them.
export default function OwnershipFields({ value, onChange, disabled = false }) {
  return (
    <>
      <FormField label="Ownership" required>
        <select
          className={baseInputClasses} required disabled={disabled}
          value={value.ownership} onChange={(e) => onChange(chooseOwnership(value, e.target.value))}
        >
          <option value="" disabled>Select Ownership</option>
          {OWNERSHIP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </FormField>
      {needsOwnerDetails(value.ownership) && (
        <>
          <FormField label="Owner Name" required>
            <input
              type="text" className={baseInputClasses} required maxLength={150} disabled={disabled}
              value={value.ownerName} onChange={(e) => onChange({ ...value, ownerName: e.target.value })}
              placeholder="Full name of the owner"
            />
          </FormField>
          <FormField label="RSBSA / FishR No. of Owner" required>
            <input
              type="text" className={baseInputClasses} required maxLength={50} disabled={disabled} inputMode="text"
              value={value.ownerNo} onChange={(e) => onChange({ ...value, ownerNo: e.target.value })}
              placeholder="Registration number of the owner"
            />
          </FormField>
        </>
      )}
    </>
  )
}
