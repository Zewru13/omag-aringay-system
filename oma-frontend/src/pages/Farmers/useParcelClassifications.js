import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'

// The managed list of parcel classifications ([{ id, name, is_active }]), loaded once per visit and shared by every form that
// asks for it. `null` while it loads (or if it cannot be loaded: the forms then offer nothing to tick).
let cached = null
let pending = null

export const resetParcelClassifications = () => { cached = null; pending = null }

export default function useParcelClassifications() {
  const [classifications, setClassifications] = useState(cached)
  useEffect(() => {
    if (cached) return undefined
    let alive = true
    pending = pending || api.get('/farmers/parcel-classifications/').then((r) => {
      cached = Array.isArray(r.data) ? r.data : (r.data?.results || [])
      return cached
    }).catch(() => { pending = null; return null })
    pending.then((list) => { if (alive && list) setClassifications(list) })
    return () => { alive = false }
  }, [])
  return classifications
}
