import { useCallback, useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { accountKind } from './accountNav.js'
import { orgDomain } from './myOrganization.js'

// The signed-in organization's own record (members, equipment, officers, officer history), read once per page. `state` is
// 'loading' | 'failed' | 'ready'; `reload()` reads it again after a save, keeping what is on screen until the answer is in.
export default function useMyOrganization() {
  const auth = useAuth()
  const domain = orgDomain(accountKind(auth))
  const id = auth.user?.linked_record?.id
  const [org, setOrg] = useState(null)
  const [state, setState] = useState('loading')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!id) return undefined
    let cancelled = false
    api.get(`/organizations/${domain.type}/${id}/`)
      .then((res) => { if (!cancelled) { setOrg(res.data); setState('ready') } })
      .catch(() => { if (!cancelled) setState('failed') })
    return () => { cancelled = true }
  }, [domain.type, id, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const retry = useCallback(() => { setState('loading'); setVersion((v) => v + 1) }, [])
  return { org, state, reload, retry, domain, id }
}
