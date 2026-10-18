// Hand-typed ID numbers (RSBSA, FishR): digits only, 20 at most, with the dashes put in as the person types.
// Mirrors core.idnumbers on the backend, which is what actually decides; this only keeps the box tidy.

export const MAX_ID_DIGITS = 20

// Group sizes for the first groups; whatever is typed after them stays in one last group.
export const RSBSA_GROUPS = [2, 2, 2, 3]
export const FISHR_GROUPS = [2, 2, 2, 4]

// "013302014058212" -> "01-33-02-014-058212"
export function formatIdNumber(raw, groups, maxDigits = MAX_ID_DIGITS) {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, maxDigits)
  const parts = []
  let at = 0
  for (const size of groups) {
    if (at >= digits.length) break
    parts.push(digits.slice(at, at + size))
    at += size
  }
  if (at < digits.length) parts.push(digits.slice(at))
  return parts.join('-')
}

// Numbers saved before this format was free (a "BF-" prefix, letters in the last group) are shown and edited as typed.
export const isLegacyIdNumber = (value) => /[^0-9-]/.test(String(value ?? ''))

export const digitCount = (value) => String(value ?? '').replace(/\D/g, '').length

// Digit groups with single dashes, 20 digits at most — or a legacy number already on file.
export function isValidIdNumber(value) {
  const v = String(value ?? '').trim()
  if (!v) return true
  if (isLegacyIdNumber(v)) return /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/.test(v)
  return /^\d+(-\d+)*$/.test(v) && digitCount(v) <= MAX_ID_DIGITS
}
