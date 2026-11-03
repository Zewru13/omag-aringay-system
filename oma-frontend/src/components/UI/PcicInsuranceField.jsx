import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, ImagePlus, ShieldCheck, X } from 'lucide-react'
import { resolveMediaUrl } from '../../utils/mediaUrl.js'
import { MAX_PCIC_PHOTOS, checkPcicFile, pcicPhotoCount } from '../../utils/pcic.js'
import Button from './Button.jsx'
import ModalShell from './ModalShell.jsx'

// "Has PCIC insurance" box for a crop, pond, planting or stocking record. Ticking it opens a window asking for photos of the PCIC
// insurance form (up to 5: its pages; kept with the record as documentation); cancelling that window without a photo leaves the box
// unticked. `value` is the form's pcic state (utils/pcic.js): { insured, files, photos, removed }; `onChange` receives the next state.
// Saving and uploading are the form's job.
//   compact  the box alone (for a table column): the photos show as a small "N photos" note under it instead of a bordered panel.

function PcicPhotoDialog({ value, subject, error, onSave, onCancel }) {
  const inputRef = useRef(null)
  const [files, setFiles] = useState(value.files || [])
  const [removed, setRemoved] = useState(value.removed || [])
  const [fileError, setFileError] = useState('')
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])
  const saved = (value.photos || []).filter((p) => !removed.includes(p.id))
  const count = pcicPhotoCount({ photos: value.photos, removed, files })
  const full = count >= MAX_PCIC_PHOTOS

  const choose = (event) => {
    const chosen = [...(event.target.files || [])]
    event.target.value = ''
    if (chosen.length === 0) return
    const room = MAX_PCIC_PHOTOS - count
    const problem = chosen.map(checkPcicFile).find(Boolean)
    if (problem) { setFileError(problem); return }
    setFileError(chosen.length > room ? `A record can have up to ${MAX_PCIC_PHOTOS} photos. Only the first ${room} were added.` : '')
    setFiles((f) => [...f, ...chosen.slice(0, Math.max(0, room))])
  }

  const tile = (key, src, label, onRemove) => (
    <li key={key} className="relative">
      <a href={src} target="_blank" rel="noreferrer" className="block h-24 w-full overflow-hidden rounded-lg border border-[#E2E8E2] bg-white">
        <img src={src} alt={label} className="h-full w-full object-cover" />
      </a>
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[#C8D5C8] bg-white text-rose-600 shadow-sm hover:bg-rose-50">
        <X size={13} aria-hidden="true" />
      </button>
    </li>
  )

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
          <Button type="button" disabled={count === 0} onClick={() => onSave({ files, removed })}>Save photos</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <p className="text-[13px] text-[#4A5E4A]">Upload photos of the PCIC insurance form, one for each page, up to {MAX_PCIC_PHOTOS}. They are kept with the record as documentation.</p>
        {count > 0 && (
          <ul className="grid grid-cols-3 gap-3" aria-label="Photos of the PCIC form">
            {saved.map((p, i) => tile(`s${p.id}`, resolveMediaUrl(p.url), `photo ${i + 1}`, () => setRemoved((r) => [...r, p.id])))}
            {files.map((f, i) => tile(`n${f.name}${i}`, previews[i], `photo ${saved.length + i + 1}`, () => setFiles((all) => all.filter((_, k) => k !== i))))}
          </ul>
        )}
        <button type="button" disabled={full} onClick={() => inputRef.current?.click()}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#8FAA95] bg-white px-3 text-[13px] font-medium text-[#1B4D2E] hover:bg-[#F0F4F0] disabled:cursor-not-allowed disabled:opacity-50">
          <ImagePlus size={18} aria-hidden="true" /> {count === 0 ? 'Choose photos of the PCIC form' : full ? `${MAX_PCIC_PHOTOS} photos: the most a record can have` : 'Add another photo'}
        </button>
        <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={choose} />
        {(fileError || error) && <p className="text-[12px] font-medium text-rose-600">{fileError || error}</p>}
        <p className="text-[11px] text-[#7A8E7A]">{count} of {MAX_PCIC_PHOTOS} photos. JPG, PNG or WEBP, up to 5 MB each.</p>
      </div>
    </ModalShell>
  )
}

export default function PcicInsuranceField({ value, onChange, disabled = false, subject = 'record', error = '', compact = false }) {
  const [asking, setAsking] = useState(false)
  const count = pcicPhotoCount(value)
  const hasPhoto = count > 0

  const toggle = (insured) => {
    if (insured) {
      onChange({ ...value, insured: true })
      setAsking(true)
    } else {
      setAsking(false)
      onChange({ ...value, insured: false, files: [], removed: [] })
    }
  }

  // Cancelling the window: a box ticked without any photo goes back to unticked.
  const cancel = () => {
    setAsking(false)
    if (!hasPhoto) onChange({ ...value, insured: false, files: [], removed: [] })
  }

  const save = ({ files, removed }) => {
    setAsking(false)
    onChange({ ...value, insured: true, files, removed })
  }

  const dialog = asking && <PcicPhotoDialog value={value} subject={subject} error={error} onSave={save} onCancel={cancel} />

  const photoNote = value.insured && (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
      {hasPhoto
        ? (
          <>
            <span className="inline-flex items-center gap-1 font-medium text-[#1B4D2E]"><Eye size={13} aria-hidden="true" /> {count === 1 ? 'Photo attached' : `${count} photos attached`}</span>
            <button type="button" disabled={disabled} onClick={() => setAsking(true)} className="font-medium text-[#1E5637] underline disabled:opacity-50">Change</button>
          </>
        )
        : <button type="button" disabled={disabled} onClick={() => setAsking(true)} className="font-medium text-rose-600 underline disabled:opacity-50">Add the form photos</button>}
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
