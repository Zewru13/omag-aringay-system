import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, ShieldCheck, X } from 'lucide-react'
import { resolveMediaUrl } from '../../utils/mediaUrl.js'
import { checkPcicFile } from '../../utils/pcic.js'

// "Has PCIC insurance" box for a crop, pond, planting or stocking record. Ticking it shows a photo upload for the PCIC
// insurance form (kept with the record as documentation). `value` is the form's pcic state (utils/pcic.js):
// { insured, file, url }; `onChange` receives the next state. Saving and uploading are the form's job.
export default function PcicInsuranceField({ value, onChange, disabled = false, subject = 'record', error = '' }) {
  const inputRef = useRef(null)
  const [fileError, setFileError] = useState('')
  const preview = useMemo(() => (value.file ? URL.createObjectURL(value.file) : ''), [value.file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const saved = resolveMediaUrl(value.url)
  const shown = preview || saved

  const toggle = (insured) => {
    setFileError('')
    onChange(insured ? { ...value, insured: true } : { insured: false, file: null, url: '' })
  }

  const choose = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const problem = checkPcicFile(file)
    setFileError(problem)
    if (!problem) onChange({ ...value, file })
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

      {value.insured && (
        <div className="mt-2 border-t border-[#E2E8E2] pt-3">
          <p className="mb-2 text-[12px] text-[#4A5E4A]">Upload a photo of the PCIC insurance form for documentation.</p>
          {shown ? (
            <div className="flex items-center gap-3">
              <a href={shown} target="_blank" rel="noreferrer" className="block h-16 w-16 flex-none overflow-hidden rounded-lg border border-[#E2E8E2] bg-white">
                <img src={shown} alt="PCIC insurance form" className="h-full w-full object-cover" />
              </a>
              <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}
                  className="min-h-[44px] rounded-lg border border-[#C8D5C8] bg-white px-3 text-[12.5px] font-medium text-[#1B4D2E] hover:bg-[#F0F4F0] disabled:opacity-50">
                  Replace photo
                </button>
                {value.file && (
                  <button type="button" disabled={disabled} onClick={() => onChange({ ...value, file: null })}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-[12.5px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                    <X size={14} aria-hidden="true" /> Remove new photo
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#8FAA95] bg-white px-3 text-[13px] font-medium text-[#1B4D2E] hover:bg-[#F0F4F0] disabled:opacity-50">
              <ImagePlus size={16} aria-hidden="true" /> Choose photo of the PCIC form
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={choose} />
          {(fileError || error) && <p className="mt-2 text-[12px] font-medium text-rose-600">{fileError || error}</p>}
          <p className="mt-2 text-[11px] text-[#7A8E7A]">JPG, PNG or WEBP, up to 5 MB.</p>
        </div>
      )}
    </div>
  )
}
