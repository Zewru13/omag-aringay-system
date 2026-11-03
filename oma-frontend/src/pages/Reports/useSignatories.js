import { useEffect, useMemo, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { SIGNATORY_ROLES, resolvePick, signatureParams } from '../../utils/signatories.js'

// What the Signatories block on a report page holds: the saved list (loaded once), the dropdowns' values, and the query parameters those
// picks make for the PDF. Prepared by starts as the logged-in user; the other three start empty. Nothing is saved between visits.
const START = { prepared: 'me', checked: '', noted: '', approved: '' }

export function useSignatories() {
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [choices, setChoices] = useState(START)

  useEffect(() => {
    let alive = true
    api.get('/reports/signatories/')
      .then((r) => { if (alive) setList(Array.isArray(r.data) ? r.data : (r.data.results || [])) })
      .catch(() => { /* the block still works with just "me" */ })
    return () => { alive = false }
  }, [])

  const setChoice = (role, value) => setChoices((c) => ({ ...c, [role]: value }))
  const params = useMemo(() => {
    const selection = {}
    SIGNATORY_ROLES.forEach(({ value }) => { selection[value] = resolvePick(choices[value], list, user) })
    return signatureParams(selection)
  }, [choices, list, user])

  return { list, user, choices, setChoice, params }
}
