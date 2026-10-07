// Client-side mirror of the server password policy (accounts/validators.py + AUTH_PASSWORD_VALIDATORS), for instant
// feedback only. The server always re-validates on submit and is the source of truth.
//
// Policy: at least 8 characters, 1 capital letter, 1 special character (not a letter, digit or space) and 3 numbers,
// and not an obviously common or system-related password.

const LOCAL_DENYLIST_TERMS = [
  'aringay', 'omag', 'oma aringay', 'omaaringay', 'password', 'capstone',
  'municipalagriculturist', 'launion', 'la union', 'agriculturist',
]

// A short sample of the most common passwords; the server checks Django's full list.
const OBVIOUSLY_COMMON = [
  'password123', '123456789012345', 'qwertyuiopasdfgh', 'letmein12345678',
  'iloveyou12345678', 'football1234567', 'baseball1234567', 'princess123456',
]

const MIN_LENGTH = 8
const MIN_DIGITS = 3

// Each flag is true or false once something is typed, and null while the field is empty.
export function evaluatePassword(password) {
  const text = password || ''
  if (text.length === 0) return { length: null, capital: null, special: null, digits: null, notWeak: null }
  const chars = [...text]
  const lower = text.toLowerCase()
  return {
    length: chars.length >= MIN_LENGTH,
    capital: chars.some((ch) => ch !== ch.toLowerCase() && ch === ch.toUpperCase()),
    special: chars.some((ch) => !/[\p{L}\p{N}\s]/u.test(ch)),
    digits: chars.filter((ch) => /\p{Nd}/u.test(ch)).length >= MIN_DIGITS,
    notWeak: !LOCAL_DENYLIST_TERMS.some((term) => lower.includes(term)) && !OBVIOUSLY_COMMON.includes(lower),
  }
}

export const passwordMeetsRules = (password) => Object.values(evaluatePassword(password)).every((flag) => flag === true)
