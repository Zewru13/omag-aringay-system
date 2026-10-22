import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'

// The managed list of source agencies ([{ id, name, is_active }]), loaded once per visit and shared by every form and filter
// that asks for it. `null` while it loads (or if it cannot be loaded: the forms then offer only what a record already has).
let cached = null
let pending = null

export const resetAssistanceAgencies = () => { cached = null; pending = null }

export default function useAssistanceAgencies() {
  const [agencies, setAgencies] = useState(cached)
  useEffect(() => {
    if (cached) return undefined
    let alive = true
    pending = pending || api.get('/interventions/agencies/').then((r) => {
      cached = Array.isArray(r.data) ? r.data : (r.data?.results || [])
      return cached
    }).catch(() => { pending = null; return null })
    pending.then((list) => { if (alive && list) setAgencies(list) })
    return () => { alive = false }
  }, [])
  return agencies
}
