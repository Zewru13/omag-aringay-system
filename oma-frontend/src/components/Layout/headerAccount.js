// The pure parts of the top bar's account area.
import { formatDateWithWeekday, formatTime } from '../../utils/dateFormat.js'

const CITIZEN_TYPES = {
  FARMER: 'Farmer',
  FISHERFOLK: 'Fisherfolk',
  FARMERS_ORG: 'Farmers Cooperative',
  FISHERFOLK_ORG: 'Fisherfolk Cooperative',
}

// The type of account, shown under the person's name.
export function accountTypeLabel(user) {
  if (!user) return ''
  if (user.role === 'ADMIN') return 'Admin'
  if (user.role === 'EVALUATOR') return 'Focal Person'
  return CITIZEN_TYPES[user.linked_record_type] || 'Account'
}

// "Thursday, Nov 26, 2026 · 11:20 PM". `timeZone` is for tests; the page shows the reader's own.
export function headerDateTime(now, { timeZone } = {}) {
  return `${formatDateWithWeekday(now, { timeZone })} · ${formatTime(now, { timeZone })}`
}
