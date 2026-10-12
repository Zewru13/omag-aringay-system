import { useCallback, useMemo, useState } from 'react'
import { allSelected, keepValid, toggleAll, toggleId } from './orgConfirmSelection.js'

// The members picked on an organization's "Confirm for Members" list. `records` is the list as loaded; whatever was
// picked but is no longer on it (confirmed meanwhile) or can no longer be picked drops out by itself.
export default function useConfirmSelection(records) {
  const [picked, setPicked] = useState(() => new Set())
  const selected = useMemo(() => keepValid(picked, records), [picked, records])
  const toggle = useCallback((id) => setPicked((prev) => toggleId(keepValid(prev, records), id)), [records])
  const toggleEvery = useCallback(() => setPicked((prev) => toggleAll(keepValid(prev, records), records)), [records])
  const clear = useCallback(() => setPicked(new Set()), [])
  return {
    selected,
    count: selected.size,
    selectedRecords: useMemo(() => records.filter((r) => selected.has(r.id)), [records, selected]),
    allPicked: allSelected(selected, records),
    toggle,
    toggleEvery,
    clear,
  }
}
