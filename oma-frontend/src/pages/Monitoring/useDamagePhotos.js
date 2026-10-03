import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import { MAX_DAMAGE_PHOTOS, PHOTO_MAX_BYTES, PHOTO_TYPES } from './fisheriesDisasterConstants.js'

// The Photo Documentation of Damage list: each entry keeps its own File + preview URL. Adding never
// replaces existing photos (an 11th is refused with "Maximum of 10 photos allowed."); removing one frees
// exactly one slot. Preview URLs are released when removed or when the form unmounts.
// `reserved` = photos the report already has (editing a draft): they count toward the same 10.
export default function useDamagePhotos(reserved = 0) {
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
    const accepted = []
    const rejected = []
    for (const file of incoming) {
      if (!PHOTO_TYPES.includes(file.type)) { rejected.push(`${file.name}: use a JPG, PNG or WEBP image.`); continue }
      if (file.size > PHOTO_MAX_BYTES) { rejected.push(`${file.name}: larger than 5 MB.`); continue }
      accepted.push(file)
    }
    const room = MAX_DAMAGE_PHOTOS - reservedRef.current - photosRef.current.length
    if (accepted.length > room) showToast(`Maximum of ${MAX_DAMAGE_PHOTOS} photos allowed.`, 'error')
    if (rejected.length) showToast(rejected[0] + (rejected.length > 1 ? ` (+${rejected.length - 1} more)` : ''), 'error')
    const added = accepted.slice(0, Math.max(0, room)).map(file => ({
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

  return { photos, add, remove, reserved }
}
