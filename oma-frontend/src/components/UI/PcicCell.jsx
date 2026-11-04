import { resolveMediaUrl } from '../../utils/mediaUrl.js'
import { pcicDocumentsFrom } from '../../utils/pcicDocuments.js'
import PcicCheck from './PcicCheck.jsx'
import PcicFormButton from './PcicFormButton.jsx'

// The "PCIC INSURED" cell of a crop, pond or cage: the round check (PcicCheck) and, when it is insured and its form was uploaded, "View form",
// which opens the uploaded PCIC form in the in-app viewer (never another browser tab). `photos`: [{ id, url }] and/or the single `url`.
export default function PcicCell({ insured, photos = null, url = null }) {
  const documents = insured ? pcicDocumentsFrom({ photos, url }, resolveMediaUrl) : []
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
      <PcicCheck insured={insured} />
      {documents.length > 0 && <PcicFormButton documents={documents} className="text-[12px]">View form</PcicFormButton>}
      {insured && documents.length === 0 && <span className="text-[11px] text-[#7A8E7A]">No form on file</span>}
    </span>
  )
}
