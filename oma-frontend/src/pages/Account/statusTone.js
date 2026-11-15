// The four badge tones of the farmer, fisherfolk and organization accounts, and the one place that says which tone a status takes:
// green = fine or done, amber = waiting on someone, red = a problem, grey = finished, not started, or unknown.
export const TONES = ['green', 'amber', 'red', 'grey']

const BY_TONE = {
  green: ['PLANTED', 'STOCKED', 'GROWING', 'ACTIVE', 'CONFIRMED', 'RECEIVED', 'RESOLVED', 'BORROWED', 'GOOD', 'RECOVERED'],
  amber: ['NEAR HARVEST', 'READY TO HARVEST', 'AWAITING CONFIRMATION', 'REQUESTED', 'RETURN PENDING', 'NEEDS REPAIR', 'LATE', 'WAITING', 'DUE TODAY'],
  red: ['OVERDUE', 'NOT RECEIVED', 'TOTAL LOSS', 'REJECTED', 'BROKEN', 'LOST', 'NOT OPERATIONAL'],
}
const TONE_OF = Object.fromEntries(Object.entries(BY_TONE).flatMap(([tone, names]) => names.map((name) => [name, tone])))

// 'AWAITING_CONFIRMATION', 'Awaiting Confirmation' and 'awaiting confirmation' are the same status.
const normal = (status) => String(status ?? '').replace(/_/g, ' ').trim().toUpperCase()

export const toneOf = (status) => TONE_OF[normal(status)] || 'grey'
