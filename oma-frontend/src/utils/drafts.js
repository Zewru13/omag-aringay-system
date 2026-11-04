// Unsaved drafts of the long forms (Add Farm Parcels, Register Farmer, the assistance windows...): what a person typed is kept in this
// browser while they look at another page, so it is still there when they come back, and is cleared when it is saved, discarded, or
// the person signs out. Pure functions over a localStorage-like object (getItem, setItem, removeItem, key, length) so they can be tested on
// their own; every one of them survives storage that is blocked or full (the form then just works without a draft).
const PREFIX = 'omag.draft.'

export const draftKey = (userId, name) => `${PREFIX}${userId ?? 'anon'}.${name}`

// What is stored: JSON, where a chosen file (which cannot be kept) becomes null, or is left out of a list of files.
const isFile = (v) => typeof File !== 'undefined' && v instanceof File
export function encodeDraft(value) {
  return JSON.stringify(value, (_key, v) => (Array.isArray(v) ? v.filter((item) => !isFile(item)) : isFile(v) ? null : v))
}

export function saveDraft(storage, key, value) {
  try { storage.setItem(key, encodeDraft(value)) } catch { /* storage blocked or full: no draft */ }
}

export function loadDraft(storage, key) {
  try {
    const text = storage.getItem(key)
    return text === null || text === undefined ? null : JSON.parse(text)
  } catch {
    return null
  }
}

export function clearDraft(storage, key) {
  try { storage.removeItem(key) } catch { /* nothing to clear */ }
}

// A draft only counts when it differs from the blank form (as it would be stored).
export const isDirty = (value, blank) => encodeDraft(value) !== encodeDraft(blank)

// A form made of several separate fields keeps its draft as one object { field: value } (hooks/useDraftForm.js). A field takes its saved value
// back only when that is the same kind of value as the field starts with (text for text, a list for a list), so a form that changed since
// the draft was kept never gets something it cannot use. A saved null (a chosen file, which cannot be kept) never replaces a starting value.
const kindOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v)

export function restoreField(saved, field, initial) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !(field in saved)) return initial
  const value = saved[field]
  if (value === null || value === undefined) return initial
  return kindOf(initial) === 'null' || kindOf(value) === kindOf(initial) ? value : initial
}

// registry: Map of field name -> { value, initial }.
export function fieldValues(registry) {
  const values = {}
  registry.forEach((entry, field) => { values[field] = entry.value })
  return values
}

export function isFieldDraft(registry) {
  const initials = {}
  registry.forEach((entry, field) => { initials[field] = entry.initial })
  return registry.size > 0 && isDirty(fieldValues(registry), initials)
}

// The new row of a settings table (components/UI/InlineAddRow.jsx) is kept only once something is typed in it: an empty new row is not a draft.
export const rowForDraft = (row, blank) => (row === null || row === undefined || !isDirty(row, blank) ? null : row)

// The saved new row, with every box the row needs; null when nothing usable was saved.
export function restoreRow(saved, blank) {
  const row = restoreField(saved, 'row', null)
  return row && typeof row === 'object' && !Array.isArray(row) ? { ...blank, ...row } : null
}

// The names of one person's drafts.
export function listDrafts(storage, userId) {
  const prefix = draftKey(userId, '')
  const names = []
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key && key.startsWith(prefix)) names.push(key.slice(prefix.length))
    }
  } catch { /* blocked */ }
  return names
}

// Wipe one person's drafts (on sign-out), or everyone's when no one is named.
export function clearAllDrafts(storage, userId) {
  try {
    const keys = []
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key && key.startsWith(userId === undefined ? PREFIX : draftKey(userId, ''))) keys.push(key)
    }
    keys.forEach((key) => storage.removeItem(key))
  } catch { /* blocked */ }
}
