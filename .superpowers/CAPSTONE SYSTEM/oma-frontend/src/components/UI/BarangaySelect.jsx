import BARANGAYS from '../../constants/barangays.js'
import FormField, { baseInputClasses } from './FormField.jsx'

function BarangaySelect({
  id,
  label,
  value,
  onChange,
  required = false,
  includeAllOption = false,
  error,
}) {
  return (
    <FormField label={label} required={required} error={error}>
      <select
        id={id}
        className={baseInputClasses}
        value={value}
        onChange={onChange}
        required={required}
      >
        {includeAllOption ? (
          <option value="">All Barangays</option>
        ) : (
          <option value="" disabled>
            Select barangay...
          </option>
        )}
        {BARANGAYS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
    </FormField>
  )
}

export default BarangaySelect
