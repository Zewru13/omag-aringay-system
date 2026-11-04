import { Check } from 'lucide-react'
import { pcicLabel } from '../../utils/pcic.js'

// The round check icon of PCIC insurance: a filled green circle with a white check when insured, an empty gray ring when not. The same icon is
// the "PCIC INSURED" cell of the crop tables and of the ponds/cages table (PcicCheck, read-only: it only shows the saved insurance, which is
// changed in the Edit form) and the button of the forms (PcicInsuranceField draws it with PcicRoundIcon).

export function PcicRoundIcon({ checked, size = 20 }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`inline-flex flex-none items-center justify-center rounded-full border-2 transition-colors duration-150 ${checked ? 'border-[#1B4D2E] bg-[#1B4D2E] text-white' : 'border-[#B9C7BB] bg-white text-transparent'}`}
    >
      <Check size={Math.round(size * 0.65)} strokeWidth={3.5} />
    </span>
  )
}

export default function PcicCheck({ insured }) {
  const on = Boolean(insured)
  return (
    <span role="img" aria-label={pcicLabel(on)} title={pcicLabel(on)} className="inline-flex">
      <PcicRoundIcon checked={on} size={18} />
    </span>
  )
}
