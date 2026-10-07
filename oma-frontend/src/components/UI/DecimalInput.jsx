import { guardDecimal } from '../../utils/inputGuards.js'

// A number field typed as text so the guard decides what is allowed: digits and one dot, at most `decimals` after the
// dot, no negatives, and never above `max` (clamped). `onChange` receives the guarded string, not the event.
function DecimalInput({ value, onChange, decimals = 2, max = null, allowNegative = false, ...inputProps }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      {...inputProps}
      value={value ?? ''}
      onChange={(e) => onChange(guardDecimal(e.target.value, { decimals, max, allowNegative }))}
    />
  )
}

export default DecimalInput
