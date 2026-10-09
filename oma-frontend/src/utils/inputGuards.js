// Pure guards for fields with a fixed format. Each takes whatever the user typed or pasted and returns the text
// the field should show, so wrong characters and extra length never get into the field. The backend enforces the
// same rules (core/validators.py), so a hand-made request cannot get around them either.

// Philippine mobile number: 09 followed by 9 digits. A pasted +63 917 123 4567, 639171234567 or 9171234567 is turned
// into 09171234567; typing is held to digits, a leading 0 and a 9 after it, at most 11 digits.
export const guardPhone = (raw) => {
  let digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 12) digits = `0${digits.slice(2)}`
  else if (digits.startsWith('9') && digits.length >= 10) digits = `0${digits}`
  if (digits[0] !== '0') return ''
  if (digits.length > 1 && digits[1] !== '9') digits = digits.slice(0, 1)
  return digits.slice(0, 11)
}

export const isPhoneComplete = (value) => /^09\d{9}$/.test(value || '')

// For a stored number shown in an edit form: an older number with dashes or spaces (0917-123-4567) opens in the plain
// format, but one that cannot be made complete is returned exactly as stored, so nothing is erased by opening a form.
export const tidyPhone = (raw) => {
  const guarded = guardPhone(raw)
  return isPhoneComplete(guarded) ? guarded : (raw ?? '')
}

// Email: no spaces, at most 254 characters (the address length limit).
export const guardEmail = (raw) => String(raw ?? '').replace(/\s+/g, '').slice(0, 254)

// A decimal number typed as text: digits and one dot, no more than `decimals` after the dot, no minus sign unless
// asked, and never above `max` (the value is clamped to it). A comma is a thousands separator when a dot is also
// present or when it splits the digits into groups of three (1,500 -> 1500); otherwise it is a decimal comma (1,5 -> 1.5).
// Exception: in a field with three or more decimals (areas, weights) a single group such as 2,500 is a decimal comma
// (2.500), because those values are small; several groups or a comma with a dot are still thousands separators.
export const guardDecimal = (raw, { decimals = 2, max = null, allowNegative = false } = {}) => {
  let text = String(raw ?? '')
  if (text.includes(',')) {
    const oneGroup = decimals >= 3 && /^\s*-?[1-9]\d{0,2},\d{3}\s*$/.test(text)
    const thousands = !oneGroup && (text.includes('.') || /^\s*-?[1-9]\d{0,2}(,\d{3})+\s*$/.test(text))
    text = thousands ? text.replace(/,/g, '') : text.replace(',', '.')
  }
  const negative = allowNegative && text.trim().startsWith('-')
  text = text.replace(/[^0-9.]/g, '')
  const dot = text.indexOf('.')
  if (dot !== -1) {
    const intPart = text.slice(0, dot)
    const frac = text.slice(dot + 1).split('.')[0].slice(0, Math.max(decimals, 0))
    text = decimals > 0 ? `${intPart}.${frac}` : intPart
  }
  if (max !== null && text !== '' && text !== '.' && Number(text) > max) text = String(max)
  return negative && text !== '' ? `-${text}` : text
}

// PhilSys number: 16 digits shown as NNNN-NNNN-NNNN-NNNN, hyphens inserted as the digits are typed.
export const guardPhilsys = (raw) => {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 16)
  return digits.match(/.{1,4}/g)?.join('-') ?? ''
}

export const isPhilsysComplete = (value) => /^\d{4}-\d{4}-\d{4}-\d{4}$/.test(value || '')

// Today's date as YYYY-MM-DD in the user's own timezone. toISOString() is UTC, which is still yesterday before 08:00
// in the Philippines, so a date picker capped with it would refuse today.
export const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
