import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'

// "Add assistance" in the ⋮ menu of an organization table (Organizations > Farmers' / Fisherfolk Organizations) lands on the assistance page as
// ?distribute=<organization id>: this reads it, fetches that organization and hands it over as { id, name, barangay } so the Distribute window
// opens with the organization already chosen. `done()` forgets it (and clears the address) once the window is closed. `kind` is 'farmers' | 'fisherfolk'.
export default function useDistributeLink(kind) {
  const [searchParams, setSearchParams] = useSearchParams()
  const id = Number(searchParams.get('distribute')) || null
  const [org, setOrg] = useState(null)

  useEffect(() => {
    if (!id) return undefined
    let alive = true
    api.get(`/organizations/${kind}/${id}/`)
      .then((r) => alive && setOrg({ id: r.data.id, name: r.data.name, barangay: r.data.barangay }))
      .catch(() => alive && setOrg(null))
    return () => { alive = false }
  }, [kind, id])

  const done = useCallback(() => {
    setOrg(null)
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('distribute'); return next }, { replace: true })
  }, [setSearchParams])

  return { org: id ? org : null, done }
}
