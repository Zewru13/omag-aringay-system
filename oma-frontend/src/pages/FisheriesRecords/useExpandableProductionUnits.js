import { useCallback, useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'

// Expandable stocking rows (Fisheries Monitoring and Fisheries Forecasting): one row open at a time, its
// ponds/cages from GET /fisheries/stocking/<id>/production-units/ (StockingProductionUnitsView).
//
// `records` is the page's current row array. Loaded units are tied to that array, so any reload of the rows
// (filter, page, search, a recorded harvest or Health Log) discards them and the open row is fetched again.
// unitsState(id): undefined = loading, { status: 'ok', units, hasCycle } or { status: 'error' }.
export default function useExpandableProductionUnits(records) {
  const [expandedId, setExpandedId] = useState(null)
  const [cache, setCache] = useState({ records: null, byId: {} })

  const byId = cache.records === records ? cache.byId : {}
  const expandedState = expandedId != null ? byId[expandedId] : undefined

  const setEntry = useCallback((forRecords, recId, entry) => {
    setCache(prev => {
      const next = { ...(prev.records === forRecords ? prev.byId : {}) }
      if (entry) next[recId] = entry
      else delete next[recId]
      return { records: forRecords, byId: next }
    })
  }, [])

  // ONE request per expansion of a row that has nothing loaded yet; an error stays until Retry.
  useEffect(() => {
    if (expandedId == null || expandedState || !records.some(r => r.id === expandedId)) return undefined
    let cancelled = false
    api.get(`/fisheries/stocking/${expandedId}/production-units/`)
      .then(r => {
        if (!cancelled) setEntry(records, expandedId, { status: 'ok', units: r.data.units || [], hasCycle: Boolean(r.data.production_cycle) })
      })
      .catch(() => { if (!cancelled) setEntry(records, expandedId, { status: 'error' }) })
    return () => { cancelled = true }
  }, [expandedId, expandedState, records, setEntry])

  const retry = (recId) => setEntry(records, recId, null)   // drop the error -> the effect refetches
  const toggle = (rec) => {
    if (expandedId === rec.id) { setExpandedId(null); return }
    if (byId[rec.id]?.status === 'error') retry(rec.id)
    setExpandedId(rec.id)
  }

  return { expandedId, unitsState: (recId) => byId[recId], toggle, retry }
}
