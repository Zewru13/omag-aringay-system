import { useEffect, useState } from 'react'

// Renders a fixed/derived-prefix ID field as a row of literal text segments and
// small digit-only inputs, so a user can't type the wrong region/municipality
// code. `parts` is an ordered list of:
//   { type: 'text', value }                          — literal, non-editable
//   { type: 'input', key, length, placeholder }       — digit-only editable
// onChange receives the full joined string once every input segment is
// completely filled, or '' while any segment is incomplete.
function parseInitial(parts, initialValue) {
  if (!initialValue) return {}
  const values = {}
  let rest = initialValue
  for (const part of parts) {
    if (part.type === 'text') {
      if (!rest.startsWith(part.value)) return {}
      rest = rest.slice(part.value.length)
    } else {
      values[part.key] = rest.slice(0, part.length)
      rest = rest.slice(part.length)
    }
  }
  return values
}

function SegmentedIdInput({ parts, value: initialValue, onChange, disabled }) {
  const [values, setValues] = useState(() => parseInitial(parts, initialValue))

  useEffect(() => {
    const inputParts = parts.filter((p) => p.type === 'input')
    const allFilled = inputParts.every((p) => (values[p.key] || '').length === p.length)
    if (!allFilled) {
      onChange('')
      return
    }
    onChange(parts.map((p) => (p.type === 'text' ? p.value : values[p.key])).join(''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)])

  const setPart = (key, raw, length) => {
    const digits = raw.replace(/\D/g, '').slice(0, length)
    setValues((v) => ({ ...v, [key]: digits }))
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <span key={i} className="text-[13px] font-mono text-slate-500 select-none">
            {part.value}
          </span>
        ) : (
          <input
            key={part.key}
            type="text"
            inputMode="numeric"
            disabled={disabled}
            className="h-[38px] px-2 border border-[#E2E8E2] rounded-lg text-[13px] font-mono text-[#1A2B1A] bg-white placeholder-[#A8BCA8] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors disabled:bg-slate-100 disabled:text-slate-400"
            style={{ width: `${Math.max(part.length, 4) * 11 + 16}px` }}
            placeholder={part.placeholder || '0'.repeat(part.length)}
            maxLength={part.length}
            value={values[part.key] || ''}
            onChange={(e) => setPart(part.key, e.target.value, part.length)}
          />
        ),
      )}
    </div>
  )
}

export default SegmentedIdInput
