import { useRef } from 'react'
import { guardEmail } from '../../utils/inputGuards.js'

// An email field that does not accept spaces or more than 254 characters, and lower-cases what was typed when the
// user leaves it. `onChange` receives the guarded string, not the event.
function EmailInput({ value, onChange, onBlur, ...inputProps }) {
  // Only lower-case what the user typed: opening a form with a stored mixed-case address and leaving the field must not
  // make the form look edited.
  const typed = useRef(false)
  return (
    <input
      type="email"
      autoComplete="email"
      maxLength={254}
      {...inputProps}
      value={value ?? ''}
      onChange={(e) => { typed.current = true; onChange(guardEmail(e.target.value)) }}
      onBlur={(e) => {
        if (typed.current) {
          const lower = guardEmail(e.target.value).toLowerCase()
          if (lower !== (value ?? '')) onChange(lower)
        }
        onBlur?.(e)
      }}
    />
  )
}

export default EmailInput
