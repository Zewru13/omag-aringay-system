import { guardEmail } from '../../utils/inputGuards.js'

// An email field that does not accept spaces or more than 254 characters, and lower-cases what was typed when the
// user leaves it. `onChange` receives the guarded string, not the event.
function EmailInput({ value, onChange, onBlur, ...inputProps }) {
  return (
    <input
      type="email"
      autoComplete="email"
      maxLength={254}
      {...inputProps}
      value={value ?? ''}
      onChange={(e) => onChange(guardEmail(e.target.value))}
      onBlur={(e) => {
        const lower = guardEmail(e.target.value).toLowerCase()
        if (lower !== (value ?? '')) onChange(lower)
        onBlur?.(e)
      }}
    />
  )
}

export default EmailInput
