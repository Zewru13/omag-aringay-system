import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../context/ToastContext.jsx'
import { MAX_PHOTOS, classifyPhotoFiles } from '../utils/photoRules.js'

// A list of photos chosen for a form: each entry keeps its own File + preview URL. Adding never replaces existing
// photos (an 11th is refused with "Maximum of 10 photos allowed."); removing one frees exactly one slot. Preview URLs
// are released when removed or when the form unmounts. `reserved` = photos the record already has: they count toward
// the same 10. Returns { photos, add, remove, clear, reserved } where `photos` is [{ key, file, url }].
export default function usePhotoList(reserved = 0) {
  const { showToast } = useToast()
  const [photos, setPhotos] = useState([])
  const photosRef = useRef([])
  const reservedRef = useRef(reserved)
  useEffect(() => { photosRef.current = photos }, [photos])
  useEffect(() => { reservedRef.current = reserved }, [reserved])
  useEffect(() => () => photosRef.current.forEach(p => URL.revokeObjectURL(p.url)), [])

  const add = useCallback((fileList) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return
    const room = MAX_PHOTOS - reservedRef.current - photosRef.current.length
    const { accepted, rejected, overflow } = classifyPhotoFiles(incoming, room)
    if (overflow) showToast(`Maximum of ${MAX_PHOTOS} photos allowed.`, 'error')
    if (rejected.length) showToast(rejected[0] + (rejected.length > 1 ? ` (+${rejected.length - 1} more)` : ''), 'error')
    const added = accepted.map(file => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file,
      url: URL.createObjectURL(file),
    }))
    if (added.length) {
      photosRef.current = [...photosRef.current, ...added]
      setPhotos(prev => [...prev, ...added])
    }
  }, [showToast])

  const remove = useCallback((key) => {
    setPhotos(prev => {
      const target = prev.find(p => p.key === key)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter(p => p.key !== key)
    })
  }, [])

  // Empty the list after the form has been submitted, so the next report on the same screen starts with no photos.
  const clear = useCallback(() => {
    photosRef.current.forEach(p => URL.revokeObjectURL(p.url))
    photosRef.current = []
    setPhotos([])
  }, [])

  return { photos, add, remove, clear, reserved }
}
