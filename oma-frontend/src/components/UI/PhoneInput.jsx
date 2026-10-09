import { guardPhone } from '../../utils/inputGuards.js'

// A Philippine mobile number field that only holds 09XXXXXXXXX: letters and extra digits are not accepted and a
// pasted +63 917 123 4567 or 0917-123-4567 becomes 09171234567. `onChange` receives the guarded string, not the
// event. No `maxLength` on purpose: the browser would cut a pasted number before the guard could fix it.
function PhoneInput({ value, onChange, ...inputProps }) {
  return (
    <input
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      placeholder="09XXXXXXXXX"
      {...inputProps}
      value={value ?? ''}
      onChange={(e) => onChange(guardPhone(e.target.value))}
    />
  )
}

export default PhoneInput
