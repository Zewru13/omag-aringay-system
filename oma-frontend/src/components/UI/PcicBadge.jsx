import { resolveMediaUrl } from '../../utils/mediaUrl.js'
import { pcicDocumentsFrom } from '../../utils/pcicDocuments.js'
import PcicFormButton from './PcicFormButton.jsx'

// "PCIC insured" tag for a record that has PCIC insurance, with a button for each saved photo of the insurance form (`photos`: [{ id, url }],
// else the single `url`) that opens it in the in-app document viewer (never another browser tab). Renders `none` (nothing by default) when the record is not insured, so a detail list can pass "No".
export default function PcicBadge({ insured, url, photos = null, none = null }) {
  if (!insured) return none
  const documents = pcicDocumentsFrom({ photos, url }, resolveMediaUrl)
  return (
    <span className="ml-1.5 inline-flex flex-wrap items-center gap-1.5 align-middle">
      <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-semibold text-[#1A4FA0]">PCIC insured</span>
      {documents.length === 0
        ? <span className="text-[11px] text-[#7A8E7A]">No form on file</span>
        : documents.map((d, i) => (
          <PcicFormButton key={d.id} documents={documents} startIndex={i} className="text-[11px]">
            {documents.length === 1 ? 'View form' : `Photo ${i + 1}`}
          </PcicFormButton>
        ))}
    </span>
  )
}
