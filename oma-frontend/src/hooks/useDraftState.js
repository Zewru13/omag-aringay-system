import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { clearDraft, draftKey, isDirty, loadDraft, saveDraft } from '../utils/drafts.js'

// useState for a long form whose unsaved work must survive leaving the page: `const [value, setValue, draft] = useDraftState(name, makeBlank)`.
// The value starts from the saved draft when there is one (draft.restored says so), is saved to this browser a moment after every change
// (only while it differs from the blank form), and is dropped by draft.clear() once the form is saved or draft.discard() to start over.
// `name` says which form (add the farmer's id or the like when drafts of different records must not mix). `enabled: false` turns it off.
const SAVE_AFTER_MS = 400

export default function useDraftState(name, makeBlank, { enabled = true } = {}) {
  const { user } = useAuth()
  const key = draftKey(user?.id, name)
  const [blank] = useState(makeBlank)   // the empty form, to tell a draft from nothing
  const [state, setState] = useState(() => {
    const saved = enabled ? loadDraft(localStorage, key) : null
    return { value: saved ?? makeBlank(), restored: saved !== null }
  })
  const latest = useRef(state.value)
  const stopped = useRef(false)   // set once the form is saved or discarded: nothing more is written for it
  useEffect(() => { latest.current = state.value })

  const setValue = useCallback((next) => {
    stopped.current = false
    setState((s) => ({ ...s, value: typeof next === 'function' ? next(s.value) : next }))
  }, [])

  const persist = useCallback(() => {
    if (!enabled || stopped.current) return
    if (isDirty(latest.current, blank)) saveDraft(localStorage, key, latest.current)
    else clearDraft(localStorage, key)
  }, [enabled, key, blank])

  useEffect(() => {
    const timer = setTimeout(persist, SAVE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [state.value, persist])

  // Leaving the page within the delay still keeps what was typed.
  useEffect(() => persist, [persist])

  const clear = useCallback(() => {
    stopped.current = true
    clearDraft(localStorage, key)
  }, [key])

  const discard = useCallback(() => {
    stopped.current = true
    clearDraft(localStorage, key)
    setState({ value: makeBlank(), restored: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return [state.value, setValue, { restored: state.restored, clear, discard }]
}
