import { resolveMediaUrl } from '../../utils/mediaUrl.js'

// "PCIC insured" tag for a record that has PCIC insurance, with a link to each saved photo of the insurance form (`photos`: [{ id, url }],
// else the single `url`). Renders `none` (nothing by default) when the record is not insured, so a detail list can pass "No".
export default function PcicBadge({ insured, url, photos = null, none = null }) {
  if (!insured) return none
  const links = (photos && photos.length ? photos.map((p) => p.url) : [url]).map(resolveMediaUrl).filter(Boolean)
  return (
    <span className="ml-1.5 inline-flex flex-wrap items-center gap-1.5 align-middle">
      <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-semibold text-[#1A4FA0]">PCIC insured</span>
      {links.length === 0
        ? <span className="text-[11px] text-[#7A8E7A]">No form on file</span>
        : links.map((href, i) => (
          <a key={href} href={href} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-[#1B4D2E] underline">
            {links.length === 1 ? 'View form' : `Photo ${i + 1}`}
          </a>
        ))}
    </span>
  )
}
