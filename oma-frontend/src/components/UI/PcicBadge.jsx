import { resolveMediaUrl } from '../../utils/mediaUrl.js'

// "PCIC insured" tag for a record that has PCIC insurance, with a link to the saved photo of the insurance form.
// Renders `none` (nothing by default) when the record is not insured, so a detail list can pass "No".
export default function PcicBadge({ insured, url, none = null }) {
  if (!insured) return none
  const href = resolveMediaUrl(url)
  return (
    <span className="ml-1.5 inline-flex flex-wrap items-center gap-1.5 align-middle">
      <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-semibold text-[#1A4FA0]">PCIC insured</span>
      {href
        ? <a href={href} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-[#1B4D2E] underline">View form</a>
        : <span className="text-[11px] text-[#7A8E7A]">No form on file</span>}
    </span>
  )
}
