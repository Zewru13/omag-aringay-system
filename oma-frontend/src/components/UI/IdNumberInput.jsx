import { digitCount, formatIdNumber, isLegacyIdNumber, MAX_ID_DIGITS } from '../../utils/idNumbers.js'

// One box for an ID number (RSBSA, FishR). The person types the digits; the dashes appear as they go, up to 20 digits.
// A number saved with the older shapes (a "BF-" prefix or letters) is shown as it is and edited as plain text.
// onChange receives the number with its dashes ('' while the box is empty).
const BOX = 'h-[38px] w-full min-w-0 rounded-lg border border-[#E2E8E2] bg-white px-3 font-mono text-[13px] text-[#1A2B1A] ' +
  'placeholder-[#A8BCA8] transition-colors focus:border-[#1B4D2E] focus:outline-none focus:ring-2 focus:ring-[#1B4D2E]/10 ' +
  'disabled:bg-slate-100 disabled:text-slate-400'

function IdNumberInput({ groups, value, onChange, placeholder, id, disabled, maxDigits = MAX_ID_DIGITS }) {
  const current = value || ''
  const legacy = isLegacyIdNumber(current)

  const handleChange = (event) => {
    const typed = event.target.value
    if (legacy) { onChange(typed.toUpperCase()); return }
    let digits = typed.replace(/\D/g, '')
    // Backspace over a dash removes nothing from the digits, so take the digit in front of it instead.
    if (typed.length < current.length && digits === current.replace(/\D/g, '')) digits = digits.slice(0, -1)
    onChange(formatIdNumber(digits, groups, maxDigits))
  }

  return (
    <div>
      <input
        id={id}
        type="text"
        inputMode={legacy ? 'text' : 'numeric'}
        autoComplete="off"
        disabled={disabled}
        className={BOX}
        value={current}
        placeholder={placeholder}
        maxLength={legacy ? 30 : maxDigits + groups.length}
        onChange={handleChange}
      />
      {!legacy && current && (
        <p className="mt-1 text-[11px] text-[#7A8E7A]">{digitCount(current)} of {maxDigits} digits</p>
      )}
    </div>
  )
}

export default IdNumberInput
