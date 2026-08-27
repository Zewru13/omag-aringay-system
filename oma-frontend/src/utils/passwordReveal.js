// One-time citizen-account password reveal, held client-side only —
// sessionStorage, never sent anywhere, never persisted server-side. The
// backend still generates and sets the real password and flips is_active
// exactly as before; this only solves the frontend losing its only copy of
// something staff still need to read aloud, across navigation and refresh.
//
// sessionStorage is browser-guaranteed tab/session-scoped already — it
// doesn't survive a closed tab and never crosses to a different browser
// session by itself. Confirmed (not assumed) there's no app-level fallback
// that would defeat that: every other use of storage in this app
// (api/axiosInstance.js, context/AuthContext.jsx, hooks/useRecordLock.js)
// touches localStorage only for JWT tokens, and components/Layout/
// PageLayout.jsx only for a sidebar-collapsed UI preference — nothing reads
// or writes these keys, and nothing syncs sessionStorage to localStorage
// anywhere in the app.

const TTL_MS = 15 * 60 * 1000 // 15 minutes — long enough to walk to a printer, short enough not to linger.

function storageKey(accountId) {
  return `pw_reveal_${accountId}`
}

export function storePasswordReveal(accountId, password) {
  try {
    sessionStorage.setItem(storageKey(accountId), JSON.stringify({ password, timestamp: Date.now() }))
  } catch {
    // sessionStorage unavailable (private-mode edge cases, storage full) —
    // the reveal just won't survive navigation this time; the on-screen
    // copy already displayed is unaffected.
  }
}

export function clearPasswordReveal(accountId) {
  try {
    sessionStorage.removeItem(storageKey(accountId))
  } catch { /* nothing to clear if storage isn't available */ }
}

// Returns { password, timestamp } if a still-valid reveal is stored for
// this account, otherwise null — clearing (not just ignoring) anything
// that's no longer valid, so a stale entry doesn't keep being re-checked.
//
// `lastLogin` is the citizen account's own last_login (from the backend,
// via citizen_account_info) — checked ahead of the time window because a
// genuine login makes the reveal moot regardless of how much of the 15
// minutes is left. This is the real signal the fix requires: last_login is
// only ever set by a successful LoginView POST, so a truthy value here
// means the citizen has actually logged in since this reveal was stored,
// not a frontend guess.
export function readPasswordReveal(accountId, lastLogin) {
  let raw
  try {
    raw = sessionStorage.getItem(storageKey(accountId))
  } catch {
    return null
  }
  if (!raw) return null

  if (lastLogin) {
    clearPasswordReveal(accountId)
    return null
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearPasswordReveal(accountId)
    return null
  }

  if (!parsed?.password || !parsed?.timestamp || Date.now() - parsed.timestamp > TTL_MS) {
    clearPasswordReveal(accountId)
    return null
  }

  return parsed
}
