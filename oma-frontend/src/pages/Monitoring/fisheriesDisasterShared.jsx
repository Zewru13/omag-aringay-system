import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { MAX_DAMAGE_PHOTOS, PHOTO_MAX_BYTES } from './fisheriesDisasterConstants.js'

// Shared by the fisherfolk disaster forms (Log Disaster, and Report Disaster on a stock): the Photo
// Documentation of Damage field with its live camera, and the Equipment Damaged checklist. Constants and
// helpers live in fisheriesDisasterConstants.js; the photo list state in useDamagePhotos.js.

// Take Photo: a live camera view (getUserMedia). Captures the current frame as a JPEG File for the photo
// list; never submits anything. The stream is stopped on capture, cancel and close/unmount.
function CameraCaptureModal({ onCapture, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState('starting')   // starting | live | error
  const [errorMsg, setErrorMsg] = useState('')

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
        setStatus('live')
      })
      .catch((err) => {
        if (cancelled) return
        setStatus('error')
        setErrorMsg(err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
          ? 'Camera access was denied. Please allow camera access in your browser settings or use Add More Photos instead.'
          : err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError'
            ? 'No camera was found on this device. Use Add More Photos instead.'
            : 'The camera could not be started. Use Add More Photos instead.')
      })
    return () => { cancelled = true; stopStream() }
  }, [])

  const close = () => { stopStream(); onClose() }

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    const finish = (blob) => {
      if (!blob) return
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
      stopStream()
      onCapture(file)
    }
    // Keep within the 5 MB photo limit: retry at a lower JPEG quality if a large sensor overshoots it.
    canvas.toBlob((blob) => {
      if (blob && blob.size > PHOTO_MAX_BYTES) canvas.toBlob(finish, 'image/jpeg', 0.7)
      else finish(blob)
    }, 'image/jpeg', 0.9)
  }

  return (
    <ModalShell title="Take Photo" subtitle="Point the camera at the damage, then capture." onClose={close} maxWidth="max-w-lg"
      footer={<>
        <Button type="button" variant="outline" onClick={close}>Cancel</Button>
        <Button type="button" onClick={capture} disabled={status !== 'live'}>
          <Camera size={15} className="mr-1" /> Capture Photo
        </Button>
      </>}>
      <div className="overflow-hidden rounded-xl bg-black" data-testid="camera-preview">
        <video ref={videoRef} playsInline muted className="h-auto max-h-[60vh] w-full object-contain" />
      </div>
      {status === 'starting' && <p className="mt-2 text-xs text-slate-500">Starting the camera… allow camera access if your browser asks.</p>}
      {status === 'error' && <p className="mt-2 text-sm text-rose-600" role="alert">{errorMsg}</p>}
    </ModalShell>
  )
}

const cameraApiAvailable = () => Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && window.isSecureContext)

// Photo Documentation of Damage. Take Photo opens the live camera (CameraCaptureModal); where the browser
// offers no camera API (a plain-HTTP LAN address) it falls back to the device camera input. Add More
// Photos picks existing images (multiple). Both feed the same 0-10 list.
// Editing a draft: `existing` = the report's saved photos ({id, url}); each can be removed with
// onRemoveExisting(id). They count toward the 10 (pass their number to useDamagePhotos as `reserved`).
export function DamagePhotosField({ photosState, existing = [], onRemoveExisting }) {
  const { showToast } = useToast()
  const { photos, add, remove } = photosState
  const cameraInputRef = useRef(null)
  const uploadInputRef = useRef(null)
  const [showCamera, setShowCamera] = useState(false)
  const total = existing.length + photos.length
  const full = total >= MAX_DAMAGE_PHOTOS

  const openPicker = () => {
    if (full) { showToast(`Maximum of ${MAX_DAMAGE_PHOTOS} photos allowed.`, 'error'); return }
    uploadInputRef.current?.click()
  }
  const takePhoto = () => {
    if (full) { showToast(`Maximum of ${MAX_DAMAGE_PHOTOS} photos allowed.`, 'error'); return }
    if (cameraApiAvailable()) setShowCamera(true)
    else cameraInputRef.current?.click()
  }

  return (
    <div data-testid="damage-photos">
      <p className="text-[13px] font-medium text-slate-700">Photo Documentation of Damage</p>
      <p className="text-xs text-slate-500">
        Optional — up to {MAX_DAMAGE_PHOTOS} photos. Add photos showing the damaged equipment, pond, cage,
        facility, or other affected aquaculture property.
      </p>
      <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
        className="hidden" onChange={e => { add(e.target.files); e.target.value = '' }} />
      <input ref={uploadInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple
        className="hidden" onChange={e => { add(e.target.files); e.target.value = '' }} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={takePhoto} disabled={full}>
          <Camera size={15} className="mr-1" /> Take Photo
        </Button>
        <Button type="button" variant="outline" onClick={openPicker} disabled={full}>
          <ImagePlus size={15} className="mr-1" /> Add More Photos
        </Button>
        <span className="text-xs text-slate-500">{total} / {MAX_DAMAGE_PHOTOS} photos · JPG, PNG or WEBP, up to 5 MB each</span>
      </div>
      {total > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {existing.map((p, i) => (
            <li key={`saved-${p.id}`} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <img src={p.url} alt={`Damage photo ${i + 1}`} className="h-24 w-full object-cover" />
              <button type="button" onClick={() => onRemoveExisting?.(p.id)}
                aria-label={`Remove photo ${i + 1}`} title="Remove photo"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80">
                <X size={13} />
              </button>
            </li>
          ))}
          {photos.map((p, i) => (
            <li key={p.key} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <img src={p.url} alt={`Damage photo ${existing.length + i + 1}`} className="h-24 w-full object-cover" />
              <button type="button" onClick={() => remove(p.key)}
                aria-label={`Remove photo ${existing.length + i + 1}`} title="Remove photo"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80">
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {showCamera && (
        <CameraCaptureModal
          onClose={() => setShowCamera(false)}
          onCapture={(file) => { setShowCamera(false); add([file]) }}
        />
      )}
    </div>
  )
}

// Equipment Damaged checklist. `groups` = [{ label, options }]; a null label renders the options ungrouped.
export function EquipmentChecklist({ groups, selected, onToggle, otherValue, onOtherChange, inputClassName }) {
  return (
    <>
      <div className={`${groups.some(g => g.label) ? 'max-h-56' : 'max-h-44'} overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 space-y-2`}>
        {groups.map((group, gi) => (
          <div key={group.label || `group-${gi}`} className="space-y-2">
            {group.label && (
              <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
            )}
            {group.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} />
                <span>{option}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      {selected.includes('Other') && (
        <input
          className={`${inputClassName} mt-2`}
          value={otherValue}
          onChange={e => onOtherChange(e.target.value)}
          placeholder="Specify Equipment Damaged"
        />
      )}
    </>
  )
}
