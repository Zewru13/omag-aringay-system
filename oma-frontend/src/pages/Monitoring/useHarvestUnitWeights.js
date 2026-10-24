import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'

// The kg-per-unit settings ([{ unit, crop_type, kg_per_unit, note }]), loaded once per visit and shared by every harvest form that
// converts a quantity. `null` while they load (a form then asks nothing and shows nothing); `[]` if they cannot be loaded, in which
// case only kg converts and the server still decides everything.
let cached = null
let pending = null

export const resetHarvestUnitWeights = () => { cached = null; pending = null }

export default function useHarvestUnitWeights() {
  const [weights, setWeights] = useState(cached)
  useEffect(() => {
    if (cached) return undefined
    let alive = true
    pending = pending || api.get('/production/harvest-unit-weights/').then((r) => {
      cached = Array.isArray(r.data) ? r.data : (r.data?.results || [])
      return cached
    }).catch(() => { pending = null; return [] })
    pending.then((list) => { if (alive) setWeights(list) })
    return () => { alive = false }
  }, [])
  return weights
}
