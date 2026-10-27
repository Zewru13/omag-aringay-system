import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, ImagePlus, ShieldCheck } from 'lucide-react'
import { resolveMediaUrl } from '../../utils/mediaUrl.js'
import { checkPcicFile } from '../../utils/pcic.js'
import Button from './Button.jsx'
import ModalShell from './ModalShell.jsx'

// "Has PCIC insurance" box for a crop, pond, planting or stocking record. Ticking it opens a window asking for a photo of the PCIC
// insurance form (kept with the record as documentation); cancelling that window without a photo leaves the box unticked. `value` is
// the form's pcic state (utils/pcic.js): { insured, file, url }; `onChange` receives the next state. Saving and uploading are the
// form's job.
//   compact  the box alone (for a table column): the photo shows as a small "View photo" link under it instead of a bordered panel.

function PcicPhotoDialog({ value, subject, error, onSave, onCancel }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(value.file || null)
  const [fileError, setFileError] = useState('')
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const saved = resolveMediaUrl(value.url)
  const shown = preview || saved
  const canSave = Boolean(file || value.url)

  const choose = (event) => {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (!chosen) return
    const problem = checkPcicFile(chosen)
    setFileError(problem)
    if (!problem) setFile(chosen)
  }

  return (
    <ModalShell
      title="PCIC Insurance Form"
      subtitle={`Photo documentation for this ${subject}`}
      icon={ShieldCheck}
      onClose={onCancel}
      maxWidth="max-w-md"
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="button" disabled={!canSave} onClick={() => onSave(file)}>Save photo</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <p className="text-[13px] text-[#4A5E4A]">Upload a photo of the PCIC insurance form. It is kept with the record as documentation.</p>
        {shown ? (
          <div className="flex items-center gap-3">
            <a href={shown} target="_blank" rel="noreferrer" className="block h-24 w-24 flex-none overflow-hidden rounded-lg border border-[#E2E8E2] bg-white">
              <img src={shown} alt="PCIC insurance form" className="h-full w-full object-cover" />
            </a>
            <button type="button" onClick={() => inputRef.current?.click()}
              className="min-h-[44px] rounded-lg border border-[#C8D5C8] bg-white px-3 text-[12.5px] font-medium text-[#1B4D2E] hover:bg-[#F0F4F0]">
              Replace photo
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex min-h-[88px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#8FAA95] bg-white px-3 text-[13px] font-medium text-[#1B4D2E] hover:bg-[#F0F4F0]">
            <ImagePlus size={20} aria-hidden="true" /> Choose photo of the PCIC form
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={choose} />
        {(fileError || error) && <p className="text-[12px] font-medium text-rose-600">{fileError || error}</p>}
        <p className="text-[11px] text-[#7A8E7A]">JPG, PNG or WEBP, up to 5 MB.</p>
      </div>
    </ModalShell>
  )
}

export default function PcicInsuranceField({ value, onChange, disabled = false, subject = 'record', error = '', compact = false }) {
  const [asking, setAsking] = useState(false)
  const saved = resolveMediaUrl(value.url)
  const hasPhoto = Boolean(value.file || saved)

  const toggle = (insured) => {
    if (insured) {
      onChange({ ...value, insured: true })
      setAsking(true)
    } else {
      setAsking(false)
      onChange({ insured: false, file: null, url: '' })
    }
  }

  // Cancelling the window: a box ticked without any photo goes back to unticked.
  const cancel = () => {
    setAsking(false)
    if (!value.file && !value.url) onChange({ insured: false, file: null, url: '' })
  }

  const save = (file) => {
    setAsking(false)
    onChange({ ...value, insured: true, file: file || value.file || null })
  }

  const dialog = asking && <PcicPhotoDialog value={value} subject={subject} error={error} onSave={save} onCancel={cancel} />

  const photoNote = value.insured && (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
      {hasPhoto
        ? (
          <>
            <span className="inline-flex items-center gap-1 font-medium text-[#1B4D2E]"><Eye size={13} aria-hidden="true" /> Photo attached</span>
            <button type="button" disabled={disabled} onClick={() => setAsking(true)} className="font-medium text-[#1E5637] underline disabled:opacity-50">Change</button>
          </>
        )
        : <button type="button" disabled={disabled} onClick={() => setAsking(true)} className="font-medium text-rose-600 underline disabled:opacity-50">Add the form photo</button>}
    </span>
  )

  if (compact) {
    return (
      <div className="space-y-1">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] font-medium text-[#1A2B1A]">
          <input type="checkbox" className="h-5 w-5 flex-none accent-[#1B4D2E]" checked={value.insured} disabled={disabled} onChange={(e) => toggle(e.target.checked)} />
          <span className="flex items-center gap-1"><ShieldCheck size={14} className="flex-none text-[#1B4D2E]" aria-hidden="true" /> Insured</span>
        </label>
        {photoNote}
        {error && !asking && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
        {dialog}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#E2E8E2] bg-[#F8FAF8] p-3">
      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-[13px] font-medium text-[#1A2B1A]">
        <input
          type="checkbox"
          className="h-5 w-5 flex-none accent-[#1B4D2E]"
          checked={value.insured}
          disabled={disabled}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span className="flex min-w-0 items-center gap-1.5">
          <ShieldCheck size={15} className="flex-none text-[#1B4D2E]" aria-hidden="true" />
          This {subject} has PCIC insurance
        </span>
      </label>
      {value.insured && <div className="ml-8 mt-1">{photoNote}</div>}
      {error && !asking && <p className="mt-2 text-[12px] font-medium text-rose-600">{error}</p>}
      {dialog}
    </div>
  )
}
