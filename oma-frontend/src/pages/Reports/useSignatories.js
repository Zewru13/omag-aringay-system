import { useEffect, useMemo, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { editSigner, pickSavedSigner, signatureParams, signerRows } from '../../utils/signatories.js'

// What the Signatories block on a report page holds: the saved list (loaded once), one { name, position } per signing role, and the query
// parameters those rows make for the PDF. Prepared by starts as the logged-in user with the position of their kind of account (Administrator,
// Focal Person); the other three start empty; every box can be edited in the Signatories window. Nothing is saved between visits.
export function useSignatories() {
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [edits, setEdits] = useState({})

  useEffect(() => {
    let alive = true
    api.get('/reports/signatories/')
      .then((r) => { if (alive) setList(Array.isArray(r.data) ? r.data : (r.data.results || [])) })
      .catch(() => { /* the window still works with typed names */ })
    return () => { alive = false }
  }, [])

  const rows = useMemo(() => signerRows(user, edits), [user, edits])
  const setField = (role, field, value) => setEdits((e) => editSigner(e, role, field, value))
  const pickSaved = (role, value) => setEdits((e) => pickSavedSigner(e, role, list, value))
  const params = useMemo(() => signatureParams(rows), [rows])

  return { list, user, rows, setField, pickSaved, params }
}
