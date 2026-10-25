import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'

// The crop catalog, seed sources and varieties the rows choose from.
export function useCropFormLookups() {
  const [cropTypes, setCropTypes] = useState([])
  const [seedSources, setSeedSources] = useState([])
  const [varieties, setVarieties] = useState([])
  useEffect(() => {
    const list = (r) => (Array.isArray(r.data) ? r.data : (r.data.results || []))
    api.get('/production/crop-types/').then(r => setCropTypes(list(r).filter(ct => ct.is_active !== false)))
    api.get('/production/seed-sources/').then(r => setSeedSources(list(r)))
    api.get('/production/varieties/').then(r => setVarieties(list(r)))
  }, [])
  return { cropTypes, seedSources, varieties }
}
