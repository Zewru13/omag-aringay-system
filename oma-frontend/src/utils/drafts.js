// Unsaved drafts of the long forms (Add Farm Parcels, Register Farmer, the assistance windows...): what a person typed is kept in this
// browser while they look at another page, so it is still there when they come back, and is cleared when it is saved, discarded, or
// the person signs out. Pure functions over a localStorage-like object (getItem, setItem, removeItem, key, length) so they can be tested on
// their own; every one of them survives storage that is blocked or full (the form then just works without a draft).
const PREFIX = 'omag.draft.'

export const draftKey = (userId, name) => `${PREFIX}${userId ?? 'anon'}.${name}`

// What is stored: JSON, where a chosen file (which cannot be kept) becomes null.
export function encodeDraft(value) {
  return JSON.stringify(value, (_key, v) => (typeof File !== 'undefined' && v instanceof File ? null : v))
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
