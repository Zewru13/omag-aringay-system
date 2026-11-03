import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'

// The units each assistance type offers in the quantity box of one domain ('crop' or 'fisheries'), as a map type -> units, from
// GET /interventions/assistance-type-units/ (set in Assistance Settings). Loaded once per domain per visit and shared; `null` while it
// loads (or if it cannot be loaded: the form then offers every unit). Assistance Settings calls resetAssistanceTypeUnits after a save.
const cache = {}
const pending = {}

export const resetAssistanceTypeUnits = () => { Object.keys(cache).forEach((k) => delete cache[k]); Object.keys(pending).forEach((k) => delete pending[k]) }

export default function useAssistanceTypeUnits(domain) {
  const [byType, setByType] = useState(cache[domain] || null)
  useEffect(() => {
    if (cache[domain]) { setByType(cache[domain]); return undefined }   // eslint-disable-line react-hooks/set-state-in-effect
    let alive = true
    pending[domain] = pending[domain] || api.get('/interventions/assistance-type-units/', { params: { domain } })
      .then((r) => { cache[domain] = Object.fromEntries(r.data.map((row) => [row.assistance_type, row.units])); return cache[domain] })
      .catch(() => { delete pending[domain]; return null })
    pending[domain].then((data) => { if (alive && data) setByType(data) })
    return () => { alive = false }
  }, [domain])
  return byType
}
