import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'

// The dropdown lists of the assistance forms of one domain ('crop' or 'fisheries'): seed, fertilizer, equipment, unit (crop) and feed,
// fingerling, gear, equipment, unit (fisheries), from GET /interventions/assistance-choices/. Loaded once per domain per visit and shared;
// `null` while it loads (or if it cannot be loaded: a form then offers only what a record already has).
const cache = {}
const pending = {}

export const resetAssistanceChoices = () => { Object.keys(cache).forEach((k) => delete cache[k]); Object.keys(pending).forEach((k) => delete pending[k]) }

export default function useAssistanceChoices(domain) {
  const [choices, setChoices] = useState(cache[domain] || null)
  useEffect(() => {
    if (cache[domain]) { setChoices(cache[domain]); return undefined }   // eslint-disable-line react-hooks/set-state-in-effect
    let alive = true
    pending[domain] = pending[domain] || api.get('/interventions/assistance-choices/', { params: { domain } })
      .then((r) => { cache[domain] = r.data; return cache[domain] })
      .catch(() => { delete pending[domain]; return null })
    pending[domain].then((data) => { if (alive && data) setChoices(data) })
    return () => { alive = false }
  }, [domain])
  return choices
}
