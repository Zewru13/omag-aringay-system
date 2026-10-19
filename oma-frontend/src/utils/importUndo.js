// Helpers for the "Undo a recent import" panel (backend: core/import_batch_views.py). The server decides what is safe
// to remove; these only count, slice and describe.

export const MAX_ITEMS_PER_CALL = 100   // the server refuses more than this per undo call

export function sliceIds(ids, size = MAX_ITEMS_PER_CALL) {
  const slices = []
  for (let i = 0; i < ids.length; i += size) slices.push(ids.slice(i, i + size))
  return slices
}

// The preview: how many records an undo would remove or restore, and how many it would keep.
export function summarizePlan(items) {
  const canUndo = items.filter((i) => i.can_undo).length
  return { total: items.length, canUndo, kept: items.length - canUndo }
}

// What an undo run did, from the server's per-item results.
export function summarizeResults(results) {
  const counts = { removed: 0, restored: 0, kept: 0, skipped: 0 }
  for (const r of results) if (r.result in counts) counts[r.result] += 1
  return counts
}

// Things an undo cannot take back, shown before the person confirms.
export function undoNote(type) {
  if (type === 'farmers_org' || type === 'fisherfolk_org') {
    return 'Undo removes the organizations and their unused logins, but emails already sent with a temporary password cannot be taken back.'
  }
  if (type === 'crop_assistance' || type === 'fisheries_assistance') {
    return 'Undo removes the assistance records, but notifications already delivered to recipients cannot be taken back.'
  }
  return ''
}
