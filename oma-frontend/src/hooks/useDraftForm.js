import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { DraftScope, browserStorage } from '../utils/draftScope.js'
import { draftKey } from '../utils/drafts.js'

// An unsaved draft for a form built from several separate useState fields, with almost no change to the form:
//   const draft = useDraftForm('log-catch')                          // which form (add a record's id when drafts of different records must not mix)
//   const [name, setName] = useDraftField(draft, 'name', '')         // instead of useState('')
//   <DraftBanner draft={draft} />   ...   draft.clear() once it is saved   ...   draft.discard() to start over
// The fields are kept together in this browser a moment after any of them changes (only while some field differs from its starting value), come
// back when the form is opened again, and are wiped by draft.clear() (saved), draft.discard() (start over) and on sign-out. A form that is one
// object, list or reducer can use useDraftState (hooks/useDraftState.js) instead. A chosen photo file cannot be kept: leave it a plain useState.
// `enabled: false` turns the draft off (a form that is only sometimes worth keeping). The bookkeeping lives in utils/draftScope.js.

export default function useDraftForm(name, { enabled = true } = {}) {
  const { user } = useAuth()
  const [scope] = useState(() => new DraftScope({ storage: browserStorage(), key: draftKey(user?.id, name), enabled }))
  const [restored, setRestored] = useState(scope.restored)

  useEffect(() => () => scope.leave(), [scope])

  // Saved: the draft is gone, and so is the "restored" note.
  const clear = useCallback(() => {
    scope.clear()
    setRestored(false)
  }, [scope])
  const discard = useCallback(() => {
    scope.discard()
    setRestored(false)
  }, [scope])

  return useMemo(() => ({ restored, clear, discard, scope }), [restored, clear, discard, scope])
}

// useState for one field of a form with a draft (see useDraftForm). `initial` may be a function, as for useState.
// `skip: true` leaves this field out of the draft (a plain useState): for a value the page fills in itself, such as the signed-in person's own record.
export function useDraftField(draft, field, initial, { skip = false } = {}) {
  const { scope } = draft
  const [start] = useState(initial)
  const [value, setValue] = useState(() => (skip ? start : scope.restore(field, start)))
  const set = useCallback((next) => {
    scope.resume()
    setValue(next)
  }, [scope])
  useEffect(() => {
    if (skip) return
    scope.register(field, value, start, () => setValue(start))
    scope.schedule()
  }, [scope, field, value, start, skip])
  return [value, set]
}
