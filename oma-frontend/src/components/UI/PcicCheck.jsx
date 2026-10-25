// The "PCIC INSURED" cell of a crop table: a tick box, checked when the crop has PCIC insurance and empty when it does not. Read-only
// (it only shows the record's saved insurance); the insurance itself is changed in the crop's Edit form.
export default function PcicCheck({ insured }) {
  const on = Boolean(insured)
  return (
    <input
      type="checkbox"
      checked={on}
      readOnly
      tabIndex={-1}
      aria-label={on ? 'PCIC insured' : 'Not PCIC insured'}
      title={on ? 'PCIC insured' : 'Not PCIC insured'}
      className="pointer-events-none h-4 w-4 accent-[#1B4D2E]"
    />
  )
}
